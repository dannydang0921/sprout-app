const API = '/api';
const colors = ['#2F6E4F','#D9A441','#0C447C','#993C1D','#534AB7','#0F6E56'];
const colorFor = id => colors[id % colors.length];
const initials = n => n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
const roleLabel = r => r==='peer' ? 'Peer student' : r[0].toUpperCase()+r.slice(1);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[char]));

// Renders either a real uploaded photo or a colored initials circle as a fallback.
function avatarHtml(user, extraStyle=''){
  if (user.avatar_url){
    return `<img class="avatar" style="object-fit:cover;${extraStyle}" src="${escapeHtml(user.avatar_url)}" alt="${escapeHtml(user.name)}">`;
  }
  return `<div class="avatar" style="background:${colorFor(user.id)};${extraStyle}">${escapeHtml(initials(user.name))}</div>`;
}

let currentUser = null;
let currentUserId = null;
let discoverQueue = [];
let matches = [];
let activeTab = 'discover';
let openThreadWith = null;
let lastMsgId = 0;
let pollTimer = null;
let threadRequestToken = 0;

async function api(path, opts) {
  const request = opts ? {
    ...opts,
    credentials: 'same-origin',
    headers: {'Content-Type':'application/json', ...(opts.headers || {})},
    body: opts.body ? JSON.stringify(opts.body) : undefined
  } : { credentials: 'same-origin' };
  const res = await fetch(API + path, request);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || 'Request failed');
    error.status = res.status;
    throw error;
  }
  return data;
}

async function init(){
  document.querySelectorAll('nav.bottom button').forEach(b=>{
    b.addEventListener('click', () => {
      activeTab = b.dataset.tab;
      if (activeTab !== 'messages') openThreadWith = null;
      document.querySelectorAll('nav.bottom button').forEach(x=>x.classList.toggle('active', x===b));
      render();
    });
  });
  document.getElementById('logoutButton').addEventListener('click', logout);
  const params = new URLSearchParams(window.location.search);
  if (params.get('reset')) {
    authMode = 'reset';
    resetToken = params.get('reset');
    renderAuth();
    return;
  }
  if (params.get('verified')) {
    authNotice = 'Your email is confirmed. You can log in now.';
    window.history.replaceState({}, '', window.location.pathname);
  }
  await refreshSession();
}

async function refreshSession(){
  let sessionUser;
  try {
    sessionUser = await api('/auth/me');
  } catch (err) {
    if (err.status && err.status !== 401) console.error(err);
    currentUser = null;
    currentUserId = null;
    stopPolling();
    document.querySelector('nav.bottom').style.display = 'none';
    document.getElementById('logoutButton').style.display = 'none';
    renderAuth();
    return;
  }
  currentUser = sessionUser;
  currentUserId = currentUser.id;
  document.querySelector('nav.bottom').style.display = 'flex';
  document.getElementById('logoutButton').style.display = 'inline-block';
  try {
    await loadForCurrentUser();
    startPolling();
  } catch (err) {
    if (err.status === 401) {
      currentUser = null;
      currentUserId = null;
      stopPolling();
      document.querySelector('nav.bottom').style.display = 'none';
      document.getElementById('logoutButton').style.display = 'none';
      renderAuth();
    } else {
      console.error(err);
      document.getElementById('screen').innerHTML = '<div class="empty"><span class="big">Sprout is taking a moment</span>Please refresh to try again.</div>';
    }
  }
}

function stopPolling(){
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

async function loadForCurrentUser(){
  discoverQueue = await api('/discover');
  matches = await api('/matches');
  await refreshUnread();
  render();
}

async function refreshUnread(){
  const { unread } = await api('/notifications');
  const badge = document.getElementById('unreadBadge');
  if (unread > 0) { badge.style.display = 'inline-block'; badge.textContent = unread; }
  else badge.style.display = 'none';
}

function startPolling(){
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    await refreshUnread();
    if (activeTab === 'messages' && openThreadWith) await pollThread(openThreadWith, true);
  }, 3000);
}

