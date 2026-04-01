/**
 * @file definePlugin — factory API for GWEN plugins (RFC-002).
 *
 * Returns a typed factory function. Plugin authors provide a factory that
 * returns a plain object conforming to the {@link GwenPlugin} interface
 * (RFC-001: `setup(engine)` / `teardown()`).
 *
 * @example TypeScript plugin
 * ```typescript
 * import { definePlugin } from '@gwenengine/kit'
 *
 * export const AudioPlugin = definePlugin((config: AudioConfig) => ({
 *   name: 'AudioPlugin',
 *   setup(engine) {
 *     const manager = new AudioManager(config)
 *     engine.provide('audio', manager)
 *   },
 *   teardown() { manager.dispose() },
 * }))
 *
 * // Create an instance:
 * const plugin = AudioPlugin({ volume: 0.8 })
 * await engine.use(plugin)
 * ```
 */

import type { GwenPlugin, GwenEngine } from '@gwenengine/core';

export type { GwenEngine };

/**
 * A typed factory function returned by {@link definePlugin}.
 *
 * @typeParam Options - Options the factory accepts (`void` = no options needed).
 * @typeParam P - The plugin type the factory produces.
 */
export type GwenPluginFactory<Options, P extends GwenPlugin> = [Options] extends [void]
  ? () => P
  : (options?: Options) => P;

/**
 * Define a GWEN plugin via a factory function.
 *
 * The factory receives optional options and returns a plain object conforming
 * to the {@link GwenPlugin} interface. `definePlugin` wraps this factory and
 * returns a typed factory function.
 *
 * @param factory - Receives options, returns a `GwenPlugin` object.
 * @returns A typed factory function. Call it (with options if required) to get
 *          a plugin instance ready for `engine.use()`.
 *
 * @example
 * ```typescript
 * export const MyPlugin = definePlugin((opts: { debug?: boolean } = {}) => ({
 *   name: 'MyPlugin',
 *   setup(engine) {
 *     // register services, hook into lifecycle
 *   },
 *   teardown() {
 *     // cleanup
 *   },
 * }))
 * ```
 */
export function definePlugin<F extends (options?: any) => GwenPlugin>(
  factory: F,
): GwenPluginFactory<Parameters<F> extends [] ? void : Parameters<F>[0], ReturnType<F>> {
  /**
   * Plugin factory function. Calling it (with or without `new`) returns a fresh
   * plugin instance with its own closure state.
   */
  function PluginFactory(options?: Parameters<F>[0]): ReturnType<F> {
    return factory(options) as ReturnType<F>;
  }
  return PluginFactory as unknown as GwenPluginFactory<
    Parameters<F> extends [] ? void : Parameters<F>[0],
    ReturnType<F>
  >;
}
