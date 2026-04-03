/**
 * @file GWEN module for `@gwenjs/renderer-canvas2d`.
 *
 * Register this module in `gwen.config.ts` to automatically add
 * `Canvas2DRenderer` as a plugin, expose the `useCanvas2D` auto-import, and
 * generate the typed `renderer` service declaration.
 *
 * @example
 * ```typescript
 * import renderer from '@gwenjs/renderer-canvas2d/module';
 * import { defineConfig } from '@gwenjs/kit';
 *
 * export default defineConfig({ modules: [renderer()] });
 * ```
 */

import { defineGwenModule, definePluginTypes } from '@gwenjs/kit';
import { Canvas2DRenderer } from './renderer.js';
import type { Canvas2DRendererConfig } from './renderer.js';

/**
 * GWEN module factory for the Canvas 2D renderer.
 *
 * Calling this function produces a module that:
 * - Adds `Canvas2DRenderer(options)` as a plugin.
 * - Registers `useCanvas2D` as an auto-import available in user code without
 *   explicit import statements.
 * - Emits a `renderer-canvas2d.d.ts` type template so the engine's
 *   `inject('renderer')` call returns a fully-typed {@link RendererService}.
 *
 * @example
 * ```typescript
 * import renderer from '@gwenjs/renderer-canvas2d/module';
 *
 * export default defineConfig({
 *   modules: [renderer({ background: '#000011', pixelRatio: 1 })],
 * });
 * ```
 *
 * @since 1.0.0
 */
export default defineGwenModule<Canvas2DRendererConfig>({
  meta: { name: '@gwenjs/renderer-canvas2d' },
  defaults: {},
  async setup(options, kit) {
    kit.addPlugin(Canvas2DRenderer(options));

    kit.addAutoImports([{ name: 'useCanvas2D', from: '@gwenjs/renderer-canvas2d' }]);

    kit.addTypeTemplate({
      filename: 'renderer-canvas2d.d.ts',
      getContents: () =>
        definePluginTypes({
          imports: ["import type { RendererService } from '@gwenjs/renderer-canvas2d'"],
          provides: { renderer: 'RendererService' },
        }),
    });
  },
});