function render(){
  const el = document.getElementById('screen');
  if (!currentUser) return renderAuth();
  if (activeTab==='discover') el.innerHTML = discoverView();
  if (activeTab==='matches') el.innerHTML = matchesView();
  if (activeTab==='messages') { el.innerHTML = openThreadWith ? threadShell(openThreadWith) : messagesView(); if(openThreadWith) loadThread(openThreadWith); }
  if (activeTab==='feed') loadFeed();
  if (activeTab==='profile') loadProfile();
}

let authMode = 'login';
let authNotice = '';
let resetToken = '';
const departmentOptions = ['Computer Science', 'Biology', 'Economics', 'Mathematics', 'Physics', 'Undeclared', 'Other'];
const yearOptions = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate', 'Faculty', 'Other'];
const legacyDepartmentOptions = ['Calculus II & III', 'Intro Physics', 'CS'];

function selectOptions(options, selected, placeholder = 'Select one') {
  const values = [...new Set(options.concat(selected && !options.includes(selected) ? [selected] : []))];
  return `<option value="">${placeholder}</option>` + values.map(value =>
    `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(value)}</option>`
  ).join('');
}

function passwordField(id, label, autocomplete, confirm = false) {
  return `<label>${label}<span class="password-wrap"><input id="${id}" type="password" required minlength="8" maxlength="128" autocomplete="${autocomplete}"><button type="button" class="reveal" aria-label="Show password" onclick="togglePassword('${id}', this)">Show</button></span></label>` +
    (confirm ? `<label>Confirm password<span class="password-wrap"><input id="${id}Confirm" type="password" required minlength="8" maxlength="128" autocomplete="new-password"><button type="button" class="reveal" aria-label="Show password confirmation" onclick="togglePassword('${id}Confirm', this)">Show</button></span></label>` : '');
}

