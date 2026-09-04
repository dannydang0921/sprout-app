const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcrypt');
const session = require('express-session');
const db = require('./db');

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use((req, res, next) => {
  if (!req.body || typeof req.body !== 'object') req.body = {};
  next();
});
app.use(session({
  secret: process.env.SESSION_SECRET || 'sprout-development-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 30
  }
}));
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- Photo uploads ---
const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `user-${req.session.userId}-${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype);
    cb(ok ? null : new Error('Only image files are allowed'), ok);
  }
});

const PORT = process.env.PORT || 3001;

function pairKey(a, b) {
  return a < b ? [a, b] : [b, a];
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function userExists(id) {
  return Boolean(db.prepare('SELECT 1 FROM users WHERE id = ?').get(id));
}

function publicUser(id) {
  return db.prepare(`
    SELECT id, name, role, department, headline, bio, tags, availability, avatar_url, email
    FROM users WHERE id = ?
  `).get(id);
}

function requireAuth(req, res, next) {
  const userId = parseId(req.session.userId);
  if (!userId || !userExists(userId)) {
    return res.status(401).json({ error: 'authentication required' });
  }
  req.currentUserId = userId;
  next();
}

function normalizedEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function validEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validText(value, max) {
  return typeof value === 'string' && value.trim().length <= max;
}

function startSession(req, userId) {
  return new Promise((resolve, reject) => {
    req.session.regenerate(err => {
      if (err) return reject(err);
      req.session.userId = userId;
      resolve();
    });
  });
}

// --- Authentication ---
app.post(['/api/auth/register', '/api/register'], async (req, res, next) => {
  try {
    const email = normalizedEmail(req.body.email);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const role = typeof req.body.role === 'string' ? req.body.role : 'peer';
    const department = typeof req.body.department === 'string' ? req.body.department.trim() : '';
    if (!validEmail(email)) return res.status(400).json({ error: 'valid email is required' });
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: 'password must be 8-128 characters' });
    }
    if (!name || name.length > 100) return res.status(400).json({ error: 'name is required (100 characters max)' });
    if (!['professor', 'tutor', 'peer'].includes(role)) return res.status(400).json({ error: 'invalid role' });
    if (!validText(department, 120)) return res.status(400).json({ error: 'department is too long' });
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
      return res.status(409).json({ error: 'an account with that email already exists' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const result = db.prepare(`
      INSERT INTO users (name, role, department, headline, bio, tags, availability, avatar_url, email, password_hash)
      VALUES (?, ?, ?, '', '', '', '', NULL, ?, ?)
    `).run(name, role, department, email, passwordHash);
    await startSession(req, result.lastInsertRowid);
    res.status(201).json(publicUser(result.lastInsertRowid));
  } catch (err) {
    next(err);
  }
});

app.post(['/api/auth/login', '/api/login'], async (req, res, next) => {
  try {
    const email = normalizedEmail(req.body.email);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!validEmail(email) || !password) return res.status(400).json({ error: 'email and password are required' });
    const user = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email);
    if (!user || !user.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'invalid email or password' });
    }
    await startSession(req, user.id);
    res.json(publicUser(user.id));
  } catch (err) {
    next(err);
  }
});

app.get(['/api/auth/me', '/api/me'], (req, res) => {
  const userId = parseId(req.session.userId);
  const user = userId && publicUser(userId);
  if (!user) return res.status(401).json({ error: 'authentication required' });
  res.json(user);
});

app.post(['/api/auth/logout', '/api/logout'], (req, res, next) => {
  if (!req.session) return res.json({ ok: true });
  req.session.destroy(err => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

// --- Full profile (always the authenticated user's profile) ---
function profileResponse(req, res) {
  res.json(publicUser(req.currentUserId));
}
app.get(['/api/profile', '/api/profile/:id'], requireAuth, profileResponse);

app.put(['/api/profile', '/api/profile/:id'], requireAuth, (req, res) => {
  const id = req.currentUserId;
  const { headline, bio, department, tags, availability } = req.body;
  if (![headline, bio, department, tags, availability].every(value => validText(value || '', 2000))) {
    return res.status(400).json({ error: 'profile fields are too long' });
  }
  db.prepare(`
    UPDATE users SET headline = ?, bio = ?, department = ?, tags = ?, availability = ?
    WHERE id = ?
  `).run(headline || '', bio || '', department || '', tags || '', availability || '', id);
  res.json(publicUser(id));
});

app.post(['/api/profile/photo', '/api/profile/:userId/photo'], requireAuth, upload.single('photo'), (req, res) => {
  const userId = req.currentUserId;
  if (!req.file) return res.status(400).json({ error: 'no file uploaded' });
  const avatarUrl = `/uploads/${req.file.filename}`;
  db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatarUrl, userId);
  res.json({ avatar_url: avatarUrl });
});

// --- Discover: candidates the authenticated user hasn't swiped on yet ---
app.get(['/api/discover', '/api/discover/:userId'], requireAuth, (req, res) => {
  const userId = req.currentUserId;
  const candidates = db.prepare(`
    SELECT id, name, role, department, headline, bio, tags, availability, avatar_url
    FROM users
    WHERE id != ?
    AND id NOT IN (SELECT target_id FROM swipes WHERE swiper_id = ?)
  `).all(userId, userId);
  res.json(candidates);
});

// --- Swipe: like or pass. Creates a match if the other person already liked you. ---
app.post('/api/swipe', requireAuth, (req, res) => {
  const swiperId = req.currentUserId;
  const targetId = parseId(req.body.targetId);
  if (!swiperId || !targetId) return res.status(400).json({ error: 'valid targetId required' });
  if (swiperId === targetId) return res.status(400).json({ error: 'cannot swipe on yourself' });
  if (!userExists(swiperId) || !userExists(targetId)) return res.status(404).json({ error: 'user not found' });
  const liked = req.body.liked === true;

  db.prepare(`
    INSERT INTO swipes (swiper_id, target_id, liked) VALUES (?, ?, ?)
    ON CONFLICT(swiper_id, target_id) DO UPDATE SET liked = excluded.liked
  `).run(swiperId, targetId, liked ? 1 : 0);

  let matched = false;
  if (liked) {
    const reciprocal = db.prepare(
      'SELECT * FROM swipes WHERE swiper_id = ? AND target_id = ? AND liked = 1'
    ).get(targetId, swiperId);

    if (reciprocal) {
      const [a, b] = pairKey(swiperId, targetId);
      db.prepare(
        'INSERT OR IGNORE INTO matches (user_a, user_b) VALUES (?, ?)'
      ).run(a, b);
      matched = true;
    }
  }
  res.json({ ok: true, matched });
});

// --- Matches for the authenticated user ---
app.get(['/api/matches', '/api/matches/:userId'], requireAuth, (req, res) => {
  const userId = req.currentUserId;
  const rows = db.prepare(`
    SELECT u.id, u.name, u.role, u.department, u.headline, u.bio, u.tags, u.availability, u.avatar_url
    FROM matches m
    JOIN users u ON u.id = (CASE WHEN m.user_a = ? THEN m.user_b ELSE m.user_a END)
    WHERE m.user_a = ? OR m.user_b = ?
  `).all(userId, userId, userId);
  res.json(rows);
});

// --- Messages between the authenticated user and another user ---
function messagesHandler(req, res) {
  const userId = req.currentUserId;
  const otherId = parseId(req.params.otherId);
  const after = Number(req.query.after || 0);
  if (!userId || !otherId || !Number.isInteger(after) || after < 0) {
    return res.status(400).json({ error: 'valid otherId and after are required' });
  }
  if (!userExists(userId) || !userExists(otherId)) return res.status(404).json({ error: 'user not found' });
  const rows = db.prepare(`
    SELECT * FROM messages
    WHERE id > ?
    AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
    ORDER BY id ASC
  `).all(after, userId, otherId, otherId, userId);
  res.json(rows);
}
app.get('/api/messages/:otherId', requireAuth, messagesHandler);
app.get('/api/messages/:userId/:otherId', requireAuth, messagesHandler);

app.post('/api/messages', requireAuth, (req, res) => {
  const senderId = req.currentUserId;
  const receiverId = parseId(req.body.receiverId);
  const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
  if (!senderId || !receiverId || !text || text.length > 4000) return res.status(400).json({ error: 'valid receiverId and text (4000 characters max) required' });
  if (senderId === receiverId) return res.status(400).json({ error: 'cannot message yourself' });
  if (!userExists(senderId) || !userExists(receiverId)) return res.status(404).json({ error: 'user not found' });
  const result = db.prepare(
    'INSERT INTO messages (sender_id, receiver_id, text) VALUES (?, ?, ?)'
  ).run(senderId, receiverId, text);
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);
  res.json(row);
});

// Unread count for the authenticated user, useful for a notification badge
app.get(['/api/notifications', '/api/notifications/:userId'], requireAuth, (req, res) => {
  const userId = req.currentUserId;
  const unread = db.prepare(
    'SELECT COUNT(*) AS c FROM messages WHERE receiver_id = ? AND read = 0'
  ).get(userId).c;
  res.json({ unread });
});

app.post('/api/messages/read', requireAuth, (req, res) => {
  const userId = req.currentUserId;
  const otherId = parseId(req.body.otherId);
  if (!userId || !otherId) return res.status(400).json({ error: 'valid otherId required' });
  if (!userExists(userId) || !userExists(otherId)) return res.status(404).json({ error: 'user not found' });
  db.prepare(
    'UPDATE messages SET read = 1 WHERE receiver_id = ? AND sender_id = ?'
  ).run(userId, otherId);
  res.json({ ok: true });
});

// --- Posts / tips feed ---
app.get('/api/posts', (req, res) => {
  const rows = db.prepare(`
    SELECT p.id, p.text, p.created_at, u.id AS author_id, u.name AS author_name, u.role AS author_role,
      u.avatar_url AS author_avatar,
      (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id) AS likes
    FROM posts p JOIN users u ON u.id = p.author_id
    ORDER BY p.id DESC
  `).all();
  res.json(rows);
});

app.post('/api/posts', requireAuth, (req, res) => {
  const authorId = req.currentUserId;
  const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
  if (!authorId || !text || text.length > 4000) return res.status(400).json({ error: 'valid post text (4000 characters max) required' });
  if (!userExists(authorId)) return res.status(404).json({ error: 'user not found' });
  const result = db.prepare('INSERT INTO posts (author_id, text) VALUES (?, ?)').run(authorId, text);
  res.json({ id: result.lastInsertRowid });
});

app.post('/api/posts/:id/like', requireAuth, (req, res) => {
  const postId = parseId(req.params.id);
  const userId = req.currentUserId;
  if (!postId || !userId) return res.status(400).json({ error: 'valid post id required' });
  if (!userExists(userId)) return res.status(404).json({ error: 'user not found' });
  if (!db.prepare('SELECT 1 FROM posts WHERE id = ?').get(postId)) {
    return res.status(404).json({ error: 'post not found' });
  }
  const existing = db.prepare('SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?').get(postId, userId);
  if (existing) {
    db.prepare('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?').run(postId, userId);
    res.json({ liked: false });
  } else {
    db.prepare('INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)').run(postId, userId);
    res.json({ liked: true });
  }
});

// Friendly JSON errors for upload failures (wrong file type, too large, etc.)
app.use((err, req, res, next) => {
  if (err) return res.status(400).json({ error: err.message });
  next();
});

app.listen(PORT, () => {
  console.log(`Sprout server running at http://localhost:${PORT}`);
});
