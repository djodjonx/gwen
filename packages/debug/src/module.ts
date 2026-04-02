/**
 * @file GWEN Module for @gwenengine/debug.
 *
 * Default export — register this in `modules` inside `gwen.config.ts`:
 *
 * ```ts
 * import debug from '@gwenengine/debug/module'
 * export default defineConfig({ modules: [debug()] })
 * ```
 */

import { defineGwenModule, definePluginTypes } from '@gwenengine/kit';
import { DebugPlugin } from './index.js';
import type { DebugPluginConfig } from './types.js';

/**
 * GWEN module for the Debug plugin.
 */
export default defineGwenModule<DebugPluginConfig>({
  defaults: {},
  async setup(options, kit) {
    kit.addPlugin(DebugPlugin(options));

    kit.addAutoImports([{ name: 'useDebug', from: '@gwenengine/debug' }]);

    kit.addTypeTemplate({
      filename: 'debug.d.ts',
      getContents: () =>
        definePluginTypes({
          imports: ["import type { DebugService } from '@gwenengine/debug'"],
          provides: { debug: 'DebugService' },
        }),
    });
  },
});
