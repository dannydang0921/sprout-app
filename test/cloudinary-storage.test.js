import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import db from '../server/db.js'
import app from '../server/server.js'
import fs from 'fs'
import path from 'path'
import { pipeline } from 'stream'
import { promisify } from 'util'

const pump = promisify(pipeline)

// Helper to create a fake image buffer
function createFakeImageBuffer() {
  // Create a small valid JPEG (1x1 pixel)
  return Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
    0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
    0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
    0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x21,
    0x3C, 0x2C, 0x30, 0x35, 0x35, 0x38, 0x3A, 0x40, 0x44, 0x4D, 0x41, 0x41,
    0x42, 0x4D, 0x4F, 0x4E, 0x41, 0x44, 0x47, 0x4A, 0x49, 0x4F, 0x4D, 0x4B,
    0x56, 0x56, 0x58, 0x4E, 0x57, 0x5E, 0x5F, 0x5A, 0x5B, 0x5B, 0x5F, 0x62,
    0x59, 0x5A, 0x5A, 0x5F, 0x66, 0x63, 0x5F, 0x5A, 0x5D, 0x63, 0x5F, 0x5F,
    0x6A, 0x66, 0x64, 0x62, 0x66, 0x69, 0x6A, 0x66, 0x6A, 0x6F, 0x71, 0x6E,
    0x68, 0x6F, 0x73, 0x78, 0x6D, 0x6E, 0x71, 0x74, 0x74, 0x77, 0x79, 0x7D,
    0x7C, 0x7D, 0x81, 0x75, 0x7A, 0x7E, 0x84, 0x85, 0x84, 0x83, 0x7D, 0x80,
    0x85, 0x89, 0x89, 0x87, 0x87, 0x8D, 0x91, 0x94, 0x95, 0x91, 0x8F, 0x95,
    0x92, 0x96, 0x96, 0x99, 0x96, 0x96, 0x9C, 0x99, 0x96, 0x95, 0x9D, 0x9C,
    0x96, 0x96, 0x9C, 0x9F, 0x9D, 0x9F, 0x9F, 0xFF, 0xC0, 0x00, 0x11, 0x08,
    0x00, 0x01, 0x00, 0x01, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03,
    0x11, 0x01, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
    0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0xFF,
    0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03, 0x03, 0x02, 0x04, 0x03,
    0x05, 0x05, 0x04, 0x05, 0x06, 0x04, 0x06, 0x05, 0x06, 0x06, 0x06, 0x06,
    0x06, 0x06, 0x07, 0x07, 0x06, 0x08, 0x08, 0x08, 0x08, 0x08, 0x00, 0x01,
    0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0x10, 0x00,
    0x02, 0x01, 0x03, 0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x05, 0x06,
    0x04, 0x06, 0x05, 0x06, 0x06, 0x06, 0x06, 0x06, 0x07, 0x07, 0x06, 0x08,
    0x08, 0x08, 0x08, 0x08, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
    0x08, 0x09, 0x0A, 0x0B, 0x10, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05,
    0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0x10, 0x00, 0x00, 0xFF, 0xDA, 0x00,
    0x0C, 0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3F, 0x00, 0x9A,
    0x98, 0x99, 0x9A, 0x9A, 0x9A, 0x9A, 0x9A, 0x9A, 0x9A, 0x9A, 0xFF, 0xD9
  ]);
}

