'use strict';

const ExcelJS = require('exceljs');
const { logger } = require('../utils/logger');
const { ValidationError } = require('../utils/errors');
const { parse: parseRefNum, extractPostingCode } = require('./referenceNumber');

/**
 * Excel Import Service.
 *
 * Per SKILL.md §4: "Recruiter uploads an Excel workbook that lists all candidates
 * for a posting. Each row contains at minimum a reference number and a file path
 * to the candidate's ZIP archive."
 *
 * Per PRD v3 FR-04: Must handle .xlsx and .xls formats.
 * Per implementation plan Phase 3: Streams Excel rows, validates each reference number,
 * and yields structured row data.
 *
 * This module does NOT write to the database. It parses and validates only.
 * The controller orchestrates persistence.
 */

/**
 * Required column headers (case-insensitive).
 * WHY: The recruiter's Excel must contain at least these columns.
 */
const REQUIRED_COLUMNS = ['reference_number'];

/**
 * Known column mappings (flexible header detection).
 */
const COLUMN_ALIASES = {
  reference_number: [
    'reference_number', 'reference number', 'ref_number', 'ref number',
    'ref_no', 'ref no', 'reference', 'ref', 'application_number',
    'application number', 'candidate_id', 'candidate id',
  ],
  candidate_name: [
    'candidate_name', 'candidate name', 'name', 'full_name', 'full name',
    'applicant_name', 'applicant name',
  ],
  candidate_email: [
    'candidate_email', 'candidate email', 'email', 'email_address',
    'email address', 'applicant_email', 'applicant email',
  ],
  zip_path: [
    'zip_path', 'zip path', 'file_path', 'file path', 'archive_path',
    'archive path', 'zip_file', 'zip file', 'attachment', 'file',
  ],
};

/**
 * Detect column mapping from header row.
 *
 * @param {string[]} headers - Array of header strings from the first row
 * @returns {{ mapping: Object, warnings: string[] }}
 */
function detectColumns(headers) {
  const mapping = {};
  const warnings = [];
  const normalizedHeaders = headers.map((h) =>
    h ? h.toString().toLowerCase().trim() : ''
  );

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const index = normalizedHeaders.findIndex((h) => aliases.includes(h));
    if (index !== -1) {
      mapping[field] = index;
    }
  }

  // Check required columns
  for (const required of REQUIRED_COLUMNS) {
    if (mapping[required] === undefined) {
      throw new ValidationError(
        `Required column '${required}' not found in Excel headers. ` +
        `Found headers: ${headers.join(', ')}. ` +
        `Accepted aliases: ${COLUMN_ALIASES[required].join(', ')}`
      );
    }
  }

  // Warn about missing optional columns
  if (mapping.candidate_name === undefined) {
    warnings.push('Column "candidate_name" not found — names will be extracted from PDFs');
  }
  if (mapping.zip_path === undefined) {
    warnings.push('Column "zip_path" not found — ZIP files must be uploaded separately');
  }

  return { mapping, warnings };
}

/**
 * Parse an Excel file buffer and extract candidate rows.
 *
 * @param {Buffer} buffer - The Excel file content
 * @param {string} expectedPostingCode - The job's posting code (for validation)
 * @returns {Promise<{ rows: Object[], failedRows: Object[], warnings: string[], totalRows: number }>}
 */
async function parseExcelBuffer(buffer, expectedPostingCode) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new ValidationError('Excel file has no worksheets');
  }

  // Read header row
  const headerRow = worksheet.getRow(1);
  const headers = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = cell.value ? cell.value.toString() : '';
  });

  if (headers.length === 0) {
    throw new ValidationError('Excel file has no headers in the first row');
  }

  const { mapping, warnings } = detectColumns(headers);

  const rows = [];
  const failedRows = [];
  let totalRows = 0;

  // Iterate data rows (skip header)
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) {
      return; // Skip header
    }

    totalRows++;

    const rawData = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      rawData[headers[colNumber - 1] || `col_${colNumber}`] = cell.value;
    });

    // Extract mapped fields
    const referenceNumberRaw = row.getCell(mapping.reference_number + 1).value;
    const referenceNumber = referenceNumberRaw
      ? referenceNumberRaw.toString().trim()
      : null;

    const candidateName = mapping.candidate_name !== undefined
      ? (row.getCell(mapping.candidate_name + 1).value?.toString().trim() || null)
      : null;

    const candidateEmail = mapping.candidate_email !== undefined
      ? (row.getCell(mapping.candidate_email + 1).value?.toString().trim() || null)
      : null;

    const zipPath = mapping.zip_path !== undefined
      ? (row.getCell(mapping.zip_path + 1).value?.toString().trim() || null)
      : null;

    // Validate reference number
    if (!referenceNumber) {
      failedRows.push({
        rowNumber,
        referenceNumber: null,
        errorType: 'MISSING_REFERENCE',
        errorMessage: 'Reference number is empty',
        rawRowData: rawData,
      });
      return;
    }

    try {
      const parsed = parseRefNum(referenceNumber);

      // Check posting code matches the expected job
      if (expectedPostingCode && parsed.postingCode !== expectedPostingCode) {
        failedRows.push({
          rowNumber,
          referenceNumber,
          errorType: 'POSTING_CODE_MISMATCH',
          errorMessage: `Reference number posting code '${parsed.postingCode}' does not match expected '${expectedPostingCode}'`,
          rawRowData: rawData,
        });
        return;
      }

      rows.push({
        rowNumber,
        referenceNumber,
        parsedRefNum: parsed,
        candidateName,
        candidateEmail,
        zipPath,
        rawRowData: rawData,
      });
    } catch (error) {
      failedRows.push({
        rowNumber,
        referenceNumber,
        errorType: 'INVALID_REFERENCE',
        errorMessage: error.message,
        rawRowData: rawData,
      });
    }
  });

  logger.info(
    {
      totalRows,
      validRows: rows.length,
      failedRows: failedRows.length,
      warnings: warnings.length,
    },
    'Excel file parsed'
  );

  return { rows, failedRows, warnings, totalRows };
}

module.exports = {
  parseExcelBuffer,
  detectColumns,
  REQUIRED_COLUMNS,
  COLUMN_ALIASES,
};
