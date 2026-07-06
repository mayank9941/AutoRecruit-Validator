'use strict';

const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const ExcelJS = require('exceljs');
const { logger } = require('../utils/logger');
const { ValidationError } = require('../utils/errors');
const { parse: parseRefNum } = require('./referenceNumber');

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
  zip_link: [
    'zip_link', 'zip link', 'zip_path', 'zip path', 'file_path', 'file path',
    'archive_path', 'archive path', 'zip_file', 'zip file', 'attachment', 'file',
  ],
  pdf_link: [
    'pdf_link', 'pdf link', 'pdf_path', 'pdf path', 'form_path', 'form path',
    'pdf_file', 'pdf file',
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
  if (mapping.zip_link === undefined) {
    warnings.push('Column "zip_link" not found — ZIP URLs must be provided for each row');
  }
  if (mapping.pdf_link === undefined) {
    warnings.push('Column "pdf_link" not found — PDF URLs must be provided for each row');
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

    const zipLink = mapping.zip_link !== undefined
      ? (row.getCell(mapping.zip_link + 1).value?.toString().trim() || null)
      : null;

    const pdfLink = mapping.pdf_link !== undefined
      ? (row.getCell(mapping.pdf_link + 1).value?.toString().trim() || null)
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
        zipLink,
        pdfLink,
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

/**
 * Parse an Excel file using ExcelJS streaming reader.
 *
 * Writes the buffer to a temp file, then uses exceljs' WorkbookReader for
 * SAX-style streaming to keep memory usage low for large files.
 * Each parsed row yields { referenceNumber, zipLink, pdfLink, rowNumber, rawRowData }.
 *
 * @param {Buffer} buffer - The Excel file content
 * @param {string} expectedPostingCode - The job's posting code
 * @returns {Promise<{ rows: Object[], failedRows: Object[], warnings: string[], totalRows: number }>}
 */
async function parseExcelStream(buffer, expectedPostingCode) {
  const tempDir = path.join(os.tmpdir(), 'recruitment-imports');
  await fsp.mkdir(tempDir, { recursive: true });
  const tempFile = path.join(tempDir, `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.xlsx`);

  try {
    await fsp.writeFile(tempFile, buffer);

    const warnings = [];
    const rows = [];
    const failedRows = [];
    let totalRows = 0;
    let headers = [];
    let mapping = null;
    let headerParsed = false;

    await new Promise((resolve, reject) => {
      const reader = new ExcelJS.stream.xlsx.WorkbookReader(tempFile, {
        worksheets: 'emit',
        sharedStrings: 'cache',
        styles: 'cache',
        hyperlinks: 'cache',
      });

      reader.on('worksheet', (worksheet) => {
        worksheet.on('row', (row) => {
          const values = row.values;
          if (!values || values.length < 2) {return;}

          if (!headerParsed) {
            // First row is the header
            headerParsed = true;
            headers = [];
            for (let i = 1; i < values.length; i++) {
              headers[i - 1] = values[i] ? String(values[i]) : '';
            }

            const detection = detectColumns(headers);
            mapping = detection.mapping;
            warnings.push(...detection.warnings);
            return;
          }

          totalRows++;
          const rowNumber = row.number;

          const rawRowData = {};
          for (let i = 0; i < headers.length; i++) {
            const colIdx = i + 1;
            rawRowData[headers[i]] = values[colIdx] !== undefined ? values[colIdx] : null;
          }

          const referenceNumberRaw = mapping.reference_number !== undefined
            ? values[mapping.reference_number + 1]
            : null;
          const referenceNumber = referenceNumberRaw
            ? String(referenceNumberRaw).trim()
            : null;

          const zipLink = mapping.zip_link !== undefined
            ? (values[mapping.zip_link + 1] ? String(values[mapping.zip_link + 1]).trim() : null)
            : null;

          const pdfLink = mapping.pdf_link !== undefined
            ? (values[mapping.pdf_link + 1] ? String(values[mapping.pdf_link + 1]).trim() : null)
            : null;

          if (!referenceNumber) {
            failedRows.push({
              rowNumber,
              referenceNumber: null,
              errorType: 'MISSING_REFERENCE',
              errorMessage: 'Reference number is empty',
              rawRowData,
            });
            return;
          }

          try {
            const parsed = parseRefNum(referenceNumber);

            if (expectedPostingCode && parsed.postingCode !== expectedPostingCode) {
              failedRows.push({
                rowNumber,
                referenceNumber,
                errorType: 'POSTING_CODE_MISMATCH',
                errorMessage: `Reference number posting code '${parsed.postingCode}' does not match expected '${expectedPostingCode}'`,
                rawRowData,
              });
              return;
            }

            rows.push({
              rowNumber,
              referenceNumber,
              parsedRefNum: parsed,
              zipLink,
              pdfLink,
              rawRowData,
            });
          } catch (error) {
            failedRows.push({
              rowNumber,
              referenceNumber,
              errorType: 'INVALID_REFERENCE',
              errorMessage: error.message,
              rawRowData,
            });
          }
        });

        worksheet.on('done', () => {});
      });

      reader.on('end', () => resolve());
      reader.on('error', (err) => reject(err));

      reader.parse();
    });

    logger.info(
      { totalRows, validRows: rows.length, failedRows: failedRows.length, warnings: warnings.length },
      'Excel file parsed (streaming)'
    );

    return { rows, failedRows, warnings, totalRows };
  } finally {
    await fsp.unlink(tempFile).catch(() => {});
  }
}

module.exports = {
  parseExcelBuffer,
  parseExcelStream,
  detectColumns,
  REQUIRED_COLUMNS,
  COLUMN_ALIASES,
};
