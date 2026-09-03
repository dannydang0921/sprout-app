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

let currentUserId = null;
let users = [];
let discoverQueue = [];
let matches = [];
let activeTab = 'discover';
let openThreadWith = null;
let lastMsgId = 0;
let pollTimer = null;
let threadRequestToken = 0;

async function api(path, opts) {
  const res = await fetch(API + path, opts && {
    ...opts,
    headers: {'Content-Type':'application/json'},
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  return res.json();
}

async function init(){
  users = await api('/users');
  const switcher = document.getElementById('userSwitcher');
  switcher.innerHTML = users.map(u => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('');
  currentUserId = users[users.length-1].id; // default to the seeded "You" account
  switcher.value = currentUserId;
  switcher.addEventListener('change', () => {
    currentUserId = Number(switcher.value);
    openThreadWith = null;
    threadRequestToken++;
    loadForCurrentUser();
  });

  document.querySelectorAll('nav.bottom button').forEach(b=>{
    b.addEventListener('click', () => {
      activeTab = b.dataset.tab;
      if (activeTab !== 'messages') openThreadWith = null;
      document.querySelectorAll('nav.bottom button').forEach(x=>x.classList.toggle('active', x===b));
      render();
    });
  });

  await loadForCurrentUser();
  startPolling();
}

async function loadForCurrentUser(){
  discoverQueue = await api(`/discover/${currentUserId}`);
  matches = await api(`/matches/${currentUserId}`);
  await refreshUnread();
  render();
}

async function refreshUnread(){
  const { unread } = await api(`/notifications/${currentUserId}`);
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
  if (activeTab==='discover') el.innerHTML = discoverView();
  if (activeTab==='matches') el.innerHTML = matchesView();
  if (activeTab==='messages') { el.innerHTML = openThreadWith ? threadShell(openThreadWith) : messagesView(); if(openThreadWith) loadThread(openThreadWith); }
  if (activeTab==='feed') loadFeed();
  if (activeTab==='profile') loadProfile();
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
  const { matched } = await api('/swipe', { method:'POST', body:{ swiperId: currentUserId, targetId: p.id, liked } });
  if (matched){
    matches = await api(`/matches/${currentUserId}`);
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
        ${avatarHtml(users.find(u=>u.id===currentUserId))}
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
  const p = users.find(u=>u.id===id);
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
  const msgs = await api(`/messages/${currentUserId}/${id}`);
  if (requestToken !== threadRequestToken || activeTab !== 'messages' || openThreadWith !== id) return;
  renderBubbles(msgs);
  await api('/messages/read', { method:'POST', body:{ userId: currentUserId, otherId: id } });
  refreshUnread();
}

async function pollThread(id, append){
  const requestToken = threadRequestToken;
  const msgs = await api(`/messages/${currentUserId}/${id}?after=${lastMsgId}`);
  if (requestToken !== threadRequestToken || activeTab !== 'messages' || openThreadWith !== id) return;
  if (msgs.length) renderBubbles(msgs, append);
  api('/messages/read', { method:'POST', body:{ userId: currentUserId, otherId: id } });
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
  const msg = await api('/messages', { method:'POST', body:{ senderId: currentUserId, receiverId: id, text } });
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
  await api('/posts', { method:'POST', body:{ authorId: currentUserId, text } });
  loadFeed();
}
async function toggleLike(id){
  await api(`/posts/${id}/like`, { method:'POST', body:{ userId: currentUserId } });
  loadFeed();
}

async function loadProfile(){
  const p = await api(`/profile/${currentUserId}`);
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
        <label style="font-size:11.5px;color:var(--muted);">Department / year</label>
        <input id="f_department" value="${escapeHtml(p.department)}" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-family:'Inter';font-size:13.5px;">
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
  `;

  document.getElementById('photoInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const statusEl = document.getElementById('photoStatus');
    statusEl.textContent = 'Uploading...';
    const formData = new FormData();
    formData.append('photo', file);
    try {
      const res = await fetch(`${API}/profile/${currentUserId}/photo`, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      statusEl.textContent = 'Photo updated!';
      const idx = users.findIndex(u => u.id === currentUserId);
      if (idx > -1) users[idx].avatar_url = data.avatar_url;
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
    bio: document.getElementById('f_bio').value.trim(),
    tags: document.getElementById('f_tags').value.trim(),
    availability: document.getElementById('f_availability').value.trim(),
  };
  await api(`/profile/${currentUserId}`, { method: 'PUT', body });
  document.getElementById('saveStatus').textContent = 'Saved.';
}

init();
