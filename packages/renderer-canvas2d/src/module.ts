/**
 * @file GWEN Module for @gwenengine/renderer-canvas2d.
 *
 * Default export — register this in `modules` inside `gwen.config.ts`:
 *
 * ```ts
 * import renderer from '@gwenengine/renderer-canvas2d/module'
 * export default defineConfig({ modules: [renderer()] })
 * ```
 */

import { defineGwenModule, definePluginTypes } from '@gwenengine/kit';
import { Canvas2DRenderer } from './renderer.js';
import type { Canvas2DRendererConfig } from './renderer.js';

/**
 * GWEN module for the Canvas 2D Renderer plugin.
 */
export default defineGwenModule<Canvas2DRendererConfig>({
  defaults: {},
  async setup(options, kit) {
    kit.addPlugin(Canvas2DRenderer(options));

    kit.addAutoImports([{ name: 'useCanvas2D', from: '@gwenengine/renderer-canvas2d' }]);

    kit.addTypeTemplate({
      filename: 'renderer-canvas2d.d.ts',
      getContents: () =>
        definePluginTypes({
          imports: ["import type { RendererService } from '@gwenengine/renderer-canvas2d'"],
          provides: { renderer: 'RendererService' },
        }),
    });
  },
});
