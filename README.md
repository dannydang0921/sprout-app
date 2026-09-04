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
- **Auth:** intentionally skipped for now. Instead there's a dropdown in the
  header to pick "who you are" from the seeded users — this stands in for
  login so you can test matching/messaging between different accounts
  yourself. Swap it for real signup/login whenever you're ready (see below).
- **Messaging:** simple polling every 3 seconds, not WebSockets. Good enough
  to feel responsive for an MVP; swap for Socket.IO later if you want instant
  delivery.

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

1. **Real accounts.** Add a `users` signup/login flow (email + password,
   hashed with `bcrypt`, sessions via `express-session` or JWT). Replace the
   user-switcher dropdown with a real login screen.
2. **Move photo storage to cloud storage** (S3, Cloudinary, etc.) once you
   deploy — local disk storage in `public/uploads/` works great locally but
   won't persist on most hosting platforms' ephemeral filesystems.
3. **Push/email notifications.** Right now "notification" just means an
   unread badge you see next time you open the app. For a real notification
   when someone swipes/matches/messages you, you'd add email (e.g. via
   Resend/SendGrid) or web push.
4. **Search & filters on Discover** — by department, role, availability.
5. **Reporting/blocking** — important for anything matching strangers,
   especially with professors/students. Add a report button and a simple
   moderation queue.
6. **Deploy** — the backend + SQLite file can run cheaply on something like
   Render or Railway; for more traffic, swap SQLite for Postgres (the SQL is
   close enough that the migration is mostly copy-paste).
7. **Mobile app** — once the API is solid, wrapping it in React Native lets
   you reuse all these endpoints for an actual iOS/Android app.
