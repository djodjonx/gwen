/**
 * Global logger using Consola
 *
 * Provides structured logging with levels:
 * - error: Always shown
 * - warn: Always shown
 * - info: Default level
 * - debug: Only if --verbose
 * - trace: Only if --debug
 *
 * @example
 * ```typescript
 * import { logger, setLogLevel } from './utils/logger.js';
 *
 * setLogLevel({ verbose: true, debug: false });
 * logger.info('Starting...');
 * logger.debug('Details');  // Will show
 * logger.trace('Debug details');  // Won't show
 * ```
 */

import { createConsola } from 'consola';

export const logger = createConsola({
  level: 3, // Info by default
  formatOptions: {
    date: false,
    colors: true,
  },
});

export interface LogLevelConfig {
  verbose?: boolean;
  debug?: boolean;
}

/**
 * Set global log level based on CLI flags
 *
 * @param config - Verbose and debug flags from CLI
 */
export function setLogLevel(config: LogLevelConfig): void {
  if (config.debug) {
    logger.level = 5; // Trace
  } else if (config.verbose) {
    logger.level = 4; // Debug
  } else {
    logger.level = 3; // Info
  }
}
