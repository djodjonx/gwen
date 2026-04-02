/**
 * Global constants for CLI
 */

export const VERSION = '0.2.0';
export const PACKAGE_NAME = '@gwenjs/cli';

export const DEFAULT_PORT_DEV = 3000;
export const DEFAULT_PORT_PREVIEW = 4173;

export const GWEN_DIR = '.gwen';
export const CONFIG_FILE_NAMES = ['gwen.config.ts', 'engine.config.ts'] as const;

/**
 * Exit codes for CLI
 */
export enum ExitCode {
  SUCCESS = 0,
  ERROR_UNKNOWN = 1,
  ERROR_CONFIG = 2,
  ERROR_BUILD = 3,
  ERROR_VALIDATION = 4,
}
