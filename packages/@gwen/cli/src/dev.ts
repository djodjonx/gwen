/**
 * @gwen/cli — dev
 *
 * Lance le serveur de développement Vite depuis gwen.config.ts.
 * L'utilisateur n'a pas de vite.config.ts — GWEN le génère en mémoire.
 *
 * Usage : gwen dev [--port 3000] [--open]
 */

import path from 'node:path';
import { findConfigFile } from './config-parser.js';
import { prepare } from './prepare.js';
import { buildViteConfig } from './vite-config-builder.js';

/**
 * Options for dev server
 */
export interface DevOptions {
  /**
   * Project root directory (default: process.cwd()).
   * Must contain a gwen.config.ts file.
   */
  projectDir?: string;
  /**
   * HTTP server port (default: 3000).
   * If port is in use, Vite will auto-select the next available port.
   */
  port?: number;
  /**
   * Automatically open the browser when server starts.
   * Default: false
   */
  open?: boolean;
  /**
   * Enable detailed logging of dev server startup.
   * Default: false
   */
  verbose?: boolean;
}

/**
 * Start the GWEN development server
 *
 * Launches a Vite dev server with hot module replacement (HMR) and auto-rebuild.
 * Automatically generates .gwen/ (types, tsconfig) before starting.
 *
 * Does not return; runs until the user stops the process (Ctrl+C).
 *
 * @param options Dev server configuration
 * @throws Error if gwen.config.ts not found
 *
 * @example
 * ```typescript
 * import { dev } from '@gwen/cli';
 *
 * // Start on port 3000 and auto-open browser
 * await dev({
 *   projectDir: process.cwd(),
 *   port: 3000,
 *   open: true,
 *   verbose: true
 * });
 * ```
 */
export async function dev(options: DevOptions = {}): Promise<void> {
  const projectDir = path.resolve(options.projectDir ?? process.cwd());
  const port = options.port ?? 3000;

  // 1. Vérifier la config
  const configPath = findConfigFile(projectDir);
  if (!configPath) {
    console.error('[gwen dev] ❌ gwen.config.ts not found');
    process.exit(1);
  }

  // 2. Prepare — génère .gwen/ (types, tsconfig)
  await prepare({ projectDir, verbose: options.verbose });

  // 3. Construire la config Vite en mémoire depuis gwen.config.ts
  const viteConfig = await buildViteConfig(projectDir, configPath, {
    mode: 'development',
    port,
    open: options.open ?? false,
  });

  // 4. Lancer Vite programmatiquement
  const { createServer } = await import('vite');
  const server = await createServer(viteConfig);
  await server.listen();
  server.printUrls();

  console.log(`\n[gwen dev] 🚀 GWEN dev server running on http://localhost:${port}`);
}
