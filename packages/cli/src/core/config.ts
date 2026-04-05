/**
 * Configuration loader using @gwenjs/app/resolve and @gwenjs/schema.
 */

import path from 'node:path';
import {
  assertModuleFirstInput,
  resolveConfig,
  type GwenConfigInput,
  type GwenOptions,
} from '@gwenjs/schema';
import { loadRawGwenConfig, GwenConfigLoadError } from '@gwenjs/app/resolve';
import { loadConfig } from 'c12';
import { logger } from '../utils/logger.js';
import { CONFIG_FILE_NAMES } from '../utils/constants.js';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export interface LoadConfigResult {
  config: GwenOptions;
  configPath: string;
}

export interface LoadConfigOptions {
  /** Current working directory */
  cwd: string;
  /** Whether to search in parent directories. Defaults to true. */
  upward?: boolean;
}

/**
 * Load and resolve GWEN configuration.
 *
 * Uses {@link loadRawGwenConfig} from `@gwenjs/app/resolve` to correctly
 * handle CJS/ESM interop when the jiti-register hook is active (RFC-011).
 *
 * @param options - Loading options or cwd path.
 * @returns Resolved configuration and absolute config path.
 */
export async function loadGwenConfig(
  options: LoadConfigOptions | string,
): Promise<LoadConfigResult> {
  const cwd = typeof options === 'string' ? options : options.cwd;

  logger.debug('Loading config from:', cwd);

  let rawConfig: GwenConfigInput;
  let configPath: string;

  try {
    const { config, configFile } = await loadRawGwenConfig(cwd);
    rawConfig = config as GwenConfigInput;
    configPath = path.isAbsolute(configFile) ? configFile : path.resolve(cwd, configFile);
  } catch (error: unknown) {
    if (error instanceof GwenConfigLoadError) {
      throw new Error(`Config file not found. Expected one of: ${CONFIG_FILE_NAMES.join(', ')}`);
    }
    throw error;
  }

  logger.debug(`[loadGwenConfig] Found config file: ${configPath}`);

  assertModuleFirstInput(rawConfig);
  const resolved = resolveConfig(rawConfig);
  resolved.rootDir = cwd;
  resolved.dev = process.env.NODE_ENV === 'development';

  return {
    config: resolved,
    configPath,
  };
}

/**
 * Find config file without loading it (for info command)
 */
export async function findConfigFile(cwd: string): Promise<string | null> {
  try {
    const { configFile } = await loadConfig({
      name: 'gwen',
      cwd,
    });
    return configFile ?? null;
  } catch (error: unknown) {
    logger.debug(`findConfigFile failed: ${getErrorMessage(error)}`);
    return null;
  }
}
