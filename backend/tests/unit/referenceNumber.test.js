'use strict';

const {
  parse,
  validateWithSeries,
  validateConsistency,
  extractFromFilename,
  extractPostingCode,
} = require('../../src/services/referenceNumber');
const { ReferenceNumberError } = require('../../src/utils/errors');

/**
 * Unit tests for the Reference Number service.
 *
 * Per the implementation plan §9.5: covers all parse/validate scenarios
 * with 100% branch coverage.
 */

describe('referenceNumber.parse', () => {
  // ─── Valid reference numbers ─────────────────────────────────

  test('should parse a valid standard reference number', () => {
    const result = parse('IHM/JA/1900/10001');
    expect(result).toEqual({
      company: 'IHM',
      series: 'JA',
      postingCode: '1900',
      sequence: '10001',
      raw: 'IHM/JA/1900/10001',
    });
  });

  test('should parse a valid reference number with high sequence', () => {
    const result = parse('IHM/JA/2100/99999');
    expect(result).toEqual({
      company: 'IHM',
      series: 'JA',
      postingCode: '2100',
      sequence: '99999',
      raw: 'IHM/JA/2100/99999',
    });
  });

  test('should parse with different company/series prefixes (posting-series-aware)', () => {
    const result = parse('ABC/XY/500/1');
    expect(result).toEqual({
      company: 'ABC',
      series: 'XY',
      postingCode: '500',
      sequence: '1',
      raw: 'ABC/XY/500/1',
    });
  });

  test('should trim whitespace', () => {
    const result = parse('  IHM/JA/1900/10001  ');
    expect(result.raw).toBe('IHM/JA/1900/10001');
    expect(result.company).toBe('IHM');
  });

  // ─── Invalid reference numbers ───────────────────────────────

  test('should throw REFERENCE_NUMBER_EMPTY for null', () => {
    expect(() => parse(null)).toThrow(ReferenceNumberError);
    try {
      parse(null);
    } catch (e) {
      expect(e.code).toBe('REFERENCE_NUMBER_EMPTY');
    }
  });

  test('should throw REFERENCE_NUMBER_EMPTY for undefined', () => {
    expect(() => parse(undefined)).toThrow(ReferenceNumberError);
    try {
      parse(undefined);
    } catch (e) {
      expect(e.code).toBe('REFERENCE_NUMBER_EMPTY');
    }
  });

  test('should throw REFERENCE_NUMBER_EMPTY for empty string', () => {
    expect(() => parse('')).toThrow(ReferenceNumberError);
    try {
      parse('');
    } catch (e) {
      expect(e.code).toBe('REFERENCE_NUMBER_EMPTY');
    }
  });

  test('should throw REFERENCE_NUMBER_INVALID_TYPE for number', () => {
    expect(() => parse(12345)).toThrow(ReferenceNumberError);
    try {
      parse(12345);
    } catch (e) {
      expect(e.code).toBe('REFERENCE_NUMBER_INVALID_TYPE');
    }
  });

  test('should throw REFERENCE_NUMBER_INCOMPLETE for missing segments', () => {
    expect(() => parse('IHM/JA/1900')).toThrow(ReferenceNumberError);
    try {
      parse('IHM/JA/1900');
    } catch (e) {
      expect(e.code).toBe('REFERENCE_NUMBER_INCOMPLETE');
      expect(e.details.segmentCount).toBe(3);
    }
  });

  test('should throw REFERENCE_NUMBER_EXTRA_SEGMENTS for too many segments', () => {
    expect(() => parse('IHM/JA/1900/10001/X')).toThrow(ReferenceNumberError);
    try {
      parse('IHM/JA/1900/10001/X');
    } catch (e) {
      expect(e.code).toBe('REFERENCE_NUMBER_EXTRA_SEGMENTS');
      expect(e.details.segmentCount).toBe(5);
    }
  });

  test('should throw REFERENCE_NUMBER_INVALID_FORMAT for non-numeric posting code', () => {
    expect(() => parse('IHM/JA/ABC/10001')).toThrow(ReferenceNumberError);
    try {
      parse('IHM/JA/ABC/10001');
    } catch (e) {
      expect(e.code).toBe('REFERENCE_NUMBER_INVALID_FORMAT');
      expect(e.details.validationErrors).toContain(
        "Posting code 'ABC' must be numeric"
      );
    }
  });

  test('should throw REFERENCE_NUMBER_INVALID_FORMAT for non-numeric sequence number', () => {
    expect(() => parse('IHM/JA/1900/XYZ')).toThrow(ReferenceNumberError);
    try {
      parse('IHM/JA/1900/XYZ');
    } catch (e) {
      expect(e.code).toBe('REFERENCE_NUMBER_INVALID_FORMAT');
      expect(e.details.validationErrors).toContain(
        "Sequence number 'XYZ' must be numeric"
      );
    }
  });

  test('should throw for lowercase reference numbers (case sensitivity)', () => {
    expect(() => parse('ihm/ja/1900/10001')).toThrow(ReferenceNumberError);
  });

  test('should throw for mixed case reference numbers', () => {
    expect(() => parse('IHm/Ja/1900/10001')).toThrow(ReferenceNumberError);
  });

  test('should throw for single character company prefix', () => {
    expect(() => parse('I/JA/1900/10001')).toThrow(ReferenceNumberError);
  });
});

