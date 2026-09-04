const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');

const dbPath = path.join(__dirname, 'sprout.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('professor','tutor','peer')),
  department TEXT,
  headline TEXT,
  bio TEXT,
  tags TEXT,
  availability TEXT,
  avatar_url TEXT,
  email TEXT,
  password_hash TEXT,
  academic_year TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  verification_token_hash TEXT,
  verification_expires_at TEXT,
  password_reset_token_hash TEXT,
  password_reset_expires_at TEXT
);

CREATE TABLE IF NOT EXISTS swipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  swiper_id INTEGER NOT NULL,
  target_id INTEGER NOT NULL,
  liked INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(swiper_id, target_id),
  FOREIGN KEY(swiper_id) REFERENCES users(id),
  FOREIGN KEY(target_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_a INTEGER NOT NULL,
  user_b INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_a, user_b)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  read INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS post_likes (
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  PRIMARY KEY(post_id, user_id)
);
`);

// Lightweight migration: add any new columns to an existing db from before
// this feature existed, so people who already ran the app don't lose data.
const existingCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
const wantedCols = {
  headline: "TEXT",
  availability: "TEXT",
  avatar_url: "TEXT",
  email: "TEXT",
  password_hash: "TEXT",
  academic_year: "TEXT",
  email_verified: "INTEGER NOT NULL DEFAULT 0",
  verification_token_hash: "TEXT",
  verification_expires_at: "TEXT",
  password_reset_token_hash: "TEXT",
  password_reset_expires_at: "TEXT"
};
for (const [col, type] of Object.entries(wantedCols)) {
  if (!existingCols.includes(col)) {
    db.exec(`ALTER TABLE users ADD COLUMN ${col} ${type}`);
  }
}

// Seed data only if empty, so restarts don't duplicate
const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
if (userCount === 0) {
  const insertUser = db.prepare(
    `INSERT INTO users (name, role, department, headline, bio, tags, availability, avatar_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const seedUsers = [
    ['Dr. Elena Ruiz', 'professor', 'Computer Science', 'ML & databases, always down to talk grad school', 'Teach ML & databases. Happy to talk grad school, research assistantships, or career advice.', 'Machine Learning,Grad school,Office hours', 'Thu 2-4pm, or by appointment', 'https://i.pravatar.cc/300?img=47'],
    ['Marcus Webb', 'tutor', 'Calculus II & III', 'Breaking down proofs into plain English', 'Peer tutor, 3rd year Math major. I break down proofs into plain English.', 'Calc II,Calc III,Free sessions', 'Mon/Wed 4-6pm, Math Center', 'https://i.pravatar.cc/300?img=12'],
    ['Priya Nandan', 'peer', 'Junior, Biology', 'Pre-med, surviving gen-chem one exam at a time', 'Pre-med, looking for a study group and someone to split MCAT prep with.', 'Pre-med,MCAT,Study group', 'Weekends, flexible', 'https://i.pravatar.cc/300?img=32'],
    ['Prof. Daniel Osei', 'professor', 'Economics', 'Advising the investing club, first-gen grad', 'I advise the investing club and love talking internships in finance.', 'Internships,First-gen,Finance', 'Tue 1-3pm', 'https://i.pravatar.cc/300?img=53'],
    ['Sam Iqbal', 'tutor', 'Intro Physics', 'Mechanics & E&M, one problem set at a time', 'I tutor mechanics and E&M, mostly problem-set walkthroughs.', 'Physics I,Physics II,Problem sets', 'Fri 10am-12pm', 'https://i.pravatar.cc/300?img=68'],
    ['Aisha Thompson', 'peer', 'Sophomore, CS', 'Running a data structures study pod', 'Building a study pod for data structures. Also happy to swap resume feedback.', 'DS&A,Resume swap,Hackathons', 'Evenings, over Discord', 'https://i.pravatar.cc/300?img=25'],
    ['You', 'peer', 'Freshman, Undeclared', 'New here, figuring things out', 'New here, figuring things out.', 'New student', '', null]
  ];
  const insertMany = db.transaction((rows) => {
    for (const r of rows) insertUser.run(...r);
  });
  insertMany(seedUsers);

  db.prepare(`INSERT INTO posts (author_id, text) VALUES (?, ?)`).run(1,
    'Reminder: office hours moved to Thursdays 2-4pm this semester. Bring your project ideas, not just bugs.');
  db.prepare(`INSERT INTO posts (author_id, text) VALUES (?, ?)`).run(2,
    'Tip for Calc III: draw the level curves before you touch the gradient. Half the confusion disappears once you can see the surface.');
  db.prepare(`INSERT INTO posts (author_id, text) VALUES (?, ?)`).run(3,
    'Anyone else prepping for the MCAT this fall? Thinking of starting a Sunday study group at the library.');
}

// Existing databases predate authentication. Give every seeded account a
// deterministic development login without changing any profile data.
const accountUsers = db.prepare('SELECT id, email, password_hash FROM users').all();
const updateEmail = db.prepare('UPDATE users SET email = ? WHERE id = ?');
const updatePassword = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
const markVerified = db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?');
const setYear = db.prepare('UPDATE users SET academic_year = ? WHERE id = ?');
for (const user of accountUsers) {
  if (!user.email || !user.email.trim()) {
    updateEmail.run(`user-${user.id}@sprout.local`, user.id);
  }
  if (!user.password_hash) {
    updatePassword.run(bcrypt.hashSync(`sprout-dev-${user.id}`, 10), user.id);
  }
  // Existing seeded accounts use deterministic development emails and remain usable.
  if (user.id <= 7 && user.email === `user-${user.id}@sprout.local`) markVerified.run(user.id);
  const existingYear = db.prepare('SELECT academic_year FROM users WHERE id = ?').get(user.id).academic_year;
  if (!existingYear) {
    const profile = db.prepare('SELECT department FROM users WHERE id = ?').get(user.id);
    const match = profile && typeof profile.department === 'string'
      ? profile.department.match(/^(Freshman|Sophomore|Junior|Senior|Graduate),\s*(.+)$/)
      : null;
    if (match) {
      setYear.run(match[1], user.id);
      db.prepare('UPDATE users SET department = ? WHERE id = ?').run(match[2], user.id);
    }
  }
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)');

module.exports = db;
