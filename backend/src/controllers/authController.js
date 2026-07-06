'use strict';

const argon2 = require('argon2');
const { prisma } = require('../lib/prisma');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../middleware/auth');
const { AuthenticationError, ConflictError, ValidationError } = require('../utils/errors');
const { logger } = require('../utils/logger');
const { logAuditEvent } = require('../middleware/auditLogger');
const { AUTH } = require('../config/constants');
const { config } = require('../config');

/**
 * Auth Controller — handles user registration, login, token refresh, and logout.
 *
 * Per SKILL.md §3: JWT authentication.
 * Uses Argon2id for password hashing (winner of the Password Hashing Competition).
 */

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 4,
};

/**
 * Register a new user.
 */
async function register(req, res, next) {
  try {
    const { email, password, firstName, lastName, role } = req.body;

    // Check for existing user
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictError('A user with this email already exists');
    }

    // Hash password with Argon2id
    const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        role,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
      },
    });

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Store refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt,
      },
    });

    // Set refresh token as httpOnly secure cookie
    res.cookie(AUTH.COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/api/auth',
    });

    logAuditEvent('USER_REGISTERED', {
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    logger.info({ userId: user.id, role: user.role }, 'User registered successfully');

    res.status(201).json({
      user,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Login a user.
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new AuthenticationError('Invalid email or password');
    }

    if (!user.isActive) {
      throw new AuthenticationError('Account is deactivated');
    }

    // Verify password
    const isValidPassword = await argon2.verify(user.passwordHash, password);

    if (!isValidPassword) {
      logAuditEvent('LOGIN_FAILED', { email, reason: 'invalid_password' });
      throw new AuthenticationError('Invalid email or password');
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Store refresh token (revoke old ones for this user)
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, isRevoked: false },
      data: { isRevoked: true },
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt,
      },
    });

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Set refresh token cookie
    res.cookie(AUTH.COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    });

    logAuditEvent('LOGIN_SUCCESS', { userId: user.id, role: user.role });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Refresh access token.
 */
async function refresh(req, res, next) {
  try {
    // Get refresh token from cookie or body
    const refreshTokenValue =
      req.cookies?.[AUTH.COOKIE_NAME] || req.body?.refreshToken;

    if (!refreshTokenValue) {
      throw new AuthenticationError('Refresh token is required');
    }

    // Verify the JWT
    const decoded = verifyRefreshToken(refreshTokenValue);

    // Check if the token exists in the database and is not revoked
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshTokenValue },
      include: { user: true },
    });

    if (!storedToken || storedToken.isRevoked) {
      throw new AuthenticationError('Invalid refresh token');
    }

    if (storedToken.expiresAt < new Date()) {
      throw new AuthenticationError('Refresh token has expired');
    }

    if (!storedToken.user.isActive) {
      throw new AuthenticationError('Account is deactivated');
    }

    // Revoke old token (rotation)
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { isRevoked: true },
    });

    // Generate new tokens
    const user = storedToken.user;
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    // Store new refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        userId: user.id,
        expiresAt,
      },
    });

    // Update cookie
    res.cookie(AUTH.COOKIE_NAME, newRefreshToken, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    });

    logAuditEvent('TOKEN_REFRESHED', { userId: user.id });

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Logout — revoke refresh token.
 */
async function logout(req, res, next) {
  try {
    const refreshTokenValue =
      req.cookies?.[AUTH.COOKIE_NAME] || req.body?.refreshToken;

    if (refreshTokenValue) {
      await prisma.refreshToken.updateMany({
        where: { token: refreshTokenValue },
        data: { isRevoked: true },
      });
    }

    // Also revoke all tokens for the current user if authenticated
    if (req.user?.id) {
      await prisma.refreshToken.updateMany({
        where: { userId: req.user.id, isRevoked: false },
        data: { isRevoked: true },
      });

      logAuditEvent('LOGOUT', { userId: req.user.id });
    }

    // Clear cookie
    res.clearCookie(AUTH.COOKIE_NAME, { path: '/api/auth' });

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
}

/**
 * Get current user profile.
 */
async function getProfile(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new AuthenticationError('User not found');
    }

    res.json({ user });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  getProfile,
};
