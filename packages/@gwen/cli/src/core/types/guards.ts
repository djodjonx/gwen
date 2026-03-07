/**
 * Type guards and error utilities.
 */

/**
 * Check if value is an Error instance.
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Parse error to message string.
 */
export function parseError(error: unknown): string {
  if (isError(error)) return error.message;
  return String(error);
}

/**
 * Parse error to error code.
 */
export function parseErrorCode(error: unknown): string {
  if (isError(error) && 'code' in error) {
    return String((error as any).code);
  }
  return 'UNKNOWN_ERROR';
}
