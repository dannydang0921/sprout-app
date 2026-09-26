const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const bcrypt = require('bcrypt');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const db = require('./db');
const { storageAdapter } = require('./services/storageService');

const app = express();
const PORT = process.env.PORT || 3001;
// Configure CORS
let allowedOrigins;
if (process.env.CORS_ORIGINS) {
  allowedOrigins = process.env.CORS_ORIGINS.split(',').map(origin => origin.trim());
} else {
  if (process.env.NODE_ENV === 'production') {
    // In production, if not set, allow any origin but warn
    allowedOrigins = true;
    console.warn('WARNING: CORS_ORIGINS is not set in production. Allowing any origin ( insecure ). Please set CORS_ORIGINS environment variable with a comma-separated list of allowed origins.');
  } else {
    allowedOrigins = [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`];
  }
}
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins === true) {
      // Allow any origin
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
    return callback(new Error(msg), false);
  },
  credentials: true
}));
app.use(express.json());
app.use((req, res, next) => {
  if (!req.body || typeof req.body !== 'object') req.body = {};
  next();
});
// Helmet helps secure Express apps by setting various HTTP headers
app.use(helmet({
  // Configure Content Security Policy as needed for your app
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false
}));

// Require SESSION_SECRET in production, allow fallback only in development
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret && process.env.NODE_ENV === 'production') {
  console.warn('WARNING: SESSION_SECRET is not set in production. Using a fallback secret which is insecure. Please set SESSION_SECRET environment variable.');
  sessionSecret = 'sprout-development-session-secret-change-me';
}
app.use(session({
  secret: sessionSecret || 'sprout-development-session-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 30
  }
}));
 // Rate limiting to prevent brute force attacks
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { error: 'Too many requests from this IP, please try again later.' }
});

// Apply rate limiting to all API routes
app.use('/api/', apiLimiter);

app.use(express.static(path.join(__dirname, '..', 'public')));

// --- Photo uploads ---
// Configure uploads directory (allows for cloud storage abstraction in future)
const uploadsDir = path.join(__dirname, '..', 'public',
  process.env.UPLOADS_DIR || 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// Use memory storage for multer to work with both local and cloud storage adapters
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype);
    cb(ok ? null : new Error('Only image files are allowed'), ok);
  }
});

const TOKEN_TTL_MS = 60 * 60 * 1000;
const DEPARTMENTS = ['Computer Science', 'Biology', 'Economics', 'Mathematics', 'Physics', 'Undeclared', 'Other'];
// Legacy department options for validation during migration period
const LEGACY_DEPARTMENTS = ['Calculus II & III', 'Intro Physics', 'CS', 'Junior, Biology'];
const ACADEMIC_YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate', 'Faculty', 'Other'];

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
    SELECT id, name, role, department, academic_year, headline, bio, tags, availability, avatar_url, email,
      email_verified,
      has_seen_tutorial
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

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createToken() {
  return crypto.randomBytes(32).toString('hex');
}

function appUrl(req, route, token) {
  const base = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  return `${base}${route}?token=${encodeURIComponent(token)}`;
}

function logDelivery(label, url) {
  // Only log delivery URLs in development to avoid exposing tokens in production logs
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[sprout] ${label}: ${url}`);
  }
}

function validChoice(value, choices) {
  return typeof value === 'string' && choices.includes(value);
}

function validProfileChoice(value, choices, legacyChoices = []) {
  return value === '' || validChoice(value, choices.concat(legacyChoices));
}

