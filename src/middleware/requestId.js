'use strict';

const { v4: uuidv4 } = require('uuid');
const { createRequestLogger } = require('../utils/logger');

/**
 * Assigns a unique correlation ID (X-Request-ID) to every incoming request.
 * This ID is propagated through logs and returned in the response header
 * for end-to-end tracing across services.
 */
function requestIdMiddleware(req, res, next) {
  const requestId = req.headers['x-request-id'] || uuidv4();

  req.id = requestId;
  req.requestId = requestId;
  req.log = createRequestLogger(requestId);

  res.setHeader('X-Request-ID', requestId);

  next();
}

module.exports = { requestIdMiddleware };
