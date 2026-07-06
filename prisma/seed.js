'use strict';

const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

const prisma = new PrismaClient();

/**
 * Database seed script.
 * Creates initial admin user and sample job postings for development.
 */
async function main() {
  console.log('🌱 Starting database seed...');

  // Create admin user
  const adminPasswordHash = await argon2.hash('Admin@123456', {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@recruitment.local' },
    update: {},
    create: {
      email: 'admin@recruitment.local',
      passwordHash: adminPasswordHash,
      firstName: 'System',
      lastName: 'Admin',
      role: 'ADMIN',
      isActive: true,
    },
  });
  console.log(`  ✅ Admin user: ${admin.email} (ID: ${admin.id})`);

  // Create recruiter user
  const recruiterPasswordHash = await argon2.hash('Recruiter@123456', {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const recruiter = await prisma.user.upsert({
    where: { email: 'recruiter@recruitment.local' },
    update: {},
    create: {
      email: 'recruiter@recruitment.local',
      passwordHash: recruiterPasswordHash,
      firstName: 'Demo',
      lastName: 'Recruiter',
      role: 'RECRUITER',
      isActive: true,
    },
  });
  console.log(`  ✅ Recruiter user: ${recruiter.email} (ID: ${recruiter.id})`);

  // Create hiring manager user
  const hmPasswordHash = await argon2.hash('Manager@123456', {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const hiringManager = await prisma.user.upsert({
    where: { email: 'manager@recruitment.local' },
    update: {},
    create: {
      email: 'manager@recruitment.local',
      passwordHash: hmPasswordHash,
      firstName: 'Demo',
      lastName: 'Manager',
      role: 'HIRING_MANAGER',
      isActive: true,
    },
  });
  console.log(`  ✅ Hiring Manager: ${hiringManager.email} (ID: ${hiringManager.id})`);

  // Create sample job posting
  const sampleJob = await prisma.job.upsert({
    where: { postingCode: '1900' },
    update: {},
    create: {
      title: 'Junior Analyst - Sample Posting',
      postingCode: '1900',
      description: 'Sample job posting for development and testing purposes.',
      status: 'DRAFT',
      createdBy: recruiter.id,
      checklistVersion: 0,
      checklistLocked: false,
    },
  });
  console.log(`  ✅ Sample job: ${sampleJob.title} (Code: ${sampleJob.postingCode})`);

  console.log('\n🌱 Database seed completed successfully!');
}

main()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
