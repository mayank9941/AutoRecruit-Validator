'use strict';

/**
 * PII redaction utility.
 *
 * Per SKILL.md §10: "Never log or print full candidate PII
 * (name, email, phone, Aadhaar number) in plain console logs."
 *
 * This module provides redaction for structured log output.
 */

// Fields that contain PII and must be redacted in logs
const PII_FIELDS = new Set([
  'email',
  'phone',
  'phoneNumber',
  'phone_number',
  'mobile',
  'mobileNumber',
  'mobile_number',
  'aadhaar',
  'aadhaarNumber',
  'aadhaar_number',
  'aadhar',
  'pan',
  'panNumber',
  'pan_number',
  'passport',
  'passportNumber',
  'passport_number',
  'address',
  'fullAddress',
  'full_address',
  'dateOfBirth',
  'date_of_birth',
  'dob',
  'bankAccount',
  'bank_account',
  'ifsc',
  'ssn',
  'password',
  'passwordHash',
  'password_hash',
]);

// Fields to partially redact (show first/last few characters)
const PARTIAL_REDACT_FIELDS = new Set([
  'name',
  'firstName',
  'first_name',
  'lastName',
  'last_name',
  'candidateName',
  'candidate_name',
  'fatherName',
  'father_name',
  'motherName',
  'mother_name',
]);

/**
 * Redact a single value based on its field name.
 */
function redactValue(key, value) {
  if (value === null || value === undefined) {
    return value;
  }

  const lowerKey = key.toLowerCase();

  if (PII_FIELDS.has(key) || PII_FIELDS.has(lowerKey)) {
    return '[REDACTED]';
  }

  if (PARTIAL_REDACT_FIELDS.has(key) || PARTIAL_REDACT_FIELDS.has(lowerKey)) {
    const str = String(value);
    if (str.length <= 2) {
      return '[REDACTED]';
    }
    return `${str[0]}${'*'.repeat(str.length - 2)}${str[str.length - 1]}`;
  }

  return value;
}

/**
 * Deep-clone an object with PII fields redacted.
 * Non-destructive — never modifies the original object.
 */
function redactPii(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactPii(item));
  }

  const redacted = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      redacted[key] = redactPii(value);
    } else {
      redacted[key] = redactValue(key, value);
    }
  }
  return redacted;
}

module.exports = { redactPii, redactValue, PII_FIELDS, PARTIAL_REDACT_FIELDS };
