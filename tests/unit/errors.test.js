'use strict';

const { AppError, ValidationError, AuthenticationError, AuthorizationError, NotFoundError, ConflictError, ReferenceNumberError } = require('../../src/utils/errors');

/**
 * Unit tests for custom error classes.
 */

describe('Custom Errors', () => {
  test('AppError should have correct properties', () => {
    const err = new AppError('Test error', 500, 'TEST_ERROR', { key: 'value' });
    expect(err.message).toBe('Test error');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('TEST_ERROR');
    expect(err.details).toEqual({ key: 'value' });
    expect(err.isOperational).toBe(true);
    expect(err instanceof Error).toBe(true);
  });

  test('AppError.toJSON should return structured response', () => {
    const err = new AppError('Test', 400, 'TEST', { field: 'name' });
    const json = err.toJSON();
    expect(json.error.code).toBe('TEST');
    expect(json.error.message).toBe('Test');
    expect(json.error.details).toEqual({ field: 'name' });
  });

  test('ValidationError should use 400 status', () => {
    const err = new ValidationError('Bad input', [{ field: 'email' }]);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  test('AuthenticationError should use 401 status', () => {
    const err = new AuthenticationError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('AUTHENTICATION_ERROR');
  });

  test('AuthorizationError should use 403 status', () => {
    const err = new AuthorizationError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('AUTHORIZATION_ERROR');
  });

  test('NotFoundError should use 404 status', () => {
    const err = new NotFoundError('User', 'abc-123');
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe("User 'abc-123' not found");
  });

  test('NotFoundError without identifier', () => {
    const err = new NotFoundError('Job');
    expect(err.message).toBe('Job not found');
  });

  test('ConflictError should use 409 status', () => {
    const err = new ConflictError('Email taken');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
  });

  test('ReferenceNumberError should use 400 status', () => {
    const err = new ReferenceNumberError('Invalid format', 'REF_INVALID', { received: 'xyz' });
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('REF_INVALID');
    expect(err.details).toEqual({ received: 'xyz' });
  });
});
