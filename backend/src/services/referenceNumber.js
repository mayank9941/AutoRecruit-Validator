'use strict';

const { ReferenceNumberError } = require('../utils/errors');
const { REFERENCE_NUMBER } = require('../config/constants');

/**
 * Reference Number Parser & Validator.
 *
 * Per SKILL.md §5: Every candidate is identified by a structured reference number,
 * e.g. IHM/JA/1900/10001. The validator must be posting-series-aware (parameterized
 * on the prefix pattern), not hardcoded to IHM/JA/.
 *
 * Per SKILL.md §5: "Before any candidate record is created or any AI resource is spent,
 * validate that all three match." (filename, Excel row, PDF-declared value)
 *
 * This module is a pure function — no I/O, no database calls. Fully testable in isolation.
 */

/**
 * Parse a reference number into its structured components.
 *
 * @param {string} referenceNumber - e.g. "IHM/JA/1900/10001"
 * @param {RegExp} [pattern] - Custom pattern override (defaults to standard pattern)
 * @returns {{ company: string, series: string, postingCode: string, sequence: string, raw: string }}
 * @throws {ReferenceNumberError} if the reference number is invalid
 */
function parse(referenceNumber, pattern = null) {
  if (referenceNumber === null || referenceNumber === undefined) {
    throw new ReferenceNumberError(
      'Reference number is required',
      'REFERENCE_NUMBER_EMPTY',
      { received: referenceNumber }
    );
  }

  if (typeof referenceNumber !== 'string') {
    throw new ReferenceNumberError(
      'Reference number must be a string',
      'REFERENCE_NUMBER_INVALID_TYPE',
      { received: typeof referenceNumber }
    );
  }

  const trimmed = referenceNumber.trim();

  if (trimmed.length === 0) {
    throw new ReferenceNumberError(
      'Reference number cannot be empty',
      'REFERENCE_NUMBER_EMPTY',
      { received: '' }
    );
  }

  const activePattern = pattern || REFERENCE_NUMBER.DEFAULT_PATTERN;
  const match = trimmed.match(activePattern);

  if (!match) {
    // Try to give a more specific error
    const parts = trimmed.split('/');

    if (parts.length < 4) {
      throw new ReferenceNumberError(
        `Reference number has ${parts.length} segments, expected 4 (COMPANY/SERIES/POSTING_CODE/SEQUENCE)`,
        'REFERENCE_NUMBER_INCOMPLETE',
        { received: trimmed, segmentCount: parts.length, expected: 4 }
      );
    }

    if (parts.length > 4) {
      throw new ReferenceNumberError(
        `Reference number has ${parts.length} segments, expected 4`,
        'REFERENCE_NUMBER_EXTRA_SEGMENTS',
        { received: trimmed, segmentCount: parts.length, expected: 4 }
      );
    }

    // 4 segments but failed pattern — check each part
    const errors = [];

    if (!/^[A-Z]{2,10}$/.test(parts[0])) {
      errors.push(`Company prefix '${parts[0]}' must be 2-10 uppercase letters`);
    }
    if (!/^[A-Z]{2,10}$/.test(parts[1])) {
      errors.push(`Series marker '${parts[1]}' must be 2-10 uppercase letters`);
    }
    if (!/^\d{1,10}$/.test(parts[2])) {
      errors.push(`Posting code '${parts[2]}' must be numeric`);
    }
    if (!/^\d{1,10}$/.test(parts[3])) {
      errors.push(`Sequence number '${parts[3]}' must be numeric`);
    }

    throw new ReferenceNumberError(
      `Invalid reference number format: ${errors.join('; ')}`,
      'REFERENCE_NUMBER_INVALID_FORMAT',
      { received: trimmed, validationErrors: errors }
    );
  }

  return {
    company: match[1],
    series: match[2],
    postingCode: match[3],
    sequence: match[4],
    raw: trimmed,
  };
}

/**
 * Validate that a reference number matches a known series.
 *
 * @param {string} referenceNumber
 * @returns {{ valid: boolean, parsed: Object, series: Object|null, warning: string|null }}
 */
