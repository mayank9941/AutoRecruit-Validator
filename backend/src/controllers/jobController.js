'use strict';

const { prisma } = require('../lib/prisma');
const { NotFoundError, ConflictError, ValidationError } = require('../utils/errors');
const { logger } = require('../utils/logger');
const { logAuditEvent } = require('../middleware/auditLogger');

/**
 * Job Controller — CRUD + checklist lock/version operations.
 *
 * Per SKILL.md §2: Checklists are versioned, not mutated after lock.
 * Per PRD v3 FR-03: Recruiter reviews/edits extracted checklist, then locks it.
 */

/**
 * Create a new job posting.
 */
async function createJob(req, res, next) {
  try {
    const { title, postingCode, description } = req.body;

    // Check for duplicate posting code
    const existing = await prisma.job.findUnique({
      where: { postingCode },
    });

    if (existing) {
      throw new ConflictError(`Job with posting code '${postingCode}' already exists`);
    }

    const job = await prisma.job.create({
      data: {
        title,
        postingCode,
        description: description || null,
        createdBy: req.user.id,
        status: 'DRAFT',
      },
    });

    logAuditEvent('JOB_CREATED', {
      jobId: job.id,
      postingCode: job.postingCode,
      createdBy: req.user.id,
    });

    logger.info({ jobId: job.id, postingCode }, 'Job created');

    res.status(201).json({ job });
  } catch (error) {
    next(error);
  }
}

/**
 * List all jobs with pagination and filtering.
 */
async function listJobs(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const status = req.query.status;
    const search = req.query.search;

    const where = {};
    if (status) {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { postingCode: { contains: search } },
      ];
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          creator: {
            select: { id: true, firstName: true, lastName: true },
          },
          _count: {
            select: { applications: true },
          },
        },
      }),
      prisma.job.count({ where }),
    ]);

    res.json({
      jobs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get a single job by ID.
 */
async function getJob(req, res, next) {
  try {
    const { jobId } = req.params;

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        creator: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        _count: {
          select: { applications: true },
        },
        checklistVersions: {
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });

    if (!job) {
      throw new NotFoundError('Job', jobId);
    }

    res.json({ job });
  } catch (error) {
    next(error);
  }
}

/**
 * Update a job posting.
 */
async function updateJob(req, res, next) {
  try {
    const { jobId } = req.params;
    const updates = req.body;

    const existing = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!existing) {
      throw new NotFoundError('Job', jobId);
    }

    // Cannot update a CLOSED job
    if (existing.status === 'CLOSED') {
      throw new ValidationError('Cannot update a closed job posting');
    }

    const job = await prisma.job.update({
      where: { id: jobId },
      data: updates,
    });

    logAuditEvent('JOB_UPDATED', {
      jobId: job.id,
      updatedBy: req.user.id,
      fields: Object.keys(updates),
    });

    res.json({ job });
  } catch (error) {
    next(error);
  }
}

/**
 * Lock a job's checklist.
 *
 * Per SKILL.md §2: Once locked, the checklist becomes immutable.
 * Per PRD v3 FR-03: Creates a new ChecklistVersion row for audit trail.
 */
async function lockChecklist(req, res, next) {
  try {
    const { jobId } = req.params;
    const { rules } = req.body;

    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundError('Job', jobId);
    }

    if (job.status === 'CLOSED') {
      throw new ValidationError('Cannot lock checklist on a closed job');
    }

    const newVersion = job.checklistVersion + 1;

    // Transaction: update job + create version row atomically
    const [updatedJob, checklistVersion] = await prisma.$transaction([
      prisma.job.update({
        where: { id: jobId },
        data: {
          requirements: rules,
          checklistVersion: newVersion,
          checklistLocked: true,
          status: 'ACTIVE',
        },
      }),
      prisma.checklistVersion.create({
        data: {
          jobId,
          version: newVersion,
          rules,
          lockedAt: new Date(),
          lockedBy: req.user.id,
        },
      }),
    ]);

    logAuditEvent('CHECKLIST_LOCKED', {
      jobId,
      version: newVersion,
      ruleCount: rules.length,
      lockedBy: req.user.id,
    });

    logger.info(
      { jobId, version: newVersion, ruleCount: rules.length },
      'Checklist locked'
    );

    res.json({
      job: updatedJob,
      checklistVersion,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get checklist version history for a job.
 */
async function getChecklistVersions(req, res, next) {
  try {
    const { jobId } = req.params;

    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundError('Job', jobId);
    }

    const versions = await prisma.checklistVersion.findMany({
      where: { jobId },
      orderBy: { version: 'desc' },
    });

    res.json({ versions });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createJob,
  listJobs,
  getJob,
  updateJob,
  lockChecklist,
  getChecklistVersions,
};
