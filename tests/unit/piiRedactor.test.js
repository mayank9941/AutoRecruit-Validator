'use strict';

const { redactPii, redactValue } = require('../../src/utils/piiRedactor');

/**
 * Unit tests for PII redaction.
 */

describe('piiRedactor', () => {
  describe('redactValue', () => {
    test('should fully redact email', () => {
      expect(redactValue('email', 'test@example.com')).toBe('[REDACTED]');
    });

    test('should fully redact phone', () => {
      expect(redactValue('phone', '+91-9876543210')).toBe('[REDACTED]');
    });

    test('should fully redact aadhaar', () => {
      expect(redactValue('aadhaar', '1234-5678-9012')).toBe('[REDACTED]');
    });

    test('should fully redact password', () => {
      expect(redactValue('password', 'secret123')).toBe('[REDACTED]');
    });

    test('should partially redact name', () => {
      const result = redactValue('name', 'John Doe');
      expect(result).toBe('J******e');
    });

    test('should redact short names completely', () => {
      expect(redactValue('name', 'AB')).toBe('[REDACTED]');
    });

    test('should not redact non-PII fields', () => {
      expect(redactValue('status', 'active')).toBe('active');
    });

    test('should handle null values', () => {
      expect(redactValue('email', null)).toBeNull();
    });

    test('should handle undefined values', () => {
      expect(redactValue('email', undefined)).toBeUndefined();
    });
  });

  describe('redactPii', () => {
    test('should redact PII fields in an object', () => {
      const input = {
        id: '123',
        name: 'John Doe',
        email: 'john@example.com',
        role: 'RECRUITER',
      };

      const result = redactPii(input);

      expect(result.id).toBe('123');
      expect(result.name).toBe('J******e');
      expect(result.email).toBe('[REDACTED]');
      expect(result.role).toBe('RECRUITER');
    });

    test('should handle nested objects', () => {
      const input = {
        candidate: {
          name: 'Jane Smith',
          email: 'jane@example.com',
          phone: '1234567890',
        },
      };

      const result = redactPii(input);

      expect(result.candidate.name).toBe('J********h');
      expect(result.candidate.email).toBe('[REDACTED]');
      expect(result.candidate.phone).toBe('[REDACTED]');
    });

    test('should handle arrays', () => {
      const input = [
        { name: 'Alice', email: 'alice@test.com' },
        { name: 'Bob', email: 'bob@test.com' },
      ];

      const result = redactPii(input);

      expect(result[0].name).toBe('A***e');
      expect(result[0].email).toBe('[REDACTED]');
      expect(result[1].name).toBe('B*b');
      expect(result[1].email).toBe('[REDACTED]');
    });

    test('should not modify the original object', () => {
      const input = { email: 'test@example.com' };
      redactPii(input);
      expect(input.email).toBe('test@example.com');
    });

    test('should handle null/undefined input', () => {
      expect(redactPii(null)).toBeNull();
      expect(redactPii(undefined)).toBeUndefined();
    });

    test('should handle primitive input', () => {
      expect(redactPii('string')).toBe('string');
      expect(redactPii(42)).toBe(42);
    });
  });
});