function renderAuth(){
  const el = document.getElementById('screen');
  const register = authMode === 'register';
  const forgot = authMode === 'forgot';
  const reset = authMode === 'reset';
  if (forgot) {
    el.innerHTML = `<div class="auth">
      <h1>Reset your password</h1><p>Enter your email and we’ll provide a secure reset link if an account exists.</p>
      <form onsubmit="submitForgot(event)">
        <label>Email<input id="authEmail" type="email" required maxlength="254" autocomplete="email"></label>
        <button type="submit">Send reset link</button><div id="authError" class="error">${escapeHtml(authNotice)}</div>
      </form><button class="switch" onclick="switchAuth('login')">Back to log in</button>
    </div>`;
    authNotice = '';
    return;
  }
  if (reset) {
    el.innerHTML = `<div class="auth">
      <h1>Choose a new password</h1><p>This secure link expires shortly and can only be used once.</p>
      <form onsubmit="submitReset(event)">
        ${passwordField('resetPassword', 'New password', 'new-password', true)}
        <button type="submit">Reset password</button><div id="authError" class="error">${escapeHtml(authNotice)}</div>
      </form>
    </div>`;
    authNotice = '';
    return;
  }
  el.innerHTML = `
    <div class="auth">
      <h1>${register ? 'Create your Sprout account' : 'Welcome back'}</h1>
      <p>${register ? 'Join your campus community and find people to learn with.' : 'Log in to continue building campus connections.'}</p>
      <form onsubmit="submitAuth(event)">
        ${register ? `<label>Name<input id="authName" required maxlength="100" autocomplete="name"></label>
          <label>Role<select id="authRole"><option value="peer">Peer student</option><option value="tutor">Tutor</option><option value="professor">Professor</option></select></label>
          <label>Department<select id="authDepartment" required>${selectOptions(departmentOptions, '')}</select></label>
          <label>Academic year<select id="authAcademicYear" required>${selectOptions(yearOptions, '')}</select></label>` : ''}
        <label>Email<input id="authEmail" type="email" required maxlength="254" autocomplete="email"></label>
        ${passwordField('authPassword', 'Password', register ? 'new-password' : 'current-password', register)}
        <button type="submit">${register ? 'Create account' : 'Log in'}</button>
        <div id="authError" class="error">${escapeHtml(authNotice)}</div>
      </form>
      ${!register ? "<button class=\"switch\" onclick=\"switchAuth('forgot')\">Forgot your password?</button>" : ''}
      ${!register ? '<button class="switch" onclick="resendVerification()">Resend verification email</button>' : ''}
      <button class="switch" onclick="switchAuth('${register ? 'login' : 'register'}')">${register ? 'Already have an account? Log in' : 'New to Sprout? Create an account'}</button>
    </div>`;
  authNotice = '';
}
function togglePassword(id, button) {
  const input = document.getElementById(id);
  input.type = input.type === 'password' ? 'text' : 'password';
  button.textContent = input.type === 'password' ? 'Show' : 'Hide';
  button.setAttribute('aria-label', input.type === 'password' ? 'Show password' : 'Hide password');
}
function switchAuth(mode) {
  authMode = mode;
  renderAuth();
}
function toggleAuthMode(){ switchAuth(authMode === 'login' ? 'register' : 'login'); }
async function submitAuth(event){
  event.preventDefault();
  const register = authMode === 'register';
  const body = {
    email: document.getElementById('authEmail').value,
    password: document.getElementById('authPassword').value
  };
  if (register) {
    body.name = document.getElementById('authName').value;
    body.role = document.getElementById('authRole').value;
    body.department = document.getElementById('authDepartment').value;
    body.academicYear = document.getElementById('authAcademicYear').value;
    body.passwordConfirmation = document.getElementById('authPasswordConfirm').value;
  }
  const error = document.getElementById('authError');
  error.textContent = '';
  try {
    const result = await api(register ? '/auth/register' : '/auth/login', {method:'POST', body});
    if (register) {
      authNotice = result.message;
      authMode = 'login';
      renderAuth();
      return;
    }
    currentUser = result;
    currentUserId = currentUser.id;
    document.querySelector('nav.bottom').style.display = 'flex';
    document.getElementById('logoutButton').style.display = 'inline-block';
    await loadForCurrentUser();
    startPolling();
  } catch (err) {
    error.textContent = err.message;
  }
}
async function resendVerification(){
  const email = document.getElementById('authEmail')?.value || '';
  const error = document.getElementById('authError');
  try {
    const result = await api('/auth/resend-verification', {method:'POST', body:{email}});
    error.textContent = result.message;
  } catch (err) {
    error.textContent = err.message;
  }
}
async function submitForgot(event){
  event.preventDefault();
  const error = document.getElementById('authError');
  try {
    const result = await api('/auth/forgot-password', {method:'POST', body:{email:document.getElementById('authEmail').value}});
    error.textContent = result.message;
  } catch (err) {
    error.textContent = err.message;
  }
}
async function submitReset(event){
  event.preventDefault();
  const error = document.getElementById('authError');
  const password = document.getElementById('resetPassword').value;
  const confirmation = document.getElementById('resetPasswordConfirm').value;
  if (password !== confirmation) {
    error.textContent = 'Passwords do not match.';
    return;
  }
  try {
    const result = await api('/auth/reset-password', {method:'POST', body:{token:resetToken, password, passwordConfirmation:confirmation}});
    authMode = 'login';
    authNotice = result.message;
    window.history.replaceState({}, '', window.location.pathname);
    renderAuth();
  } catch (err) {
    error.textContent = err.message;
  }
}
async function logout(){
  await api('/auth/logout', {method:'POST'});
  currentUser = null;
  currentUserId = null;
  openThreadWith = null;
  stopPolling();
  document.querySelector('nav.bottom').style.display = 'none';
  document.getElementById('logoutButton').style.display = 'none';
  renderAuth();
}

