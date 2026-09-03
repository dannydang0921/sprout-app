const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- Photo uploads ---
const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `user-${req.params.userId}-${Date.now()}${ext}`);
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

// --- Users (stand-in for auth: pick "who am I" from a list) ---
app.get('/api/users', (req, res) => {
  const users = db.prepare('SELECT id, name, role, department, avatar_url FROM users').all();
  res.json(users);
});

// --- Full profile (for the edit-your-own-profile screen) ---
app.get('/api/profile/:id', (req, res) => {
  const id = parseId(req.params.id);
  const user = id && db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'not found' });
  res.json(user);
});

app.put('/api/profile/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (!id || !userExists(id)) return res.status(404).json({ error: 'not found' });
  const { headline, bio, department, tags, availability } = req.body;
  db.prepare(`
    UPDATE users SET headline = ?, bio = ?, department = ?, tags = ?, availability = ?
    WHERE id = ?
  `).run(headline || '', bio || '', department || '', tags || '', availability || '', id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  res.json(user);
});

app.post('/api/profile/:userId/photo', upload.single('photo'), (req, res) => {
  const userId = parseId(req.params.userId);
  if (!userId || !userExists(userId)) return res.status(404).json({ error: 'not found' });
  if (!req.file) return res.status(400).json({ error: 'no file uploaded' });
  const avatarUrl = `/uploads/${req.file.filename}`;
  db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatarUrl, userId);
  res.json({ avatar_url: avatarUrl });
});

// --- Discover: candidates the given user hasn't swiped on yet ---
app.get('/api/discover/:userId', (req, res) => {
  const userId = parseId(req.params.userId);
  if (!userId || !userExists(userId)) return res.status(404).json({ error: 'not found' });
  const candidates = db.prepare(`
    SELECT * FROM users
    WHERE id != ?
    AND id NOT IN (SELECT target_id FROM swipes WHERE swiper_id = ?)
  `).all(userId, userId);
  res.json(candidates);
});

// --- Swipe: like or pass. Creates a match if the other person already liked you. ---
app.post('/api/swipe', (req, res) => {
  const swiperId = parseId(req.body.swiperId);
  const targetId = parseId(req.body.targetId);
  if (!swiperId || !targetId) return res.status(400).json({ error: 'valid swiperId and targetId required' });
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

// --- Matches for a user ---
app.get('/api/matches/:userId', (req, res) => {
  const userId = parseId(req.params.userId);
  if (!userId || !userExists(userId)) return res.status(404).json({ error: 'not found' });
  const rows = db.prepare(`
    SELECT u.* FROM matches m
    JOIN users u ON u.id = (CASE WHEN m.user_a = ? THEN m.user_b ELSE m.user_a END)
    WHERE m.user_a = ? OR m.user_b = ?
  `).all(userId, userId, userId);
  res.json(rows);
});

// --- Messages between two users (polling-friendly: pass ?after=<id> to get only new ones) ---
app.get('/api/messages/:userId/:otherId', (req, res) => {
  const userId = parseId(req.params.userId);
  const otherId = parseId(req.params.otherId);
  const after = Number(req.query.after || 0);
  if (!userId || !otherId || !Number.isInteger(after) || after < 0) {
    return res.status(400).json({ error: 'valid user ids and after are required' });
  }
  if (!userExists(userId) || !userExists(otherId)) return res.status(404).json({ error: 'user not found' });
  const rows = db.prepare(`
    SELECT * FROM messages
    WHERE id > ?
    AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
    ORDER BY id ASC
  `).all(after, userId, otherId, otherId, userId);
  res.json(rows);
});

app.post('/api/messages', (req, res) => {
  const senderId = parseId(req.body.senderId);
  const receiverId = parseId(req.body.receiverId);
  const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
  if (!senderId || !receiverId || !text) return res.status(400).json({ error: 'valid senderId, receiverId, and text required' });
  if (senderId === receiverId) return res.status(400).json({ error: 'cannot message yourself' });
  if (!userExists(senderId) || !userExists(receiverId)) return res.status(404).json({ error: 'user not found' });
  const result = db.prepare(
    'INSERT INTO messages (sender_id, receiver_id, text) VALUES (?, ?, ?)'
  ).run(senderId, receiverId, text);
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);
  res.json(row);
});

// Unread count per user, useful for a notification badge
app.get('/api/notifications/:userId', (req, res) => {
  const userId = parseId(req.params.userId);
  if (!userId || !userExists(userId)) return res.status(404).json({ error: 'not found' });
  const unread = db.prepare(
    'SELECT COUNT(*) AS c FROM messages WHERE receiver_id = ? AND read = 0'
  ).get(userId).c;
  res.json({ unread });
});

app.post('/api/messages/read', (req, res) => {
  const userId = parseId(req.body.userId);
  const otherId = parseId(req.body.otherId);
  if (!userId || !otherId) return res.status(400).json({ error: 'valid user ids required' });
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

app.post('/api/posts', (req, res) => {
  const authorId = parseId(req.body.authorId);
  const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
  if (!authorId || !text) return res.status(400).json({ error: 'valid authorId and text required' });
  if (!userExists(authorId)) return res.status(404).json({ error: 'user not found' });
  const result = db.prepare('INSERT INTO posts (author_id, text) VALUES (?, ?)').run(authorId, text);
  res.json({ id: result.lastInsertRowid });
});

app.post('/api/posts/:id/like', (req, res) => {
  const postId = parseId(req.params.id);
  const userId = parseId(req.body.userId);
  if (!postId || !userId) return res.status(400).json({ error: 'valid post id and userId required' });
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