// --- Authentication ---
app.post('/api/auth/register', async (req, res, next) => {
  try {
    const email = normalizedEmail(req.body.email);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const passwordConfirmation = typeof req.body.passwordConfirmation === 'string' ? req.body.passwordConfirmation : '';
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const role = typeof req.body.role === 'string' ? req.body.role : 'peer';
    const department = typeof req.body.department === 'string' ? req.body.department.trim() : '';
    const academicYear = typeof req.body.academicYear === 'string' ? req.body.academicYear.trim() : '';
    if (!validEmail(email)) return res.status(400).json({ error: 'valid email is required' });
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: 'password must be 8-128 characters' });
    }
    if (password !== passwordConfirmation) return res.status(400).json({ error: 'passwords do not match' });
    if (!name || name.length > 100) return res.status(400).json({ error: 'name is required (100 characters max)' });
    if (!['professor', 'tutor', 'peer'].includes(role)) return res.status(400).json({ error: 'invalid role' });
    if (!validChoice(department, DEPARTMENTS)) return res.status(400).json({ error: 'select a valid department' });
    if (!validChoice(academicYear, ACADEMIC_YEARS)) return res.status(400).json({ error: 'select a valid academic year' });
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
      return res.status(409).json({ error: 'an account with that email already exists' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const verificationToken = createToken();
    const verificationExpiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
    const result = db.prepare(`
      INSERT INTO users (name, role, department, academic_year, headline, bio, tags, availability, avatar_url, email, password_hash,
        email_verified, verification_token_hash, verification_expires_at)
      VALUES (?, ?, ?, ?, '', '', '', '', NULL, ?, ?, 0, ?, ?)
    `).run(name, role, department, academicYear, email, passwordHash, tokenHash(verificationToken), verificationExpiresAt);
    logDelivery('Email verification URL', appUrl(req, '/api/auth/verify-email', verificationToken));
    res.status(201).json({
      requiresVerification: true,
      message: 'Account created. Use the verification link sent to your email before logging in. In development, it is printed in the server log.'
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const email = normalizedEmail(req.body.email);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!validEmail(email) || !password) return res.status(400).json({ error: 'email and password are required' });
    const user = db.prepare('SELECT id, password_hash, email_verified FROM users WHERE email = ?').get(email);
    if (!user || !user.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'invalid email or password' });
    }
    if (!user.email_verified) {
      return res.status(403).json({ error: 'please verify your email before logging in' });
    }
    await startSession(req, user.id);
    res.json(publicUser(user.id));
  } catch (err) {
    next(err);
  }
});

app.get('/api/auth/me', (req, res) => {
  const userId = parseId(req.session.userId);
  const user = userId && publicUser(userId);
  if (!user) return res.status(401).json({ error: 'authentication required' });
  res.json(user);
});