function discoverView(){
  if (discoverQueue.length===0){
    return `<div class="empty"><span class="big">You're all caught up</span>Check back later — new mentors and study partners join every week.</div>`;
  }
  const p = discoverQueue[discoverQueue.length-1];
  const tags = (p.tags||'').split(',').filter(Boolean);
  const photoInner = p.avatar_url
    ? `<img src="${escapeHtml(p.avatar_url)}" alt="${escapeHtml(p.name)}" style="width:100%;height:100%;object-fit:cover;">`
    : escapeHtml(initials(p.name));
  return `
    <div class="stack">
      <div class="swipecard">
        <div class="photo" style="background:${colorFor(p.id)}">${photoInner}</div>
        <div class="body">
          <h3>${escapeHtml(p.name)}</h3>
          <span class="roletag ${escapeHtml(p.role)}">${escapeHtml(roleLabel(p.role))}</span>
          ${p.headline ? `<p style="margin:0 0 8px;font-size:12.5px;color:var(--ivy-dark);font-weight:600;">${escapeHtml(p.headline)}</p>` : ''}
          <p class="bio">${escapeHtml(p.department)} — ${escapeHtml(p.bio)}</p>
          ${p.availability ? `<p style="margin:0 0 8px;font-size:12px;color:var(--muted);">🕐 ${escapeHtml(p.availability)}</p>` : ''}
          <div class="tagrow">${tags.map(t=>`<span>${escapeHtml(t)}</span>`).join('')}</div>
        </div>
      </div>
    </div>
    <div class="swipe-actions">
      <button class="pass" onclick="swipe(false)">✕</button>
      <button class="connect" onclick="swipe(true)">♥</button>
    </div>`;
}

async function swipe(liked){
  const p = discoverQueue.pop();
  if (!p) return;
  render();
  const { matched } = await api('/swipe', { method:'POST', body:{ targetId: p.id, liked } });
  if (matched){
    matches = await api('/matches');
    showMatchModal(p);
  }
}

function showMatchModal(p){
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="matchcard">
      <div class="stamp">It's a connection!</div>
      <div class="avatars">
        ${avatarHtml(currentUser)}
        ${avatarHtml(p)}
      </div>
      <p>${p.name} accepted your request. Start the conversation whenever you're ready.</p>
      <div class="btnrow">
        <button class="primary" onclick="goToThread(${p.id})">Send a message</button>
        <button class="ghost" onclick="closeOverlay()">Keep browsing</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}
function closeOverlay(){ document.querySelector('.overlay')?.remove(); render(); }
function goToThread(id){
  document.querySelector('.overlay')?.remove();
  activeTab = 'messages'; openThreadWith = id;
  document.querySelectorAll('nav.bottom button').forEach(x=>x.classList.toggle('active', x.dataset.tab==='messages'));
  render();
}

function matchesView(){
  if (matches.length===0) return `<div class="empty"><span class="big">No connections yet</span>Swipe right on Discover to request a connection.</div>`;
  return `<div class="section-title">Your connections</div>` + matches.map(p => `
    <div class="row" onclick="goToThread(${p.id})">
      ${avatarHtml(p)}
      <div class="info"><h4>${escapeHtml(p.name)}</h4><p>${escapeHtml(p.headline || p.department)}</p></div>
    </div>`).join('');
}

function messagesView(){
  if (matches.length===0) return `<div class="empty"><span class="big">No messages yet</span>Once you connect with someone, your chats show up here.</div>`;
  return `<div class="section-title">Messages</div>` + matches.map(p => `
    <div class="row" onclick="goToThread(${p.id})">
      ${avatarHtml(p)}
      <div class="info"><h4>${escapeHtml(p.name)}</h4><p>Tap to open conversation</p></div>
    </div>`).join('');
}

function threadShell(id){
  const p = matches.find(u=>u.id===id) || discoverQueue.find(u=>u.id===id) || { id, name: 'Connection', headline: '' };
  return `
    <div class="thread">
      <div class="thread-header">
        <button class="back" onclick="backFromThread()">←</button>
        ${avatarHtml(p, 'width:36px;height:36px;font-size:13px;')}
        <div><h4 style="margin:0;font-size:14.5px;">${escapeHtml(p.name)}</h4><p style="margin:0;font-size:12px;color:var(--muted);">${escapeHtml(p.headline || p.department)}</p></div>
      </div>
      <div class="bubbles" id="bubbles"></div>
      <div class="composer">
        <input id="msginput" placeholder="Write a message..." onkeydown="if(event.key==='Enter') sendMsg(${id})">
        <button onclick="sendMsg(${id})">Send</button>
      </div>
    </div>`;
}

