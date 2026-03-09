/**
 * @file Legacy TS plugin type aliases — kept for backward compatibility.
 *
 * @deprecated Import from `../types/plugin` (or `@gwen/engine-core`) instead.
 *
 * All types previously defined here are now part of the unified `GwenPlugin`
 * interface in `types/plugin.ts`.
 */

export type {
  /** @deprecated Use `GwenPlugin` from `@gwen/engine-core` instead. */
  TsPlugin,
  /** @deprecated Use `GwenPlugin` from `@gwen/engine-core` instead. */
  PluginEntry,
} from './plugin';