function validateWithSeries(referenceNumber) {
  const parsed = parse(referenceNumber);
  const seriesKey = `${parsed.company}/${parsed.series}`;
  const knownSeries = REFERENCE_NUMBER.KNOWN_SERIES[seriesKey];

  if (!knownSeries) {
    return {
      valid: true,
      parsed,
      series: null,
      warning: `Unknown series '${seriesKey}' — reference number format is valid but series is not registered`,
    };
  }

  return {
    valid: true,
    parsed,
    series: knownSeries,
    warning: null,
  };
}

/**
 * Three-source consistency check.
 *
 * Per SKILL.md §5: "Before any candidate record is created or any AI resource is spent,
 * validate that all three match."
 *
 * Per PRD v3 FR-05: "Before any AI processing, the system confirms the reference number
 * matches across three sources: the ZIP/PDF filenames, the Excel row, and the reference
 * number printed inside the PDF form itself."
 *
 * @param {string} excelRefNum - Reference number from the Excel row
 * @param {string} filenameRefNum - Reference number extracted from the ZIP/PDF filename
 * @param {string} pdfRefNum - Reference number extracted from inside the PDF form
 * @returns {{ valid: boolean, mismatches: string[], details: Object }}
 */
function validateConsistency(excelRefNum, filenameRefNum, pdfRefNum) {
  const sources = {
    excel: excelRefNum?.trim() || null,
    filename: filenameRefNum?.trim() || null,
    pdf: pdfRefNum?.trim() || null,
  };

  const mismatches = [];
  const details = {};

  // All three must be non-null
  const nullSources = Object.entries(sources)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (nullSources.length > 0) {
    return {
      valid: false,
      mismatches: nullSources,
      details: {
        ...sources,
        error: `Missing reference number from: ${nullSources.join(', ')}`,
      },
    };
  }

  // Use Excel as the reference (it's the import source)
  const reference = sources.excel;

  if (sources.filename !== reference) {
    mismatches.push('filename');
  }

  if (sources.pdf !== reference) {
    mismatches.push('pdf');
  }

  details.excel = sources.excel;
  details.filename = sources.filename;
  details.pdf = sources.pdf;
  details.reference = reference;

  return {
    valid: mismatches.length === 0,
    mismatches,
    details,
  };
}

/**
 * Extract a reference number from a filename.
 *
 * Handles patterns like:
 * - IHM_JA_1900_10001.zip → IHM/JA/1900/10001
 * - IHM-JA-1900-10001.pdf → IHM/JA/1900/10001
 * - IHM_JA_1900_10001_form.pdf → IHM/JA/1900/10001
 *
 * @param {string} filename
 * @returns {string|null} The extracted reference number or null if not found
 */
function extractFromFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return null;
  }

  // Remove file extension
  const baseName = filename.replace(/\.[^.]+$/, '');

  // Try underscore separator: IHM_JA_1900_10001 or IHM_JA_1900_10001_form
  const underscoreMatch = baseName.match(/^([A-Z]{2,10})_([A-Z]{2,10})_(\d{1,10})_(\d{1,10})/);
  if (underscoreMatch) {
    return `${underscoreMatch[1]}/${underscoreMatch[2]}/${underscoreMatch[3]}/${underscoreMatch[4]}`;
  }

  // Try hyphen separator: IHM-JA-1900-10001
  const hyphenMatch = baseName.match(/^([A-Z]{2,10})-([A-Z]{2,10})-(\d{1,10})-(\d{1,10})/);
  if (hyphenMatch) {
    return `${hyphenMatch[1]}/${hyphenMatch[2]}/${hyphenMatch[3]}/${hyphenMatch[4]}`;
  }

  // Try slash separator (already in canonical form)
  const slashMatch = baseName.match(/^([A-Z]{2,10})\/([A-Z]{2,10})\/(\d{1,10})\/(\d{1,10})/);
  if (slashMatch) {
    return `${slashMatch[1]}/${slashMatch[2]}/${slashMatch[3]}/${slashMatch[4]}`;
  }

  return null;
}

/**
 * Extract the posting code from a reference number.
 * Used for automatic candidate-to-job grouping.
 *
 * @param {string} referenceNumber
 * @returns {string} The posting code segment
 */
function extractPostingCode(referenceNumber) {
  const parsed = parse(referenceNumber);
  return parsed.postingCode;
}

module.exports = {
  parse,
  validateWithSeries,
  validateConsistency,
  extractFromFilename,
  extractPostingCode,
};