async function loadThread(id){
  const requestToken = ++threadRequestToken;
  lastMsgId = 0;
  const msgs = await api(`/messages/${id}`);
  if (requestToken !== threadRequestToken || activeTab !== 'messages' || openThreadWith !== id) return;
  renderBubbles(msgs);
  await api('/messages/read', { method:'POST', body:{ otherId: id } });
  refreshUnread();
}

async function pollThread(id, append){
  const requestToken = threadRequestToken;
  const msgs = await api(`/messages/${id}?after=${lastMsgId}`);
  if (requestToken !== threadRequestToken || activeTab !== 'messages' || openThreadWith !== id) return;
  if (msgs.length) renderBubbles(msgs, append);
  api('/messages/read', { method:'POST', body:{ otherId: id } });
}

function renderBubbles(msgs, append){
  const el = document.getElementById('bubbles');
  if (!el) return;
  if (!append) el.innerHTML = '';
  msgs.forEach(m => {
    lastMsgId = Math.max(lastMsgId, m.id);
    const div = document.createElement('div');
    div.className = 'bubble ' + (m.sender_id === currentUserId ? 'me' : 'them');
    div.textContent = m.text;
    el.appendChild(div);
  });
  el.scrollTop = el.scrollHeight;
}

function backFromThread(){ openThreadWith = null; threadRequestToken++; render(); }

async function sendMsg(id){
  const input = document.getElementById('msginput');
  const text = input.value.trim();
  if (!text) return;
  const requestToken = threadRequestToken;
  input.value = '';
  const msg = await api('/messages', { method:'POST', body:{ receiverId: id, text } });
  if (requestToken !== threadRequestToken || activeTab !== 'messages' || openThreadWith !== id) return;
  renderBubbles([msg], true);
}

async function loadFeed(){
  const posts = await api('/posts');
  const el = document.getElementById('screen');
  el.innerHTML = `
    <div class="section-title">Campus tips</div>
    <div class="composer-box">
      <textarea id="newpost" placeholder="Share a tip, a resource, or a question..."></textarea>
      <div class="row2"><button onclick="addPost()">Post</button></div>
    </div>
    ${posts.map(post => `
      <div class="post">
        <div class="who">
          ${avatarHtml({id: post.author_id, name: post.author_name, avatar_url: post.author_avatar}, 'width:36px;height:36px;font-size:13px;')}
          <div><h4>${escapeHtml(post.author_name)}</h4><span class="roletag ${escapeHtml(post.author_role)}">${escapeHtml(roleLabel(post.author_role))}</span></div>
        </div>
        <p class="content">${escapeHtml(post.text)}</p>
        <div class="meta">
          <button onclick="toggleLike(${post.id})">♥ ${post.likes}</button>
        </div>
      </div>`).join('')}
  `;
}
async function addPost(){
  const ta = document.getElementById('newpost');
  const text = ta.value.trim();
  if (!text) return;
  await api('/posts', { method:'POST', body:{ text } });
  loadFeed();
}
async function toggleLike(id){
  await api(`/posts/${id}/like`, { method:'POST' });
  loadFeed();
}

