/**
 * @file GWEN Module for @gwenjs/debug.
 *
 * Default export — register this in `modules` inside `gwen.config.ts`:
 *
 * ```ts
 * import debug from '@gwenjs/debug/module'
 * export default defineConfig({ modules: [debug()] })
 * ```
 */

import { defineGwenModule, definePluginTypes } from '@gwenjs/kit';
import { DebugPlugin } from './plugin/index';
import type { DebugPluginConfig } from './types';

/**
 * GWEN module for the Debug plugin.
 */
export default defineGwenModule<DebugPluginConfig>({
  meta: { name: '@gwenjs/debug' },
  defaults: {},
  async setup(options, kit) {
    kit.addPlugin(DebugPlugin(options));

    kit.addAutoImports([{ name: 'useDebug', from: '@gwenjs/debug' }]);

    kit.addTypeTemplate({
      filename: 'debug.d.ts',
      getContents: () =>
        definePluginTypes({
          imports: ["import type { DebugService } from '@gwenjs/debug'"],
          provides: { debug: 'DebugService' },
        }),
    });
  },
});
