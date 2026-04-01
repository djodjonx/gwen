/**
 * Configuration loader using C12 and @gwenengine/schema.
 */

import { loadConfig } from 'c12';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { resolveConfig, type GwenConfigInput, type GwenOptions } from '@gwenengine/schema';
import { logger } from '../utils/logger.js';
import { CONFIG_FILE_NAMES } from '../utils/constants.js';

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
 * @param options - Loading options or cwd path.
 * @returns Resolved configuration and absolute config path.
 */
export async function loadGwenConfig(
  options: LoadConfigOptions | string,
): Promise<LoadConfigResult> {
  const cwd = typeof options === 'string' ? options : options.cwd;

  logger.debug('Loading config from:', cwd);

  const { config, configFile } = await loadConfig<GwenConfigInput>({
    name: 'gwen',
    cwd,
    packageJson: false,
    defaults: {},
  });

  if (!configFile) {
    throw new Error(`Config file not found. Expected one of: ${CONFIG_FILE_NAMES.join(', ')}`);
  }

  const absolutePath = path.isAbsolute(configFile) ? configFile : path.resolve(cwd, configFile);

  if (!existsSync(absolutePath)) {
    throw new Error(`Config file found by C12 but does not exist on disk: ${absolutePath}`);
  }

  logger.debug(`[loadGwenConfig] Found config file: ${absolutePath}`);

  const resolved = resolveConfig(config ?? {});
  resolved.rootDir = cwd;
  resolved.dev = process.env.NODE_ENV === 'development';

  return {
    config: resolved,
    configPath: absolutePath,
  };
}

/**
 * Find config file without loading it (for info command)
 */
export async function findConfigFile(cwd: string): Promise<string | null> {
  const { configFile } = await loadConfig({
    name: 'gwen',
    cwd,
  });
  return configFile ?? null;
}