async function loadProfile(){
  const p = await api('/profile');
  const el = document.getElementById('screen');
  el.innerHTML = `
    <div class="section-title">Your profile</div>
    <div class="post" style="text-align:center;">
      <div style="display:flex;justify-content:center;margin-bottom:10px;">
        ${avatarHtml(p, 'width:88px;height:88px;font-size:28px;')}
      </div>
      <label style="display:inline-block;font-size:12.5px;color:var(--ivy-dark);font-weight:600;cursor:pointer;border:1px solid var(--line);padding:6px 14px;border-radius:999px;">
        Change photo
        <input type="file" id="photoInput" accept="image/*" style="display:none;">
      </label>
      <p id="photoStatus" style="font-size:12px;color:var(--muted);margin:8px 0 0;"></p>
    </div>
    <div class="composer-box" style="display:flex;flex-direction:column;gap:10px;">
      <div>
        <label style="font-size:11.5px;color:var(--muted);">Headline (short one-liner)</label>
        <input id="f_headline" value="${escapeHtml(p.headline)}" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-family:'Inter';font-size:13.5px;">
      </div>
      <div>
        <label style="font-size:11.5px;color:var(--muted);">Department</label>
        <select id="f_department" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-family:'Inter';font-size:13.5px;">
          ${selectOptions(departmentOptions.concat(legacyDepartmentOptions), p.department || '')}
        </select>
      </div>
      <div>
        <label style="font-size:11.5px;color:var(--muted);">Academic year</label>
        <select id="f_academicYear" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-family:'Inter';font-size:13.5px;">
          ${selectOptions(yearOptions, p.academic_year || '')}
        </select>
      </div>
      <div>
        <label style="font-size:11.5px;color:var(--muted);">Bio</label>
        <textarea id="f_bio" style="width:100%;height:70px;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-family:'Inter';font-size:13.5px;resize:vertical;">${escapeHtml(p.bio)}</textarea>
      </div>
      <div>
        <label style="font-size:11.5px;color:var(--muted);">Tags (comma-separated)</label>
        <input id="f_tags" value="${escapeHtml(p.tags)}" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-family:'Inter';font-size:13.5px;">
      </div>
      <div>
        <label style="font-size:11.5px;color:var(--muted);">Availability</label>
        <input id="f_availability" value="${escapeHtml(p.availability)}" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-family:'Inter';font-size:13.5px;">
      </div>
      <div class="row2"><button onclick="saveProfile()">Save profile</button></div>
      <p id="saveStatus" style="font-size:12px;color:var(--ivy-dark);margin:0;"></p>
    </div>
    <div class="danger-zone">
      <div><strong>Delete account</strong><p>This permanently removes your profile, posts, messages, matches, and likes.</p></div>
      <button class="danger" onclick="deleteAccount()">Delete account</button>
    </div>
  `;

  document.getElementById('photoInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const statusEl = document.getElementById('photoStatus');
    statusEl.textContent = 'Uploading...';
    const formData = new FormData();
    formData.append('photo', file);
    try {
      const res = await fetch(`${API}/profile/photo`, { method: 'POST', body: formData, credentials: 'same-origin' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      statusEl.textContent = 'Photo updated!';
      currentUser.avatar_url = data.avatar_url;
      loadProfile();
    } catch (err) {
      statusEl.textContent = err.message;
    }
  });
}

async function saveProfile(){
  const body = {
    headline: document.getElementById('f_headline').value.trim(),
    department: document.getElementById('f_department').value.trim(),
    academicYear: document.getElementById('f_academicYear').value,
    bio: document.getElementById('f_bio').value.trim(),
    tags: document.getElementById('f_tags').value.trim(),
    availability: document.getElementById('f_availability').value.trim(),
  };
  currentUser = await api('/profile', { method: 'PUT', body });
  document.getElementById('saveStatus').textContent = 'Saved.';
}

async function deleteAccount(){
  if (!window.confirm('Delete your Sprout account permanently? This cannot be undone.')) return;
  try {
    await api('/account', { method:'DELETE' });
    currentUser = null;
    currentUserId = null;
    openThreadWith = null;
    stopPolling();
    document.querySelector('nav.bottom').style.display = 'none';
    document.getElementById('logoutButton').style.display = 'none';
    authNotice = 'Your account has been deleted.';
    authMode = 'login';
    renderAuth();
  } catch (err) {
    const status = document.getElementById('saveStatus');
    if (status) status.textContent = err.message;
  }
}

init();
