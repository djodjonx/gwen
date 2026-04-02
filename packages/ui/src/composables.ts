/**
 * @file Composables for @gwenjs/ui.
 *
 * Must be called inside an active engine context:
 * inside `defineSystem()`, `engine.run(fn)`, or a plugin lifecycle hook.
 */

import { useEngine, GwenPluginNotFoundError } from '@gwenjs/core';
import type { HtmlUI } from './index.js';
import './augment.js';

/**
 * Returns the HTML UI service registered by `HtmlUIPlugin()`.
 *
 * @returns The {@link HtmlUI} instance.
 * @throws {GwenPluginNotFoundError} If `HtmlUIPlugin()` is not registered.
 *
 * @example
 * ```typescript
 * export const uiSystem = defineSystem(() => {
 *   const ui = useHtmlUI()
 *   onUpdate(() => {
 *     ui.text(scoreEntity, 'score', `${score}`)
 *   })
 * })
 * ```
 */
export function useHtmlUI(): HtmlUI {
  const engine = useEngine();
  const service = engine.tryInject('htmlUI');
  if (service) return service;
  throw new GwenPluginNotFoundError({
    pluginName: '@gwenjs/ui',
    hint: "Add '@gwenjs/ui' to modules in gwen.config.ts",
    docsUrl: 'https://gwenengine.dev/plugins/ui',
  });
}