describe('referenceNumber.validateWithSeries', () => {
  test('should validate a known series (IHM/JA)', () => {
    const result = validateWithSeries('IHM/JA/1900/10001');
    expect(result.valid).toBe(true);
    expect(result.series).not.toBeNull();
    expect(result.series.companyPrefix).toBe('IHM');
    expect(result.warning).toBeNull();
  });

  test('should warn for unknown series', () => {
    const result = validateWithSeries('ABC/XY/500/1');
    expect(result.valid).toBe(true);
    expect(result.series).toBeNull();
    expect(result.warning).toContain('Unknown series');
  });
});

describe('referenceNumber.validateConsistency', () => {
  test('should pass when all three sources match', () => {
    const result = validateConsistency(
      'IHM/JA/1900/10001',
      'IHM/JA/1900/10001',
      'IHM/JA/1900/10001'
    );
    expect(result.valid).toBe(true);
    expect(result.mismatches).toEqual([]);
  });

  test('should detect filename mismatch', () => {
    const result = validateConsistency(
      'IHM/JA/1900/10001',
      'IHM/JA/1900/10002',
      'IHM/JA/1900/10001'
    );
    expect(result.valid).toBe(false);
    expect(result.mismatches).toEqual(['filename']);
  });

  test('should detect PDF mismatch', () => {
    const result = validateConsistency(
      'IHM/JA/1900/10001',
      'IHM/JA/1900/10001',
      'IHM/JA/1900/99999'
    );
    expect(result.valid).toBe(false);
    expect(result.mismatches).toEqual(['pdf']);
  });

  test('should detect both filename and PDF mismatch', () => {
    const result = validateConsistency(
      'IHM/JA/1900/10001',
      'IHM/JA/1900/10002',
      'IHM/JA/1900/10003'
    );
    expect(result.valid).toBe(false);
    expect(result.mismatches).toContain('filename');
    expect(result.mismatches).toContain('pdf');
  });

  test('should fail when a source is missing (null)', () => {
    const result = validateConsistency('IHM/JA/1900/10001', null, 'IHM/JA/1900/10001');
    expect(result.valid).toBe(false);
    expect(result.mismatches).toContain('filename');
  });

  test('should fail when a source is empty string', () => {
    const result = validateConsistency('IHM/JA/1900/10001', 'IHM/JA/1900/10001', '');
    expect(result.valid).toBe(false);
    expect(result.mismatches).toContain('pdf');
  });

  test('should trim whitespace before comparing', () => {
    const result = validateConsistency(
      ' IHM/JA/1900/10001 ',
      'IHM/JA/1900/10001',
      'IHM/JA/1900/10001 '
    );
    expect(result.valid).toBe(true);
  });
});

describe('referenceNumber.extractFromFilename', () => {
  test('should extract from underscore-separated filename', () => {
    expect(extractFromFilename('IHM_JA_1900_10001.zip')).toBe('IHM/JA/1900/10001');
  });

  test('should extract from underscore-separated with suffix', () => {
    expect(extractFromFilename('IHM_JA_1900_10001_form.pdf')).toBe('IHM/JA/1900/10001');
  });

  test('should extract from hyphen-separated filename', () => {
    expect(extractFromFilename('IHM-JA-1900-10001.pdf')).toBe('IHM/JA/1900/10001');
  });

  test('should extract from slash-separated filename', () => {
    expect(extractFromFilename('IHM/JA/1900/10001.pdf')).toBe('IHM/JA/1900/10001');
  });

  test('should return null for unrecognized filename', () => {
    expect(extractFromFilename('random_document.pdf')).toBeNull();
  });

  test('should return null for null input', () => {
    expect(extractFromFilename(null)).toBeNull();
  });

  test('should return null for empty string', () => {
    expect(extractFromFilename('')).toBeNull();
  });
});

describe('referenceNumber.extractPostingCode', () => {
  test('should extract posting code from a valid reference number', () => {
    expect(extractPostingCode('IHM/JA/1900/10001')).toBe('1900');
  });

  test('should extract posting code from a different series', () => {
    expect(extractPostingCode('ABC/XY/500/1')).toBe('500');
  });
});
