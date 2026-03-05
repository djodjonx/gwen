/**
 * Build context
 * Maintains state during the build pipeline
 */

import type { GwenConfig } from '../../utils/validation.js';

export interface BuildContext {
  projectDir: string;
  outDir: string;
  mode: 'release' | 'debug';
  dryRun: boolean;
  config?: GwenConfig;
  configPath?: string;
  errors: string[];
  warnings: string[];
  startTime: number;
}

/**
 * Create initial build context
 */
export function createBuildContext(
  projectDir: string,
  outDir: string,
  mode: 'release' | 'debug',
  dryRun: boolean,
): BuildContext {
  return {
    projectDir,
    outDir,
    mode,
    dryRun,
    errors: [],
    warnings: [],
    startTime: Date.now(),
  };
}

/**
 * Get duration in milliseconds
 */
export function getDuration(ctx: BuildContext): number {
  return Date.now() - ctx.startTime;
}
