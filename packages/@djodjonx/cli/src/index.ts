/**
 * @djodjonx/gwen-cli — Public API exports
 *
 * Export all public functions and types for programmatic usage
 */

// Core functions
export { build, type BuildOptions, type BuildResult } from './core/builder/index.js';
export { prepare, type PrepareOptions, type PrepareResult } from './core/prepare/index.js';
export { dev, type DevOptions } from './core/dev.js';
export { lint, type LintOptions, type LintResult } from './core/lint.js';
export { format, type FormatOptions, type FormatResult } from './core/format.js';
export { loadGwenConfig, findConfigFile, type LoadConfigResult } from './core/config.js';

// Utils
export { logger, setLogLevel, type LogLevelConfig } from './utils/logger.js';
export { GLOBAL_ARGS } from './utils/args.js';
export { VERSION, PACKAGE_NAME, ExitCode } from './utils/constants.js';
export type { GwenOptions as GwenConfig } from '@djodjonx/gwen-schema';

// Core types
export type { Result } from './core/types/result.js';
export { ok, err, isOk, isErr, unwrap, map, mapErr, getOrElse } from './core/types/result.js';

export {
  GwenCliError,
  ConfigError,
  BuildError,
  ValidationError,
  DevServerError,
  PrepareError,
  createError,
} from './core/types/errors.js';
