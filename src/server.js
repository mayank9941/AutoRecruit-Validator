'use strict';

const app = require('./app');
const { config } = require('./config');
const { logger } = require('./utils/logger');
const { prisma } = require('./lib/prisma');

const PORT = config.PORT;

/**
 * Server entry point with graceful shutdown.
 *
 * Handles SIGTERM and SIGINT to close database connections
 * and drain active requests before exit.
 */

async function startServer() {
  try {
    // Verify database connection on startup
    await prisma.$connect();
    logger.info('Database connection established');

    const server = app.listen(PORT, () => {
      logger.info(
        {
          port: PORT,
          env: config.NODE_ENV,
          pid: process.pid,
        },
        `🚀 Backend server running on port ${PORT}`
      );
    });

    // Graceful shutdown handler
    const shutdown = async (signal) => {
      logger.info({ signal }, 'Received shutdown signal, starting graceful shutdown...');

      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          await prisma.$disconnect();
          logger.info('Database connection closed');
        } catch (error) {
          logger.error({ err: error }, 'Error closing database connection');
        }

        process.exit(0);
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle unhandled rejections — per master prompt: "No unhandled promise rejections"
    process.on('unhandledRejection', (reason, promise) => {
      logger.error({ reason, promise }, 'Unhandled Promise Rejection');
      // In production, we may want to crash and let the orchestrator restart
      if (config.NODE_ENV === 'production') {
        shutdown('unhandledRejection');
      }
    });

    process.on('uncaughtException', (error) => {
      logger.fatal({ err: error }, 'Uncaught Exception — shutting down');
      shutdown('uncaughtException');
    });

  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

startServer();
