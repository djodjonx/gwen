/**
 * Custom error types for GWEN CLI
 */

/**
 * Base error class for GWEN CLI operations
 */
export class GwenCliError extends Error {
  constructor(
    message: string,
    public code: string,
    public cause?: unknown,
  ) {
    super(message);
    this.name = 'GwenCliError';
    Object.setPrototypeOf(this, GwenCliError.prototype);
  }
}

/**
 * Config loading or validation error
 */
export class ConfigError extends GwenCliError {
  constructor(message: string, cause?: unknown) {
    super(message, 'CONFIG_ERROR', cause);
    this.name = 'ConfigError';
    Object.setPrototypeOf(this, ConfigError.prototype);
  }
}

/**
 * Build operation error
 */
export class BuildError extends GwenCliError {
  constructor(message: string, cause?: unknown) {
    super(message, 'BUILD_ERROR', cause);
    this.name = 'BuildError';
    Object.setPrototypeOf(this, BuildError.prototype);
  }
}

/**
 * Validation error
 */
export class ValidationError extends GwenCliError {
  constructor(message: string, cause?: unknown) {
    super(message, 'VALIDATION_ERROR', cause);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Dev server error
 */
export class DevServerError extends GwenCliError {
  constructor(message: string, cause?: unknown) {
    super(message, 'DEV_SERVER_ERROR', cause);
    this.name = 'DevServerError';
    Object.setPrototypeOf(this, DevServerError.prototype);
  }
}

/**
 * Prepare operation error
 */
export class PrepareError extends GwenCliError {
  constructor(message: string, cause?: unknown) {
    super(message, 'PREPARE_ERROR', cause);
    this.name = 'PrepareError';
    Object.setPrototypeOf(this, PrepareError.prototype);
  }
}

/**
 * Helper to create error from unknown value
 */
export function createError(error: unknown, code: string): GwenCliError {
  if (error instanceof GwenCliError) return error;
  if (error instanceof Error) return new GwenCliError(error.message, code, error);
  return new GwenCliError(String(error), code);
}
