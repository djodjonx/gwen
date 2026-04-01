/**
 * Build context
 * Maintains state during the build pipeline
 */

import type { GwenOptions } from '@gwenengine/schema';
import type { CoreVariant } from './variant-detector.js';

export interface BuildContext {
  projectDir: string;
  outDir: string;
  mode: 'release' | 'debug';
  variant: CoreVariant;
  dryRun: boolean;
  config?: GwenOptions;
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
    variant: 'light',
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
