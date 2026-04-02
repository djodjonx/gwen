/**
 * @file RFC-002 — satisfiesPluginContract & definePluginTypes
 */

import type { GwenPlugin } from '@gwenjs/core';

// ─── satisfiesPluginContract ─────────────────────────────────────────────────

/**
 * Runtime no-op that enforces a plugin contract at compile time.
 *
 * Use this when a plugin package promises to satisfy a specific contract shape.
 * The type system will error at compile time if the plugin does not match.
 *
 * @example
 * ```typescript
 * const myPlugin = satisfiesPluginContract<{ name: 'my-plugin' } & GwenPlugin>(
 *   definePlugin(() => ({ name: 'my-plugin', setup() {} }))()
 * )
 * ```
 */
export function satisfiesPluginContract<Contract extends GwenPlugin>(plugin: Contract): Contract {
  return plugin;
}

// ─── definePluginTypes ───────────────────────────────────────────────────────

/**
 * Options for {@link definePluginTypes}.
 */
export interface PluginTypesOptions {
  /**
   * Key-value map of service keys → TypeScript type names to add to `GwenProvides`.
   * @example { physics2d: 'Physics2DAPI' }
   */
  provides?: Record<string, string>;
  /**
   * Key-value map of hook event names → handler signatures to add to `GwenRuntimeHooks`.
   * @example { 'physics2d:step': '(dt: number) => void' }
   */
  hooks?: Record<string, string>;
  /** Names to import from other packages (for reference in generated types). */
  imports?: string[];
}

/**
 * Generates TypeScript declaration merging syntax for a plugin package.
 *
 * Call this in a plugin package's build step to produce the `.d.ts` fragment
 * that augments `@gwenjs/core` with the services and hooks your plugin provides.
 *
 * Returns an empty string if no `provides` or `hooks` are specified.
 *
 * @example
 * ```typescript
 * const dts = definePluginTypes({
 *   provides: { physics2d: 'Physics2DAPI' },
 *   hooks: { 'physics2d:step': '(dt: number) => void' },
 * })
 * // Produces:
 * // declare module '@gwenjs/core' {
 * //   interface GwenProvides { physics2d: Physics2DAPI }
 * //   interface GwenRuntimeHooks { 'physics2d:step': (dt: number) => void }
 * // }
 * ```
 */
export function definePluginTypes(options: PluginTypesOptions): string {
  const blocks: string[] = [];

  if (options.provides && Object.keys(options.provides).length > 0) {
    const lines = Object.entries(options.provides).map(([k, v]) => `    ${k}: ${v}`);
    blocks.push(`  interface GwenProvides {\n${lines.join('\n')}\n  }`);
  }

  if (options.hooks && Object.keys(options.hooks).length > 0) {
    const lines = Object.entries(options.hooks).map(([k, v]) => `    '${k}': ${v}`);
    blocks.push(`  interface GwenRuntimeHooks {\n${lines.join('\n')}\n  }`);
  }

  if (blocks.length === 0) return '';
  return `declare module '@gwenjs/core' {\n${blocks.join('\n')}\n}`;
}
