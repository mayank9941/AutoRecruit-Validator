'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const hpp = require('hpp');
const pinoHttp = require('pino-http');

const { config } = require('./config');
const { logger } = require('./utils/logger');
const { requestIdMiddleware } = require('./middleware/requestId');
const { errorHandler } = require('./middleware/errorHandler');
const { auditLoggerMiddleware } = require('./middleware/auditLogger');
const { createRateLimiter } = require('./middleware/rateLimiter');
const routes = require('./routes');

const app = express();

// ----- Security middleware -----

// Helmet sets various HTTP headers for security
app.use(helmet());

// CORS — restrict to frontend origin
app.use(cors({
  origin: config.FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID'],
}));

// HPP — protect against HTTP Parameter Pollution
app.use(hpp());

// ----- Parsing middleware -----

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ----- Request tracking -----

// Assign correlation ID before anything else
app.use(requestIdMiddleware);

// Structured HTTP request logging (Pino)
app.use(pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => req.url === '/health' || req.url === '/api/health',
  },
  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
  customErrorMessage: (req, res) => {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
}));

// Audit logging
app.use(auditLoggerMiddleware);

// ----- Rate limiting -----

app.use('/api/', createRateLimiter(
  config.RATE_LIMIT_WINDOW_MS,
  config.RATE_LIMIT_MAX_REQUESTS
));

// ----- Routes -----

app.get('/', (req, res) => {
  res.json({
    service: 'recruitment-platform-backend',
    status: 'running',
    health: '/health'
  });
});

app.use(routes);

// ----- Error handling (must be last) -----

app.use(errorHandler);

module.exports = app;
