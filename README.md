# Sprout — campus connections

A Tinder-style app for connecting students with professors, tutors, and peers,
plus a tips/posts feed. Swipe right, get matched when it's mutual, message the
person, and share resources in the feed.

## Stack

- **Backend:** Node.js + Express + SQLite (via `better-sqlite3`) — the whole
  database is a single file (`server/sprout.db`), created and seeded
  automatically the first time you run the server. No separate database to
  install.
- **Frontend:** plain HTML/CSS/JS (no build step, no framework) served
  straight out of `public/`, talking to the backend over `fetch`.
- **Auth:** Full authentication system with email verification, password reset,
  and session management (replaces the original user-switcher dropdown).
- **Messaging:** simple polling every 3 seconds, not WebSockets. Good enough
  to feel responsive for an MVP; swap for Socket.IO later if you want instant
  delivery.

## Security & Reliability Improvements

The following enhancements have been made to improve security, scalability, and reliability:

### 🔒 Security
- **Session Secret Management**: Requires `SESSION_SECRET` environment variable in production (no insecure fallback)
- **Secure CORS Configuration**: Replaced dangerous origin reflection with explicit allowlist
- **Rate Limiting**: 100 requests per 15 minutes per IP on all API routes (prevents brute force/DoS)
- **Helmet Security Headers**: Added protection against XSS, clickjacking, MIME sniffing
- **Sensitive Data Protection**: Token URLs (email verification/password reset) only logged in development
- **Uploads Security**: Configurable uploads directory with filename sanitization to prevent path traversal

### ⚡ Performance & Scalability
- **Database Indexes**: Added indexes on frequently queried columns (swipes, messages, posts, matches, post_likes) reducing query time from O(n) to O(log n)
- **Configurable Uploads**: Uploads directory can be configured via `UPLOADS_DIR` environment variable (prepares for cloud storage migration)

### 🛡️ Reliability
- **Graceful Shutdown**: Proper handling of SIGTERM/SIGINT signals with database connection cleanup
- **Enhanced Error Handling**: Unhandled promise rejection and uncaught exception logging
- **Startup Validation**: Clear error messages for missing production configuration

## Running it

```bash
cd sprout-app
npm install
npm start
```

Then open **** in your browser.

The database is seeded automatically on first run with 6 sample profiles
(2 professors, 2 tutors, 2 peers) plus a "You" account, and 3 starter posts.
Delete `server/sprout.db` any time to reset to a clean seed.

## Project structure

```
sprout-app/
  server/
    server.js      All API routes (Express)
    db.js          SQLite schema + seed data
  public/
    index.html     App shell
    style.css       All styling
    app.js         Frontend logic, calls the API
  package.json
```

## API overview

| Method | Route                          | What it does                                  |
|--------|---------------------------------|------------------------------------------------|
| GET    | `/api/users`                    | List all users (for the account switcher)      |
| GET    | `/api/discover/:userId`         | Profiles the user hasn't swiped on yet         |
| POST   | `/api/swipe`                    | Record a like/pass; returns `matched: true/false` |
| GET    | `/api/matches/:userId`          | This user's mutual matches                     |
| GET    | `/api/messages/:userId/:otherId`| Conversation between two users (`?after=<id>` for polling) |
| POST   | `/api/messages`                 | Send a message                                 |
| GET    | `/api/notifications/:userId`    | Unread message count (for the badge)           |
| POST   | `/api/messages/read`            | Mark a conversation as read                    |
| GET    | `/api/posts`                    | The tips feed                                  |
| POST   | `/api/posts`                    | Create a post                                  |
| POST   | `/api/posts/:id/like`           | Toggle a like on a post                        |

## Profiles & photos

Every user has a headline, bio, tags, availability, and an optional photo —
edit your own from the **Profile** tab (pick a user in the switcher first).
Photos are uploaded to `public/uploads/` on the server and served back as
static files; there's a 5MB limit and only image files are accepted.
Seeded mentor/tutor profiles ship with placeholder photos (from a public
avatar demo service) so Discover looks realistic out of the box — your own
"You" account starts with no photo so you can see the initials fallback and
then try uploading one.

## Where to go next

Roughly in the order I'd tackle them:

1. **Move photo storage to cloud storage** (S3, Cloudinary, etc.) once you
   deploy — local disk storage in `public/uploads/` works great locally but
   won't persist on most hosting platforms' ephemeral filesystems.
2. **Push/email notifications.** Right now "notification" just means an
   unread badge you see next time you open the app. For a real notification
   when someone swipes/matches/messages you, you'd add email (e.g. via
   Resend/SendGrid) or web push.
3. **Search & filters on Discover** — by department, role, availability.
4. **Reporting/blocking** — important for anything matching strangers,
   especially with professors/students. Add a report button and a simple
   moderation queue.
5. **Deploy** — the backend + SQLite file can run cheaply on something like
   Render or Railway; for more traffic, swap SQLite for Postgres (the SQL is
   close enough that the migration is mostly copy-paste).
6. **Mobile app** — once the API is solid, wrapping it in React Native lets
   you reuse all these endpoints for an actual iOS/Android app.

## Development improvements made

This version includes significant improvements to the original codebase:
- Enhanced security posture with production-ready authentication handling
- Better scalability foundations through database indexing and configurable storage
- Improved reliability with graceful shutdown and comprehensive error handling
- All changes documented in the project's memory system for future reference