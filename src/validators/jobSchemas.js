'use strict';

const { z } = require('zod');

/**
 * Zod schemas for Job endpoints.
 */

const createJobSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(500, 'Title must be 500 characters or less')
    .trim(),
  postingCode: z
    .string()
    .min(1, 'Posting code is required')
    .max(20, 'Posting code must be 20 characters or less')
    .regex(/^\d+$/, 'Posting code must be numeric')
    .trim(),
  description: z
    .string()
    .max(10000, 'Description must be 10000 characters or less')
    .optional(),
});

const updateJobSchema = z.object({
  title: z
    .string()
    .min(1)
    .max(500)
    .trim()
    .optional(),
  description: z
    .string()
    .max(10000)
    .optional(),
  status: z
    .enum(['DRAFT', 'ACTIVE', 'CLOSED'])
    .optional(),
});

const lockChecklistSchema = z.object({
  rules: z
    .array(
      z.object({
        rule_text: z.string().min(1, 'Rule text is required'),
        rule_type: z.enum(['hard', 'soft']).default('hard'),
        category: z.string().optional(),
        requires_document: z.boolean().default(false),
        expected_document_type: z.string().optional(),
      })
    )
    .min(1, 'At least one rule is required'),
});

const jobIdParamSchema = z.object({
  jobId: z.string().uuid('Invalid job ID format'),
});

module.exports = {
  createJobSchema,
  updateJobSchema,
  lockChecklistSchema,
  jobIdParamSchema,
};
