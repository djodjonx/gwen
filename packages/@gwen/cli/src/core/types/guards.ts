/**
 * Type guards and error utilities
 */

import type { ZodError } from 'zod';

/**
 * Check if value is an Error instance
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Check if value is a ZodError
 */
export function isZodError(value: unknown): value is ZodError {
  return isError(value) && (value as any).issues !== undefined;
}

/**
 * Parse error to message string
 * Handles multiple error types gracefully
 */
export function parseError(error: unknown): string {
  if (isError(error)) return error.message;
  if (isZodError(error)) {
    const issue = error.issues[0];
    return issue?.message ?? 'Validation failed';
  }
  return String(error);
}

/**
 * Parse error to error code
 */
export function parseErrorCode(error: unknown): string {
  if (isError(error) && 'code' in error) {
    return String((error as any).code);
  }
  if (isZodError(error)) {
    return 'VALIDATION_ERROR';
  }
  return 'UNKNOWN_ERROR';
}
