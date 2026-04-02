/**
 * Module-first framework context loader for CLI commands.
 *
 * This module resolves `gwen.config.ts` through `@gwenjs/app`, executes
 * declared module setup functions, and exposes the resulting runtime plugins.
 */

import { GwenApp, resolveGwenConfig, type ResolvedGwenConfig } from '@gwenjs/app';
import type { GwenPlugin } from '@gwenjs/kit';

/**
 * Resolved module-first framework context.
 */
export interface GwenFrameworkContext {
  /** Fully resolved app-layer configuration. */
  config: ResolvedGwenConfig;
  /** Runtime plugins contributed by module setup. */
  plugins: GwenPlugin[];
}

/**
 * Load framework context for the given project directory.
 *
 * @param projectDir Absolute project root path.
 * @returns Module-resolved framework context.
 */
export async function loadFrameworkContext(projectDir: string): Promise<GwenFrameworkContext> {
  const config = await resolveGwenConfig(projectDir);
  const app = new GwenApp();
  await app.setupModules(config);

  return {
    config,
    plugins: app.plugins,
  };
}
