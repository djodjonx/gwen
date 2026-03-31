/**
 * GWEN Configuration Schema - Validation
 *
 * Lightweight runtime validation without external dependencies (no Zod).
 *
 * @module @djodjonx/gwen-schema
 */

import type { GwenOptions } from './config';

/**
 * Validate a resolved GWEN configuration.
 *
 * @param config - The resolved configuration to validate
 * @returns The same config object if valid
 * @throws Error with stable message if validation fails
 */
export function validateResolvedConfig(config: GwenOptions): GwenOptions {
  const maxEntities = config.engine.maxEntities;
  if (!Number.isInteger(maxEntities) || maxEntities < 100 || maxEntities > 1_000_000) {
    throw new Error('maxEntities must be between 100 and 1000000');
  }

  const targetFPS = config.engine.targetFPS;
  if (typeof targetFPS !== 'number' || targetFPS < 30 || targetFPS > 240) {
    throw new Error('targetFPS must be between 30 and 240');
  }

  if (config.engine.loop !== 'internal' && config.engine.loop !== 'external') {
    throw new Error("engine.loop must be 'internal' or 'external'");
  }

  const maxDelta = config.engine.maxDeltaSeconds;
  if (typeof maxDelta !== 'number' || maxDelta <= 0 || maxDelta > 1) {
    throw new Error('engine.maxDeltaSeconds must be > 0 and <= 1');
  }

  const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  if (!hexColorRegex.test(config.html.background)) {
    throw new Error('background must be a valid hex color');
  }

  if (!Array.isArray(config.plugins)) {
    throw new Error('plugins must be an array');
  }

  return config;
}