describe('Cloudinary Storage Integration', () => {
  let testUserId = null;
  let testCookie = null;

  // Clear all tables before each test
  beforeEach(async () => {
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
  });

  afterEach(async () => {
    // Clean up any test files created
    const testFilePath = path.join(__dirname, '..', 'test-image.jpg');
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  describe('Storage Adapter Loading', () => {
    it('loads local storage adapter by default', () => {
      // Reset env to default
      delete process.env.STORAGE_TYPE;
      // Clear module cache to get fresh instance
      delete require.cache[require.resolve('../server/services/storageService')];
      const { storageAdapter, STORAGE_TYPE } = require('../server/services/storageService');
      expect(STORAGE_TYPE).toBe('local');
      expect(typeof storageAdapter.generateFilename).toBe('function');
      expect(typeof storageAdapter.saveFile).toBe('function');
      expect(typeof storageAdapter.deleteFile).toBe('function');
      expect(typeof storageAdapter.getFileUrl).toBe('function');
    });

    it('loads cloudinary storage adapter when STORAGE_TYPE=cloudinary', () => {
      process.env.STORAGE_TYPE = 'cloudinary';
      // Note: Will fail on missing credentials, but adapter should still load
      // Clear module cache to get fresh instance with new env vars
      delete require.cache[require.resolve('../server/services/storageService')];
      const { storageAdapter, STORAGE_TYPE } = require('../server/services/storageService');
      expect(STORAGE_TYPE).toBe('cloudinary');
      expect(typeof storageAdapter.generateFilename).toBe('function');
      expect(typeof storageAdapter.saveFile).toBe('function');
      expect(typeof storageAdapter.deleteFile).toBe('function');
      expect(typeof storageAdapter.getFileUrl).toBe('function');
    });
  });

  describe('Upload Flow', () => {
    it('successfully uploads and stores image with local storage', async () => {
      // Force local storage for this test
      process.env.STORAGE_TYPE = 'local';

      // 1. Register a test user
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'testpass123',
          passwordConfirmation: 'testpass123',
          name: 'Test User',
          role: 'peer',
          department: 'Computer Science',
          academicYear: 'Freshman'
        });
      expect(registerRes.status).toBe(201);

      // 2. Verify email (development shortcut)
      db.prepare('UPDATE users SET email_verified = 1 WHERE email = ?').run('test@example.com');

      // 3. Login to get session
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'testpass123'
        });
      expect(loginRes.status).toBe(200);

      // Extract cookie for subsequent requests
      testCookie = loginRes.headers['set-cookie'];
      testUserId = loginRes.body.id;

      // 4. Create a test image file
      const testImageBuffer = createFakeImageBuffer();
      const testFilePath = path.join(__dirname, '..', 'test-image.jpg');
      fs.writeFileSync(testFilePath, testImageBuffer);

      // 5. Upload the image
      const uploadRes = await request(app)
        .post(`/api/profile/${testUserId}/photo`)
        .set('Cookie', testCookie)
        .attach('photo', testFilePath)
        .expect(200);

      // 6. Verify response
      expect(uploadRes.body).toHaveProperty('avatar_url');
      const avatarUrl = uploadRes.body.avatar_url;
      expect(typeof avatarUrl).toBe('string');
      expect(avatarUrl.length).toBeGreaterThan(0);

      // 7. Verify it's stored in database
      const user = db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(testUserId);
      expect(user.avatar_url).toBe(avatarUrl);

      // 8. For local storage, verify file exists in uploads directory
      if (avatarUrl.startsWith('/uploads/')) {
        const filename = path.basename(avatarUrl);
        const filePath = path.join(__dirname, '..', 'public', 'uploads', filename);
        expect(fs.existsSync(filePath)).toBe(true);
      }
    });

    it('successfully uploads and stores image with cloudinary storage (if credentials provided)', async () => {
      // Only run this test if Cloudinary credentials are available
      if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
        expect(true).toBe(true); // Skip test if no credentials
        return;
      }

      process.env.STORAGE_TYPE = 'cloudinary';

      // 1. Register a test user
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test2@example.com',
          password: 'testpass123',
          passwordConfirmation: 'testpass123',
          name: 'Test User 2',
          role: 'peer',
          department: 'Computer Science',
          academicYear: 'Freshman'
        });
      expect(registerRes.status).toBe(201);

      // 2. Verify email
      db.prepare('UPDATE users SET email_verified = 1 WHERE email = ?').run('test2@example.com');

      // 3. Login to get session
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test2@example.com',
          password: 'testpass123'
        });
      expect(loginRes.status).toBe(200);

      testCookie = loginRes.headers['set-cookie'];
      testUserId = loginRes.body.id;

      // 4. Create a test image file
      const testImageBuffer = createFakeImageBuffer();
      const testFilePath = path.join(__dirname, '..', 'test-image.jpg');
      fs.writeFileSync(testFilePath, testImageBuffer);

      // 5. Upload the image
      const uploadRes = await request(app)
        .post(`/api/profile/${testUserId}/photo`)
        .set('Cookie', testCookie)
        .attach('photo', testFilePath)
        .expect(200);

      // 6. Verify response
      expect(uploadRes.body).toHaveProperty('avatar_url');
      const avatarUrl = uploadRes.body.avatar_url;
      expect(typeof avatarUrl).toBe('string');
      expect(avatarUrl.length).toBeGreaterThan(0);

      // 7. Verify it's stored in database
      const user = db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(testUserId);
      expect(user.avatar_url).toBe(avatarUrl);

      // 8. For cloudinary storage, verify it's a cloudinary URL
      expect(avatarUrl).toMatch(/^https:\/\/res\.cloudinary\.com\//);
    });
  });

  describe('Deletion Cleanup', () => {
    it('removes local file when user account is deleted', async () => {
      process.env.STORAGE_TYPE = 'local';

      // 1. Register and login user
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test3@example.com',
          password: 'testpass123',
          passwordConfirmation: 'testpass123',
          name: 'Test User 3',
          role: 'peer',
          department: 'Computer Science',
          academicYear: 'Freshman'
        });
      expect(registerRes.status).toBe(201);

      db.prepare('UPDATE users SET email_verified = 1 WHERE email = ?').run('test3@example.com');

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test3@example.com',
          password: 'testpass123'
        });
      expect(loginRes.status).toBe(200);

      testCookie = loginRes.headers['set-cookie'];
      testUserId = loginRes.body.id;

      // 2. Upload an image
      const testImageBuffer = createFakeImageBuffer();
      const testFilePath = path.join(__dirname, '..', 'test-image.jpg');
      fs.writeFileSync(testFilePath, testImageBuffer);

      const uploadRes = await request(app)
        .post(`/api/profile/${testUserId}/photo`)
        .set('Cookie', testCookie)
        .attach('photo', testFilePath)
        .expect(200);

      const avatarUrl = uploadRes.body.avatar_url;
      expect(avatarUrl).toBeDefined();

      // 3. Verify file exists in uploads directory
      if (avatarUrl.startsWith('/uploads/')) {
        const filename = path.basename(avatarUrl);
        const filePath = path.join(__dirname, '..', 'public', 'uploads', filename);
        expect(fs.existsSync(filePath)).toBe(true);

        // 4. Delete user account
        const deleteRes = await request(app)
          .delete('/api/auth/delete-account')
          .set('Cookie', testCookie)
          .expect(200);

        expect(deleteRes.body).toHaveProperty('ok', true);

        // 5. Verify file is deleted
        expect(fs.existsSync(filePath)).toBe(false);
      }
    });
  });
});