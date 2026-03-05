/**
 * Configuration loader using C12
 *
 * Loads gwen.config.ts safely without regex parsing.
 * Validates using Zod schema for runtime type-safety.
 *
 * @example
 * ```typescript
 * const result = await loadGwenConfig(process.cwd());
 * console.log(result.config.engine.maxEntities); // Type-safe!
 * ```
 */

import { loadConfig } from 'c12';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { GwenConfigSchema, type GwenConfig } from '../utils/validation.js';
import { logger } from '../utils/logger.js';
import { CONFIG_FILE_NAMES } from '../utils/constants.js';

export interface LoadConfigResult {
  config: GwenConfig;
  configPath: string;
}

export interface LoadConfigOptions {
  /** Current working directory */
  cwd: string;
  /** Whether to search in parent directories. Defaults to true. */
  upward?: boolean;
}

/**
 * Load and validate GWEN configuration
 *
 * Uses C12 to safely load TypeScript config files without eval.
 * Validates with Zod for runtime type-safety and clear error messages.
 *
 * @param options - Loading options
 * @returns Validated configuration and config file path
 * @throws ZodError if validation fails with clear messages
 * @throws Error if config file not found
 */
export async function loadGwenConfig(
  options: LoadConfigOptions | string,
): Promise<LoadConfigResult> {
  const cwd = typeof options === 'string' ? options : options.cwd;

  logger.debug('Loading config from:', cwd);

  // C12 automatically searches for gwen.config.ts, gwen.config.js, etc.
  const { config, configFile } = await loadConfig({
    name: 'gwen',
    cwd,
    packageJson: false,
    defaults: {
      engine: {
        maxEntities: 10_000,
        targetFPS: 60,
        debug: false,
      },
    },
  });

  if (!configFile) {
    throw new Error(`Config file not found. Expected one of: ${CONFIG_FILE_NAMES.join(', ')}`);
  }

  // Ensure absolute path
  const absolutePath = path.isAbsolute(configFile) ? configFile : path.resolve(cwd, configFile);

  if (!existsSync(absolutePath)) {
    throw new Error(`Config file found by C12 but does not exist on disk: ${absolutePath}`);
  }

  logger.debug(`[loadGwenConfig] Found config file: ${absolutePath}`);

  // Validate with Zod
  try {
    const validated = GwenConfigSchema.parse(config);
    return {
      config: validated,
      configPath: absolutePath,
    };
  } catch (error) {
    logger.error('Config validation failed');
    throw error; // Zod error has clear messages
  }
}

/**
 * Find config file without loading it (for info command)
 *
 * @param cwd - Current working directory
 * @returns Config file path or null if not found
 */
export async function findConfigFile(cwd: string): Promise<string | null> {
  const { configFile } = await loadConfig({
    name: 'gwen',
    cwd,
  });
  return configFile ?? null;
}
