/**
 * Dev server core implementation
 *
 * Starts development server with hot module reloading.
 * Uses Vite internally for file watching and bundling.
 */

import { createServer } from 'vite';
import { resolve } from 'pathe';
import { logger } from '../utils/logger.js';
import { prepare } from './prepare/index.js';
import { buildViteConfig } from '../vite-config-builder.js';
import { loadGwenConfig } from './config.js';
import { DEFAULT_PORT_DEV } from '../utils/constants.js';

/**
 * Options for dev server
 *
 * @property {number} [port] - Port to listen on (default: 3000)
 * @property {boolean} [open] - Auto-open browser on start
 * @property {boolean} [verbose] - Enable verbose logging
 * @property {boolean} [debug] - Enable debug mode
 */
export interface DevOptions {
  projectDir?: string;
  port?: number;
  open?: boolean;
  verbose?: boolean;
  debug?: boolean;
}

/**
 * Start development server
 *
 * Uses Vite internally for hot module reloading.
 * Watches source files and rebuilds on change.
 *
 * @param opts - Development server options
 *
 * @example
 * ```typescript
 * await dev({ port: 3001, open: true });
 * ```
 */
export async function dev(opts: DevOptions = {}): Promise<void> {
  const projectDir = resolve(opts.projectDir ?? process.cwd());
  const port = opts.port ?? DEFAULT_PORT_DEV;
  const open = opts.open ?? false;

  logger.info(`Starting dev server on port ${port}...`);

  // 1. Load config to ensure it exists and get path
  let configPath: string;
  try {
    const loaded = await loadGwenConfig(projectDir);
    configPath = loaded.configPath;
    logger.debug('Config loaded successfully for dev server');
  } catch (error: any) {
    logger.error(`Failed to load config: ${error.message}`);
    throw error;
  }

  // 2. Run prepare to generate .gwen/ folder (tsconfig, types, index.html)
  logger.debug('Preparing project artifacts...');
  const prepareResult = await prepare({
    projectDir,
    verbose: opts.verbose,
  });

  if (!prepareResult.success) {
    logger.error('Failed to prepare project artifacts');
    for (const err of prepareResult.errors) {
      logger.error(`  • ${err}`);
    }
    throw new Error('Prepare failed');
  }

  // 3. Build Vite config
  const viteConfig = await buildViteConfig(projectDir, configPath, {
    mode: 'development',
    port,
    open,
    debug: opts.debug,
  });

  // 4. Create and start Vite server
  try {
    const server = await createServer(viteConfig);
    await server.listen();

    logger.success('Dev server is running.');
    if (open) {
      logger.debug('Opening browser...');
    }

    server.printUrls();
  } catch (error: any) {
    logger.error(`Failed to start dev server: ${error.message}`);
    throw error;
  }
}
