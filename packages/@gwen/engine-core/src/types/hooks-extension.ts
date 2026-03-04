/**
 * @file Hook Extension Types
 *
 * Helpers for plugins to declare their custom hooks.
 * Used by CLI to auto-generate global hook types.
 *
 * @internal Do not export directly; use types.ts barrel export
 */

/**
 * Marker interface for plugins that provide custom hooks.
 *
 * Plugins extend this to declare hooks they want to expose.
 * The CLI (`gwen prepare`) scans for this and enriches GwenDefaultHooks.
 *
 * @typeParam T - Custom hooks interface
 *
 * @example
 * ```typescript
 * // In physics2d plugin
 * export interface Physics2DHooks {
 *   'physics:collision': (event: CollisionEvent) => void;
 *   'physics:beforeStep': (dt: number) => void;
 * }
 *
 * export class Physics2DPlugin implements TsPlugin, ProvidesHooks<Physics2DHooks> {
 *   readonly name = 'Physics2D';
 *   readonly __hooksType?: Physics2DHooks; // Marker for CLI
 *   // ...
 * }
 * ```
 *
 * Then in any plugin/system:
 * ```typescript
 * api.hooks.hook('physics:collision' as any, (event) => {
 *   // Now type-safe via generated gwen.d.ts
 * });
 * ```
 */
export interface ProvidesHooks<T extends Record<string, any>> {
  /**
   * Marker property for CLI type extraction.
   * Set to undefined at runtime — used only for TypeScript.
   *
   * @internal
   */
  readonly __hooksType?: T;
}
