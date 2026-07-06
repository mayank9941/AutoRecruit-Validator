'use strict';

const { PrismaClient } = require('@prisma/client');
const { logger } = require('../utils/logger');

/**
 * Prisma client singleton.
 * Uses a single instance across the application to avoid connection pool exhaustion.
 * In development, the instance is cached on `globalThis` to survive hot reloads.
 */

const prismaClientSingleton = () => {
  return new PrismaClient({
    log: [
      { level: 'query', emit: 'event' },
      { level: 'error', emit: 'stdout' },
      { level: 'warn', emit: 'stdout' },
    ],
  });
};

const globalForPrisma = globalThis;

const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

// Log slow queries in development
if (process.env.NODE_ENV !== 'production') {
  prisma.$on('query', (e) => {
    if (e.duration > 100) {
      logger.warn({ query: e.query, duration: e.duration }, 'Slow query detected');
    }
  });
}

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = { prisma };
