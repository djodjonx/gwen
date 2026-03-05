/**
 * Zod schemas for configuration validation
 * Provides runtime type-safety with clear error messages
 */

import { z } from 'zod';

/**
 * Engine configuration schema
 */
export const EngineConfigSchema = z.object({
  maxEntities: z
    .number()
    .int()
    .min(100, 'maxEntities must be at least 100')
    .max(1_000_000, 'maxEntities cannot exceed 1,000,000')
    .default(10_000),
  targetFPS: z
    .number()
    .min(30, 'targetFPS must be at least 30')
    .max(240, 'targetFPS cannot exceed 240')
    .default(60),
  debug: z.boolean().default(false),
});

/**
 * HTML configuration schema
 */
export const HtmlConfigSchema = z.object({
  title: z.string().default('GWEN Project'),
  background: z
    .string()
    .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'background must be valid hex color')
    .default('#000000'),
});

/**
 * Plugin info schema
 */
export const PluginInfoSchema = z.object({
  symbolName: z.string(),
  packageName: z.string(),
  type: z.enum(['wasm', 'js']),
});

/**
 * Full GWEN configuration schema
 */
export const GwenConfigSchema = z.object({
  engine: EngineConfigSchema,
  html: HtmlConfigSchema.optional(),
  plugins: z.array(PluginInfoSchema).optional().default([]),
  scenes: z.array(z.string()).optional().default([]),
});

export type GwenConfig = z.infer<typeof GwenConfigSchema>;

/**
 * Port validation schema
 * Valid ports: 1024-65535 (non-privileged range)
 */
export const PortSchema = z.coerce
  .number()
  .int()
  .min(1024, 'Port must be >= 1024')
  .max(65535, 'Port must be <= 65535');

/**
 * Path validation schema
 * Ensures path is relative and doesn't contain traversal sequences
 */
export const SafePathSchema = z
  .string()
  .min(1, 'Path cannot be empty')
  .refine((path) => !path.includes('..'), 'Path traversal not allowed');

/**
 * Build mode validation
 */
export const BuildModeSchema = z.enum(['release', 'debug']).default('release');

/**
 * File path validation
 * Ensures path doesn't traverse outside base directory
 */
export function validatePath(userPath: string, baseDir: string): string {
  const resolved = require('path').resolve(baseDir, userPath);
  if (!resolved.startsWith(baseDir)) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}
