import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import db from '../server/db.js'
import app from '../server/server.js'

describe('POST /api/tutorial/seen', () => {
  // Clear all tables before each test
  beforeEach(() => {
    // Delete from all tables to avoid foreign key constraint issues
    db.prepare('DELETE FROM post_likes').run()
    db.prepare('DELETE FROM posts').run()
    db.prepare('DELETE FROM messages').run()
    db.prepare('DELETE FROM matches').run()
    db.prepare('DELETE FROM swipes').run()
    db.prepare('DELETE FROM users').run()
    // Also reset autoincrement counters for clean IDs
    db.prepare('DELETE FROM sqlite_sequence WHERE name=\'post_likes\'').run()
    db.prepare('DELETE FROM sqlite_sequence WHERE name=\'posts\'').run()
    db.prepare('DELETE FROM sqlite_sequence WHERE name=\'messages\'').run()
    db.prepare('DELETE FROM sqlite_sequence WHERE name=\'matches\'').run()
    db.prepare('DELETE FROM sqlite_sequence WHERE name=\'swipes\'').run()
    db.prepare('DELETE FROM sqlite_sequence WHERE name=\'users\'').run()
  })

  describe('when authenticated', () => {
    it('marks the user as having seen the tutorial', async () => {
      // First, create a user via the auth endpoint
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'testpassword123',
          passwordConfirmation: 'testpassword123',
          name: 'Test User',
          role: 'peer',
          department: 'Computer Science',
          academicYear: 'Freshman'
        });
      console.log('Registration status:', res.status);
      console.log('Registration body:', res.body);
      expect(res.status).toBe(201);

      // Verify email so we can log in
      db.prepare('UPDATE users SET email_verified = 1 WHERE email = ?').run('test@example.com');

      // Then login to get a session
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'testpassword123'
        });
      console.log('Login status:', loginRes.status);
      console.log('Login body:', loginRes.body);
      expect(loginRes.status).toBe(200);

      // Now call the tutorial-seen endpoint
      const tutorialRes = await request(app)
        .post('/api/tutorial/seen')
        .set('Cookie', loginRes.headers['set-cookie'])
        .expect(200)

      // Verify response body
      expect(tutorialRes.body).toEqual({ ok: true })

      // Verify database was updated
      const user = db.prepare('SELECT has_seen_tutorial FROM users WHERE email = ?').get('test@example.com')
      expect(user.has_seen_tutorial).toBe(1)
    })
  })

  describe('when not authenticated', () => {
    it('returns 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/tutorial/seen')
        .expect(401)

      expect(res.body.error).toBe('authentication required')
    })
  })
})