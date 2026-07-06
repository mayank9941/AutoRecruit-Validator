'use strict';

const { ValidationError } = require('../utils/errors');

/**
 * Zod validation middleware factory.
 *
 * Per SKILL.md §11: "thin route handlers — validate input (Zod), call a controller, return a response."
 * Per master prompt: "Every endpoint must validate input."
 *
 * Usage:
 *   router.post('/endpoint', validate(myZodSchema), controller.handler);
 *   router.post('/endpoint', validate(myZodSchema, 'query'), controller.handler);
 */

/**
 * Validates request body against a Zod schema.
 * @param {import('zod').ZodSchema} schema - The Zod schema to validate against
 * @param {'body'|'query'|'params'} source - Which part of the request to validate
 */
function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      }));

      return next(new ValidationError('Validation failed', details));
    }

    // Replace the source with the parsed (and potentially transformed) data
    req[source] = result.data;
    next();
  };
}

/**
 * Validates multiple sources in a single middleware call.
 * @param {Object} schemas - Object with keys 'body', 'query', 'params' mapping to Zod schemas
 */
function validateMultiple(schemas) {
  return (req, _res, next) => {
    const allDetails = [];

    for (const [source, schema] of Object.entries(schemas)) {
      const result = schema.safeParse(req[source]);
      if (!result.success) {
        const details = result.error.issues.map((issue) => ({
          field: `${source}.${issue.path.join('.')}`,
          message: issue.message,
          code: issue.code,
        }));
        allDetails.push(...details);
      } else {
        req[source] = result.data;
      }
    }

    if (allDetails.length > 0) {
      return next(new ValidationError('Validation failed', allDetails));
    }

    next();
  };
}

/**
 * Convenience: validate req.params against a Zod schema.
 */
function validateParams(schema) {
  return validate(schema, 'params');
}

/**
 * Convenience: validate req.query against a Zod schema.
 */
function validateQuery(schema) {
  return validate(schema, 'query');
}

module.exports = { validate, validateMultiple, validateParams, validateQuery };
