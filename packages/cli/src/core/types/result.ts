/**
 * Result type for operations that can fail
 * Provides type-safe error handling without exceptions for expected errors
 */

/**
 * Represents either a successful result or a failure
 * @example
 * ```typescript
 * const result = await build();
 * if (result.ok) {
 *   console.log(result.value.durationMs);
 * } else {
 *   console.error(result.error.message);
 * }
 * ```
 */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

/**
 * Create a success result
 */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/**
 * Create an error result
 */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/**
 * Type guard to check if result is successful
 */
export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok === true;
}

/**
 * Type guard to check if result is failed
 */
export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return result.ok === false;
}

/**
 * Unwrap result or throw error
 * Useful for converting Result to Promise semantics
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw result.error;
}

/**
 * Map result value if ok, pass through error if not
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  if (result.ok) return ok(fn(result.value));
  return result;
}

/**
 * Map result error if not ok, pass through value if ok
 */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  if (result.ok) return result;
  return err(fn(result.error));
}

/**
 * Get value or default
 */
export function getOrElse<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (result.ok) return result.value;
  return defaultValue;
}
