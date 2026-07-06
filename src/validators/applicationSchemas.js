'use strict';

const { z } = require('zod');

/**
 * Zod schemas for Application endpoints.
 */

const applicationIdParamSchema = z.object({
  applicationId: z.string().uuid('Invalid application ID format'),
});

const batchIdParamSchema = z.object({
  batchId: z.string().uuid('Invalid batch ID format'),
});

const overrideVerdictSchema = z.object({
  verdict: z.enum(['eligible', 'semi_eligible', 'not_eligible']),
  reason: z
    .string()
    .min(10, 'Override reason must be at least 10 characters')
    .max(2000, 'Override reason must be 2000 characters or less'),
});

const listApplicationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  status: z
    .enum([
      'PENDING', 'VALIDATING', 'VALIDATED', 'PARSING', 'PARSED',
      'EVALUATING', 'EVALUATED', 'FAILED_VALIDATION',
      'FAILED_PARSING', 'FAILED_EVALUATION',
    ])
    .optional(),
  verdict: z.enum(['eligible', 'semi_eligible', 'not_eligible']).optional(),
});

module.exports = {
  applicationIdParamSchema,
  batchIdParamSchema,
  overrideVerdictSchema,
  listApplicationsQuerySchema,
};