app.post('/api/auth/logout', (req, res, next) => {
  if (!req.session) return res.json({ ok: true });
  req.session.destroy(err => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

app.get('/api/auth/verify-email', (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const user = token && db.prepare(`
      SELECT id FROM users
      WHERE verification_token_hash = ? AND verification_expires_at > ?
    `).get(tokenHash(token), new Date().toISOString());
    if (!user) return res.status(400).json({ error: 'verification link is invalid or expired' });
    db.prepare(`
      UPDATE users SET email_verified = 1, verification_token_hash = NULL, verification_expires_at = NULL
      WHERE id = ?
    `).run(user.id);
    res.redirect('/?verified=1');
  });

app.post('/api/auth/resend-verification', async (req, res, next) => {
    try {
      const email = normalizedEmail(req.body.email);
      if (!validEmail(email)) return res.status(400).json({ error: 'valid email is required' });
      const user = db.prepare('SELECT id, email_verified FROM users WHERE email = ?').get(email);
      if (user && !user.email_verified) {
        const token = createToken();
        db.prepare(`
          UPDATE users SET verification_token_hash = ?, verification_expires_at = ?
          WHERE id = ?
        `).run(tokenHash(token), new Date(Date.now() + TOKEN_TTL_MS).toISOString(), user.id);
        logDelivery('Email verification URL', appUrl(req, '/api/auth/verify-email', token));
      }
      res.json({ message: 'If that account needs verification, a new link has been sent. In development, check the server log.' });
    } catch (err) {
      next(err);
    }
  });

app.post('/api/auth/forgot-password', (req, res, next) => {
    try {
      const email = normalizedEmail(req.body.email);
      if (!validEmail(email)) return res.status(400).json({ error: 'valid email is required' });
      const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (user) {
        const token = createToken();
        db.prepare(`
          UPDATE users SET password_reset_token_hash = ?, password_reset_expires_at = ?
          WHERE id = ?
        `).run(tokenHash(token), new Date(Date.now() + TOKEN_TTL_MS).toISOString(), user.id);
        logDelivery('Password reset URL', `${(process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '')}/?reset=${encodeURIComponent(token)}`);
      }
      res.json({ message: 'If an account exists for that email, a reset link has been sent. In development, check the server log.' });
    } catch (err) {
      next(err);
    }
  });

app.post('/api/auth/reset-password', async (req, res, next) => {
    try {
      const token = typeof req.body.token === 'string' ? req.body.token : '';
      const password = typeof req.body.password === 'string' ? req.body.password : '';
      const passwordConfirmation = typeof req.body.passwordConfirmation === 'string' ? req.body.passwordConfirmation : '';
      if (!token) return res.status(400).json({ error: 'reset token is required' });
      if (password.length < 8 || password.length > 128) {
        return res.status(400).json({ error: 'password must be 8-128 characters' });
      }
      if (password !== passwordConfirmation) return res.status(400).json({ error: 'passwords do not match' });
      const user = db.prepare(`
        SELECT id FROM users
        WHERE password_reset_token_hash = ? AND password_reset_expires_at > ?
      `).get(tokenHash(token), new Date().toISOString());
      if (!user) return res.status(400).json({ error: 'reset link is invalid or expired' });
      const passwordHash = await bcrypt.hash(password, 12);
      db.prepare(`
        UPDATE users SET password_hash = ?, password_reset_token_hash = NULL, password_reset_expires_at = NULL
        WHERE id = ?
      `).run(passwordHash, user.id);
      res.json({ message: 'Password reset. You can now log in.' });
    } catch (err) {
      next(err);
    }
  });

// --- Full profile (always the authenticated user's profile) ---
function profileResponse(req, res) {
  res.json(publicUser(req.currentUserId));
}
app.get('/api/profile', requireAuth, profileResponse);

app.put('/api/profile', requireAuth, (req, res) => {
  const id = req.currentUserId;
  const { headline, bio, department, academicYear, tags, availability } = req.body;
  if (![headline, bio, department, tags, availability].every(value => validText(value || '', 2000))) {
    return res.status(400).json({ error: 'profile fields are too long' });
  }
  if (!validProfileChoice(department || '', DEPARTMENTS, LEGACY_DEPARTMENTS) ||
      !validProfileChoice(academicYear || '', ACADEMIC_YEARS)) {
    return res.status(400).json({ error: 'select a valid department and academic year' });
  }
  db.prepare(`
    UPDATE users SET headline = ?, bio = ?, department = ?, academic_year = ?, tags = ?, availability = ?
    WHERE id = ?
  `).run(headline || '', bio || '', department || '', academicYear || '', tags || '', availability || '', id);
  res.json(publicUser(id));
});

app.post('/api/profile/:userId/photo', requireAuth, upload.single('photo'), async (req, res) => {
  const userId = req.currentUserId;
  if (!req.file) return res.status(400).json({ error: 'no file uploaded' });

  try {
    const filename = storageAdapter.generateFilename(req.file);
    const storageResult = await storageAdapter.saveFile(req.file, filename);
    const avatarUrl = storageResult.url;
    db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatarUrl, userId);
    res.json({ avatar_url: avatarUrl });
  } catch (err) {
    console.error('File upload error:', err);
    res.status(500).json({ error: 'File upload failed' });
  }
});

app.delete('/api/auth/delete-account', requireAuth, async (req, res, next) => {
  const userId = req.currentUserId;
  const user = db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(userId);
  try {
    const removeAccount = db.transaction(() => {
      db.prepare('DELETE FROM post_likes WHERE user_id = ? OR post_id IN (SELECT id FROM posts WHERE author_id = ?)').run(userId, userId);
      db.prepare('DELETE FROM posts WHERE author_id = ?').run(userId);
      db.prepare('DELETE FROM messages WHERE sender_id = ? OR receiver_id = ?').run(userId, userId);
      db.prepare('DELETE FROM swipes WHERE swiper_id = ? OR target_id = ?').run(userId, userId);
      db.prepare('DELETE FROM matches WHERE user_a = ? OR user_b = ?').run(userId, userId);
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    });
    removeAccount();
    if (user && typeof user.avatar_url === 'string' && user.avatar_url) {
      try {
        // For local storage, extract filename from /uploads/ URL
        // For Cloudinary, the storageAdapter handles URL to public ID conversion internally
        let filename = user.avatar_url;
        if (filename.startsWith('/uploads/')) {
          filename = path.basename(filename);
        }
        await storageAdapter.deleteFile(filename);
      } catch (err) {
        console.warn(`Failed to delete avatar file:`, err.message);
        // Continue with account deletion even if file deletion fails
      }
    }
    req.session.destroy(err => {
      if (err) return next(err);
      res.clearCookie('connect.sid');
      res.json({ ok: true });
    });
  } catch (err) {
    next(err);
  }
});

// --- Discover: candidates the authenticated user hasn't swiped on yet ---
app.get('/api/discover', requireAuth, (req, res) => {
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
app.get('/api/matches', requireAuth, (req, res) => {
  const userId = req.currentUserId;
  const { department, role, academicYear } = req.query;

  // Validate filter values using same pattern as profile updates
  const LEGACY_DEPARTMENTS = ['Calculus II & III', 'Intro Physics', 'CS', 'Junior, Biology'];
  const DEPARTMENTS = ['Computer Science', 'Biology', 'Economics', 'Mathematics', 'Physics', 'Undeclared', 'Other'];
  const ACADEMIC_YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate', 'Faculty', 'Other'];

  function validChoice(value, choices) {
    return typeof value === 'string' && choices.includes(value);
  }

  function validProfileChoice(value, choices, legacyChoices = []) {
    return value === '' || validChoice(value, choices.concat(legacyChoices));
  }

  if (department && !validProfileChoice(department, DEPARTMENTS, LEGACY_DEPARTMENTS)) {
    return res.status(400).json({ error: 'Invalid department filter' });
  }
  if (role && !validChoice(role, ['professor', 'tutor', 'peer'])) {
    return res.status(400).json({ error: 'Invalid role filter' });
  }
  if (academicYear && !validChoice(academicYear, ACADEMIC_YEARS)) {
    return res.status(400).json({ error: 'Invalid academic year filter' });
  }

  let query = `
    SELECT u.id, u.name, u.role, u.department, u.headline, u.bio, u.tags, u.availability, u.avatar_url
    FROM matches m
    JOIN users u ON (u.id = m.user_a OR u.id = m.user_b)
    WHERE (m.user_a = ? AND u.id = m.user_b) OR (m.user_b = ? AND u.id = m.user_a)
`;

  // Add filters
  if (department) {
    query += ' AND u.department = ?';
    params.push(department);
  }
  if (role) {
    query += ' AND u.role = ?';
    params.push(role);
  }
  if (academicYear) {
    query += ' AND u.academic_year = ?';
    params.push(academicYear);
  }

  const params = [userId, userId, userId, userId, userId];

  // Exclude users already swiped on (to mirror discover behavior)
  query += `
    AND id NOT IN (SELECT target_id FROM swipes WHERE swiper_id = ?)`;
  params.push(userId);

  query += ' ORDER BY name';

  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

// --- Search for users ---
app.get('/api/search', requireAuth, (req, res) => {
  const userId = req.currentUserId;
  const { q, department, role, academicYear, limit = 10 } = req.query;

  // Validate limit
  const parseLimit = parseInt(limit, 10);
  if (isNaN(parseLimit) || parseLimit < 1 || parseLimit > 50) {
    return res.status(400).json({ error: 'Limit must be between 1 and 50' });
  }

  // Validate filter values using same pattern as profile updates
  const LEGACY_DEPARTMENTS = ['Calculus II & III', 'Intro Physics', 'CS', 'Junior, Biology'];
  const DEPARTMENTS = ['Computer Science', 'Biology', 'Economics', 'Mathematics', 'Physics', 'Undeclared', 'Other'];
  const ACADEMIC_YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate', 'Faculty', 'Other'];

  function validChoice(value, choices) {
    return typeof value === 'string' && choices.includes(value);
  }

  function validProfileChoice(value, choices, legacyChoices = []) {
    return value === '' || validChoice(value, choices.concat(legacyChoices));
  }

  if (department && !validProfileChoice(department, DEPARTMENTS, LEGACY_DEPARTMENTS)) {
    return res.status(400).json({ error: 'Invalid department filter' });
  }
  if (role && !validChoice(role, ['professor', 'tutor', 'peer'])) {
    return res.status(400).json({ error: 'Invalid role filter' });
  }
  if (academicYear && !validChoice(academicYear, ACADEMIC_YEARS)) {
    return res.status(400).json({ error: 'Invalid academic year filter' });
  }

  let query = `
    SELECT id, name, role, department, headline, bio, tags, availability, avatar_url
    FROM users
    WHERE id != ?`;
  const params = [userId];

  // Add text search if query provided
  if (q) {
    query += ' AND (name LIKE ? OR department LIKE ? OR role LIKE ?)';
    const searchTerm = `%${q}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  // Add filters
  if (department) {
    query += ' AND department = ?';
    params.push(department);
  }
  if (role) {
    query += ' AND role = ?';
    params.push(role);
  }
  if (academicYear) {
    query += ' AND academic_year = ?';
    params.push(academicYear);
  }

  
  // Exclude users already swiped on (to mirror discover behavior)
  query += `
    AND id NOT IN (SELECT target_id FROM swipes WHERE swiper_id = ?)`;
  params.push(userId);

  query += ' ORDER BY name LIMIT ?';
  params.push(parseLimit);

  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

// --- Group Chat Endpoints ---

// Get all group chats for the authenticated user
app.get('/api/groupchats', requireAuth, (req, res) => {
  const userId = req.currentUserId;

  if (!userId) {
    return res.status(401).json({ error: 'authentication required' });
  }

  const query = `
    SELECT gc.id, gc.name, gc.created_by, gc.created_at,
           u.name as creator_name
    FROM group_chats gc
    JOIN group_members gm ON gc.id = gm.group_id
    JOIN users u ON gc.created_by = u.id
    WHERE gm.user_id = ?
    ORDER BY gc.created_at DESC
  `;

  const rows = db.prepare(query).all(userId);
  res.json(rows);
});

// Create a new group chat
app.post('/api/groupchats', requireAuth, (req, res) => {
  const userId = req.currentUserId;
  const { name } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'authentication required' });
  }

  if (!name || typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
    return res.status(400).json({ error: 'valid name (1-100 characters) required' });
  }

  const trimmedName = name.trim();

  // Insert the group chat
  const result = db.prepare(`
    INSERT INTO group_chats (name, created_by)
    VALUES (?, ?)
  `).run(trimmedName, userId);

  const groupId = result.lastInsertRowid;

  // Automatically add the creator as an admin member
  db.prepare(`
    INSERT INTO group_members (group_id, user_id, role)
    VALUES (?, ?, 'admin')
  `).run(groupId, userId);

  // Return the created group with creator info
  const group = db.prepare(`
    SELECT gc.id, gc.name, gc.created_by, gc.created_at,
           u.name as creator_name
    FROM group_chats gc
    JOIN users u ON gc.created_by = u.id
    WHERE gc.id = ?
  `).get(groupId);

  res.status(201).json(group);
});

// Get details of a specific group chat
app.get('/api/groupchats/:groupId', requireAuth, (req, res) => {
  const userId = req.currentUserId;
  const groupId = parseInt(req.params.groupId, 10);

  if (!userId) {
    return res.status(401).json({ error: 'authentication required' });
  }

  if (!groupId || isNaN(groupId)) {
    return res.status(400).json({ error: 'valid groupId required' });
  }

  // Check if user is a member of the group
  const membership = db.prepare(`
    SELECT id FROM group_members
    WHERE group_id = ? AND user_id = ?
  `).get(groupId, userId);

  if (!membership) {
    return res.status(403).json({ error: 'access denied: not a member of this group' });
  }

  const group = db.prepare(`
    SELECT gc.id, gc.name, gc.created_by, gc.created_at,
           u.name as creator_name,
           COUNT(gm.user_id) as member_count
    FROM group_chats gc
    JOIN users u ON gc.created_by = u.id
    LEFT JOIN group_members gm ON gc.id = gm.group_id
    WHERE gc.id = ?
    GROUP BY gc.id, gc.name, gc.created_by, gc.created_at, u.name
  `).get(groupId);

  if (!group) {
    return res.status(404).json({ error: 'group not found' });
  }

  res.json(group);
});

// Add a member to a group chat
app.post('/api/groupchats/:groupId/members', requireAuth, (req, res) => {
  const userId = req.currentUserId; // The user making the request (must be admin)
  const groupId = parseInt(req.params.groupId, 10);
  const { userIdToAdd } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'authentication required' });
  }

  if (!groupId || isNaN(groupId)) {
    return res.status(400).json({ error: 'valid groupId required' });
  }

  if (!userIdToAdd || isNaN(userIdToAdd)) {
    return res.status(400).json({ error: 'valid userIdToAdd required' });
  }

  // Check if the requesting user is an admin of the group
  const requesterMembership = db.prepare(`
    SELECT role FROM group_members
    WHERE group_id = ? AND user_id = ?
  `).get(groupId, userId);

  if (!requesterMembership || requesterMembership.role !== 'admin') {
    return res.status(403).json({ error: 'permission denied: only admins can add members' });
  }

  // Check if the user to add exists
  const userToAddExists = db.prepare(`
    SELECT id FROM users WHERE id = ?
  `).get(userIdToAdd);

  if (!userToAddExists) {
    return res.status(404).json({ error: 'user to add not found' });
  }

  // Check if the user to add is already in the group
  const existingMembership = db.prepare(`
    SELECT id FROM group_members
    WHERE group_id = ? AND user_id = ?
  `).get(groupId, userIdToAdd);

  if (existingMembership) {
    return res.status(400).json({ error: 'user is already a member of this group' });
  }

  
  try {
    // Add the user to the group
    db.prepare(`
      INSERT INTO group_members (group_id, user_id, role)
      VALUES (?, ?, 'member')
    `).run(groupId, userIdToAdd);

    res.json({ success: true });
  } catch (err) {
    console.error('Add group member error:', err);
    res.status(500).json({ error: 'Failed to add member to group' });
  }
});

// Remove a member from a group chat
app.delete('/api/groupchats/:groupId/members/:userIdToRemove', requireAuth, (req, res) => {
  const userId = req.currentUserId; // The user making the request (must be admin)
  const groupId = parseInt(req.params.groupId, 10);
  const userIdToRemove = parseInt(req.params.userIdToRemove, 10);

  if (!userId) {
    return res.status(401).json({ error: 'authentication required' });
  }

  if (!groupId || isNaN(groupId)) {
    return res.status(400).json({ error: 'valid groupId required' });
  }

  if (!userIdToRemove || isNaN(userIdToRemove)) {
    return res.status(400).json({ error: 'valid userIdToRemove required' });
  }

  // Check if the requesting user is an admin of the group
  const requesterMembership = db.prepare(`
    SELECT role FROM group_members
    WHERE group_id = ? AND user_id = ?
  `).get(groupId, userId);

  if (!requesterMembership || requesterMembership.role !== 'admin') {
    return res.status(403).json({ error: 'permission denied: only admins can remove members' });
  }

  // Prevent removing the last admin
  if (userIdToRemove === userId) {
    const adminCount = db.prepare(`
      SELECT COUNT(*) as count FROM group_members
      WHERE group_id = ? AND role = 'admin'
    `).get(groupId);

    if (adminCount.count <= 1) {
      return res.status(400).json({ error: 'cannot remove the last admin from the group' });
    }
  }

  // Check if the user to remove is actually in the group
  const membershipToRemove = db.prepare(`
    SELECT role FROM group_members
    WHERE group_id = ? AND user_id = ?
  `).get(groupId, userIdToRemove);

  if (!membershipToRemove) {
    return res.status(404).json({ error: 'user is not a member of this group' });
  }

  try {
    // Remove the user from the group
    db.prepare(`
      DELETE FROM group_members
      WHERE group_id = ? AND user_id = ?
    `).run(groupId, userIdToRemove);

    res.json({ success: true });
  } catch (err) {
    console.error('Remove group member error:', err);
    res.status(500).json({ error: 'Failed to remove member from group' });
  }
});

// Get members of a group chat
app.get('/api/groupchats/:groupId/members', requireAuth, (req, res) => {
  const userId = req.currentUserId;
  const groupId = parseInt(req.params.groupId, 10);

  if (!userId) {
    return res.status(401).json({ error: 'authentication required' });
  }

  if (!groupId || isNaN(groupId)) {
    return res.status(400).json({ error: 'valid groupId required' });
  }

  // Check if user is a member of the group
  const membership = db.prepare(`
    SELECT id FROM group_members
    WHERE group_id = ? AND user_id = ?
  `).get(groupId, userId);

  if (!membership) {
    return res.status(403).json({ error: 'access denied: not a member of this group' });
  }

  const members = db.prepare(`
    SELECT u.id, u.name, u.role, u.department, u.headline, u.avatar_url,
           gm.role as group_role, gm.joined_at
    FROM group_members gm
    JOIN users u ON gm.user_id = u.id
    WHERE gm.group_id = ?
    ORDER BY gm.joined_at ASC
  `).all(groupId);

  res.json(members);
});

// Send a message to a group chat
app.post('/api/groupchats/:groupId/messages', requireAuth, (req, res) => {
  const userId = req.currentUserId;
  const groupId = parseInt(req.params.groupId, 10);
  const { text } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'authentication required' });
  }

  if (!groupId || isNaN(groupId)) {
    return res.status(400).json({ error: 'valid groupId required' });
  }

  if (!text || typeof text !== 'string' || !text.trim() || text.trim().length > 4000) {
    return res.status(400).json({ error: 'valid text (1-4000 characters) required' });
  }

  const trimmedText = text.trim();

  // Check if user is a member of the group
  const membership = db.prepare(`
    SELECT id FROM group_members
    WHERE group_id = ? AND user_id = ?
  `).get(groupId, userId);

  if (!membership) {
    return res.status(403).json({ error: 'access denied: not a member of this group' });
  }

  
  try {
    // Insert the message
    const result = db.prepare(`
      INSERT INTO group_messages (group_id, sender_id, text)
      VALUES (?, ?, ?)
    `).run(groupId, userId, trimmedText);

    const messageId = result.lastInsertRowid;

    // Return the created message with sender info
    const message = db.prepare(`
      SELECT gm.id, gm.group_id, gm.sender_id, gm.text, gm.created_at,
             u.name as sender_name
      FROM group_messages gm
      JOIN users u ON gm.sender_id = u.id
      WHERE gm.id = ?
    `).get(messageId);

    res.status(201).json(message);
  } catch (err) {
    console.error('Send group message error:', err);
    res.status(500).json({ error: 'Failed to send message to group' });
  }
});

// Get messages from a group chat
app.get('/api/groupchats/:groupId/messages', requireAuth, (req, res) => {
  const userId = req.currentUserId;
  const groupId = parseInt(req.params.groupId, 10);
  const after = parseInt(req.query.after || '0', 10);

  if (!userId) {
    return res.status(401).json({ error: 'authentication required' });
  }

  if (!groupId || isNaN(groupId)) {
    return res.status(400).json({ error: 'valid groupId required' });
  }

  if (isNaN(after) || after < 0) {
    return res.status(400).json({ error: 'valid after parameter required (non-negative integer)' });
  }

  // Check if user is a member of the group
  const membership = db.prepare(`
    SELECT id FROM group_members
    WHERE group_id = ? AND user_id = ?
  `).get(groupId, userId);

  if (!membership) {
    return res.status(403).json({ error: 'access denied: not a member of this group' });
  }

  const messages = db.prepare(`
    SELECT gm.id, gm.group_id, gm.sender_id, gm.text, gm.created_at,
           u.name as sender_name
    FROM group_messages gm
    JOIN users u ON gm.sender_id = u.id
    WHERE gm.group_id = ? AND gm.id > ?
    ORDER BY gm.id ASC
    LIMIT 100
  `).all(groupId, after);

  res.json(messages);
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
app.get('/api/notifications', requireAuth, (req, res) => {
  const userId = req.currentUserId;
  const unread = db.prepare(
    'SELECT COUNT(*) AS c FROM messages m WHERE m.receiver_id = ? AND m.read = 0'
  ).get(userId, userId).c;
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

app.post("/api/tutorial/seen", requireAuth, (req, res) => {
  const userId = req.currentUserId;
  db.prepare("UPDATE users SET has_seen_tutorial = 1 WHERE id = ?").run(userId);
  res.json({ ok: true });
});

// --- Reporting and Blocking ---

app.post('/api/report', requireAuth, async (req, res) => {
  const reporterId = req.currentUserId;
  const { reportedId, reason, details } = req.body;

  // Validate input
  if (!reportedId || !reason) {
    return res.status(400).json({ error: 'reportedId and reason are required' });
  }

  if (!userExists(reporterId) || !userExists(reportedId)) {
    return res.status(404).json({ error: 'user not found' });
  }

  if (reporterId === reportedId) {
    return res.status(400).json({ error: 'cannot report yourself' });
  }

  try {
    db.prepare(`
      INSERT INTO reports (reporter_id, reported_id, reason, details)
      VALUES (?, ?, ?, ?)
    `).run(reporterId, reportedId, reason, details || null);

    res.json({ success: true });
  } catch (err) {
    console.error('Report error:', err);
    res.status(500).json({ error: 'Failed to submit report' });
  }
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

if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`Sprout server running at http://localhost:${PORT}`);
  });
}

// Graceful shutdown
const gracefulShutdown = () => {
  console.log('Received shutdown signal, closing server...');
  server.close(async (err) => {
    if (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
    // Close database connection
    db.close();
    console.log('Server and database connections closed.');
    process.exit(0);
  });
};

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Application specific logging, throwing an error, or other logic here
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  gracefulShutdown();
});

module.exports = app;