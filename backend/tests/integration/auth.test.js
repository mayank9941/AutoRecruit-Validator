'use strict';

const request = require('supertest');

/**
 * Integration test setup.
 * Uses the actual Express app with a test database.
 */

// Set test environment before importing app
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long-for-testing';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-characters-long-for-testing';
process.env.DATABASE_URL = 'file:./test.db';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.AI_SERVICE_URL = 'http://localhost:8000';
process.env.LOG_LEVEL = 'silent';

const app = require('../../src/app');
const { prisma } = require('../../src/lib/prisma');

describe('Auth API Integration Tests', () => {
  const testUser = {
    email: 'test@example.com',
    password: 'Test@123456',
    firstName: 'Test',
    lastName: 'User',
  };

  let accessToken;
  let refreshToken;

  // Clean up test data before each suite
  beforeAll(async () => {
    try {
      // Dynamically initialize test.db schema
      const { execSync } = require('child_process');
      execSync('npx prisma db push --schema=prisma/schema.sqlite.prisma --accept-data-loss', {
        env: { ...process.env, DATABASE_URL: 'file:./test.db' },
        stdio: 'ignore'
      });

      // Clean up any existing test data
      await prisma.refreshToken.deleteMany({});
      await prisma.user.deleteMany({ where: { email: testUser.email } });
    } catch (e) {
      // Ignore initial clean up errors if table doesn't exist yet
    }
  });

  afterAll(async () => {
    try {
      await prisma.refreshToken.deleteMany({});
      await prisma.user.deleteMany({ where: { email: testUser.email } });
    } catch {
      // Ignore cleanup errors
    }
    await prisma.$disconnect();
  });

  // ─── Registration ───────────────────────────────────────────

  describe('POST /api/auth/register', () => {
    test('should register a new user successfully', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(testUser)
        .expect(201);

      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(testUser.email);
      expect(res.body.user.firstName).toBe(testUser.firstName);
      expect(res.body.user.role).toBe('RECRUITER');
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      // Password should never be in response
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(res.body.user.password).toBeUndefined();
    });

    test('should reject duplicate email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(testUser)
        .expect(409);

      expect(res.body.error.code).toBe('CONFLICT');
    });

    test('should reject weak password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...testUser, email: 'weak@example.com', password: '123' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('should reject invalid email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...testUser, email: 'not-an-email' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('should reject missing firstName', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'new@example.com', password: 'Test@123456', lastName: 'User' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ─── Login ──────────────────────────────────────────────────

  describe('POST /api/auth/login', () => {
    test('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testUser.email, password: testUser.password })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.user.email).toBe(testUser.email);

      accessToken = res.body.accessToken;
      refreshToken = res.body.refreshToken;
    });

    test('should reject invalid password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testUser.email, password: 'wrong-password' })
        .expect(401);

      expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    test('should reject non-existent email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'Test@123456' })
        .expect(401);

      expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  // ─── Protected Routes ───────────────────────────────────────

  describe('GET /api/auth/profile', () => {
    test('should return profile with valid token', async () => {
      const res = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.user.email).toBe(testUser.email);
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    test('should reject request without token (401)', async () => {
      const res = await request(app)
        .get('/api/auth/profile')
        .expect(401);

      expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    test('should reject request with invalid token (401)', async () => {
      const res = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    test('should reject request with malformed Authorization header', async () => {
      const res = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'NotBearer token')
        .expect(401);

      expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  // ─── Token Refresh ──────────────────────────────────────────

  describe('POST /api/auth/refresh', () => {
    test('should refresh access token with valid refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      // New refresh token should be different (rotation)
      expect(res.body.refreshToken).not.toBe(refreshToken);

      // Update tokens for subsequent tests
      accessToken = res.body.accessToken;
      refreshToken = res.body.refreshToken;
    });

    test('should reject with missing refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({})
        .expect(401);

      expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  // ─── Logout ─────────────────────────────────────────────────

  describe('POST /api/auth/logout', () => {
    test('should logout successfully', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(200);

      expect(res.body.message).toBe('Logged out successfully');
    });

    test('should reject after logout with old refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(401);

      expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  // ─── Health Check ───────────────────────────────────────────

  describe('GET /health', () => {
    test('should return healthy status', async () => {
      const res = await request(app)
        .get('/health')
        .expect(200);

      expect(res.body.status).toBe('healthy');
      expect(res.body.service).toBe('recruitment-backend');
      expect(res.body.checks.database.status).toBe('healthy');
    });
  });

  describe('GET /ready', () => {
    test('should return ready status', async () => {
      const res = await request(app)
        .get('/ready')
        .expect(200);

      expect(res.body.status).toBe('ready');
    });
  });

  // ─── 404 Handler ────────────────────────────────────────────

  describe('Unmatched routes', () => {
    test('should return 404 for unknown API routes', async () => {
      const res = await request(app)
        .get('/api/nonexistent')
        .expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});
