'use strict';

const { Router } = require('express');
const { prisma } = require('../lib/prisma');
const { logger } = require('../utils/logger');

const router = Router();

/**
 * GET /health
 *
 * Health check endpoint used by:
 * - AWS ALB target group health checks
 * - ECS task health checks
 * - CI smoke tests
 * - Docker HEALTHCHECK
 *
 * Returns 200 if the service is healthy, 503 if degraded.
 */
router.get('/health', async (_req, res) => {
  const health = {
    status: 'healthy',
    service: 'recruitment-backend',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {},
  };

  // Database connectivity check
  try {
    await prisma.$queryRaw`SELECT 1`;
    health.checks.database = { status: 'healthy' };
  } catch (error) {
    health.checks.database = { status: 'unhealthy', message: 'Database connection failed' };
    health.status = 'degraded';
    logger.error({ err: error }, 'Health check: database connection failed');
  }

  // Memory usage check
  const memUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
  health.checks.memory = {
    status: heapUsedMB < heapTotalMB * 0.9 ? 'healthy' : 'warning',
    heapUsedMB,
    heapTotalMB,
  };

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

/**
 * GET /ready
 *
 * Readiness check — indicates whether the service is ready to accept traffic.
 * Unlike /health, this can return 503 during startup while connections are being established.
 */
router.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not_ready', message: 'Database not available' });
  }
});

module.exports = router;
