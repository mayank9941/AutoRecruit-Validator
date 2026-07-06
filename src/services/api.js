// ============================================
// HR Screening System — API Service Stubs
// Replace these with real API calls when backend is ready.
// ============================================

import {
  mockJobProfiles,
  mockCandidates,
  mockDashboardStats,
  mockRecentActivity,
} from '../data/mockData';

// Simulate API delay
const delay = (ms = 500) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Job Profiles ──
export async function getJobProfiles() {
  await delay(300);
  return [...mockJobProfiles];
}

export async function getJobProfile(id) {
  await delay(200);
  return mockJobProfiles.find((p) => p.id === id) || null;
}

export async function createJobProfile(data) {
  await delay(400);
  const newProfile = {
    id: `JP-${String(mockJobProfiles.length + 1).padStart(3, '0')}`,
    ...data,
    status: 'draft',
    createdAt: new Date().toISOString().split('T')[0],
    applicantCount: 0,
    screenedCount: 0,
    eligibleCount: 0,
  };
  mockJobProfiles.push(newProfile);
  return newProfile;
}

export async function updateCriteriaSet(profileId, criteriaSet) {
  await delay(300);
  const profile = mockJobProfiles.find((p) => p.id === profileId);
  if (profile) {
    profile.criteriaSet = {
      ...profile.criteriaSet,
      ...criteriaSet,
      version: (profile.criteriaSet?.version || 0) + 1,
      editedAt: new Date().toISOString().split('T')[0],
    };
  }
  return profile;
}

// ── Screening ──
export async function getCandidates(jobProfileId, statusFilter) {
  await delay(300);
  let candidates = mockCandidates.filter((c) => c.jobProfileId === jobProfileId);
  if (statusFilter && statusFilter !== 'All') {
    candidates = candidates.filter((c) => c.screeningStatus === statusFilter);
  }
  return candidates;
}

export async function processBulkUpload(jobProfileId, zipFile, excelFile, onProgress) {
  // Simulate batch processing with progress updates
  const totalCandidates = 142;
  for (let i = 0; i <= totalCandidates; i += 5) {
    await delay(50);
    onProgress?.(i, totalCandidates);
  }
  return {
    total: totalCandidates,
    eligible: 45,
    needsReview: 14,
  };
}

export async function updateCandidateStatus(candidateId, status, notes) {
  await delay(200);
  const candidate = mockCandidates.find((c) => c.id === candidateId);
  if (candidate) {
    candidate.screeningStatus = status;
    candidate.manual_review_notes = notes;
    if (status === 'Eligible') {
      candidate.finalStatus = 'Pending Verification';
    } else {
      candidate.finalStatus = 'Not Eligible';
    }
  }
  return candidate;
}

// ── Verification ──
export async function getVerificationCandidates(jobProfileId) {
  await delay(300);
  return mockCandidates.filter(
    (c) => c.jobProfileId === jobProfileId && c.screeningStatus === 'Eligible'
  );
}

export async function verifyCandidate(candidateId, verified) {
  await delay(300);
  const candidate = mockCandidates.find((c) => c.id === candidateId);
  if (candidate) {
    candidate.verificationStatus = verified ? 'Verified' : 'Rejected';
    candidate.finalStatus = verified ? 'Interview Ready' : 'Not Eligible';
  }
  return candidate;
}

// ── Dashboard ──
export async function getDashboardStats() {
  await delay(200);
  return { ...mockDashboardStats };
}

export async function getRecentActivity() {
  await delay(200);
  return [...mockRecentActivity];
}
