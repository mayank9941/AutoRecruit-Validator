'use strict';

const ExcelJS = require('exceljs');
const { parseExcelBuffer, detectColumns } = require('../../src/services/excelImport');
const { ValidationError } = require('../../src/utils/errors');

/**
 * Unit tests for the Excel Import service.
 */

async function createExcelBuffer(headers, rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));

  return workbook.xlsx.writeBuffer();
}

describe('excelImport.detectColumns', () => {
  test('should detect standard columns', () => {
    const { mapping } = detectColumns(['Reference Number', 'Candidate Name', 'Email', 'File Path']);
    expect(mapping.reference_number).toBe(0);
    expect(mapping.candidate_name).toBe(1);
    expect(mapping.candidate_email).toBe(2);
    expect(mapping.zip_path).toBe(3);
  });

  test('should detect columns with alternative aliases', () => {
    const { mapping } = detectColumns(['ref_no', 'name', 'email_address', 'zip_file']);
    expect(mapping.reference_number).toBe(0);
    expect(mapping.candidate_name).toBe(1);
    expect(mapping.candidate_email).toBe(2);
    expect(mapping.zip_path).toBe(3);
  });

  test('should throw if reference_number column is missing', () => {
    expect(() => detectColumns(['Name', 'Email'])).toThrow(ValidationError);
  });

  test('should warn about missing optional columns', () => {
    const { mapping, warnings } = detectColumns(['reference_number']);
    expect(mapping.reference_number).toBe(0);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.includes('candidate_name'))).toBe(true);
  });

  test('should be case-insensitive', () => {
    const { mapping } = detectColumns(['REFERENCE_NUMBER', 'CANDIDATE_NAME']);
    expect(mapping.reference_number).toBe(0);
    expect(mapping.candidate_name).toBe(1);
  });
});

describe('excelImport.parseExcelBuffer', () => {
  test('should parse a valid Excel file', async () => {
    const buffer = await createExcelBuffer(
      ['Reference Number', 'Candidate Name', 'Email'],
      [
        ['IHM/JA/1900/10001', 'Alice Smith', 'alice@example.com'],
        ['IHM/JA/1900/10002', 'Bob Jones', 'bob@example.com'],
      ]
    );

    const result = await parseExcelBuffer(buffer, '1900');

    expect(result.totalRows).toBe(2);
    expect(result.rows).toHaveLength(2);
    expect(result.failedRows).toHaveLength(0);
    expect(result.rows[0].referenceNumber).toBe('IHM/JA/1900/10001');
    expect(result.rows[0].candidateName).toBe('Alice Smith');
    expect(result.rows[1].referenceNumber).toBe('IHM/JA/1900/10002');
  });

  test('should flag rows with invalid reference numbers', async () => {
    const buffer = await createExcelBuffer(
      ['Reference Number'],
      [
        ['IHM/JA/1900/10001'],
        ['invalid-ref'],
        ['IHM/JA/1900/10003'],
      ]
    );

    const result = await parseExcelBuffer(buffer, '1900');

    expect(result.rows).toHaveLength(2);
    expect(result.failedRows).toHaveLength(1);
    expect(result.failedRows[0].errorType).toBe('INVALID_REFERENCE');
  });

  test('should flag rows with empty reference numbers', async () => {
    const buffer = await createExcelBuffer(
      ['Reference Number'],
      [
        ['IHM/JA/1900/10001'],
        [''],
      ]
    );

    const result = await parseExcelBuffer(buffer, '1900');

    expect(result.rows).toHaveLength(1);
    expect(result.failedRows).toHaveLength(1);
    expect(result.failedRows[0].errorType).toBe('MISSING_REFERENCE');
  });

  test('should flag rows with wrong posting code', async () => {
    const buffer = await createExcelBuffer(
      ['Reference Number'],
      [
        ['IHM/JA/1900/10001'],
        ['IHM/JA/2100/10002'], // Wrong posting code
      ]
    );

    const result = await parseExcelBuffer(buffer, '1900');

    expect(result.rows).toHaveLength(1);
    expect(result.failedRows).toHaveLength(1);
    expect(result.failedRows[0].errorType).toBe('POSTING_CODE_MISMATCH');
  });

  test('should throw if Excel has no data rows', async () => {
    const buffer = await createExcelBuffer(['Reference Number'], []);

    const result = await parseExcelBuffer(buffer, '1900');

    expect(result.totalRows).toBe(0);
    expect(result.rows).toHaveLength(0);
  });

  test('should throw if Excel has no headers', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Sheet1');
    const buffer = await workbook.xlsx.writeBuffer();

    await expect(parseExcelBuffer(buffer, '1900')).rejects.toThrow();
  });
});
