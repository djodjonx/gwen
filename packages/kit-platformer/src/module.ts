/**
 * @file GWEN Module for @gwenengine/kit-platformer.
 *
 * Default export — register this in `modules` inside `gwen.config.ts`:
 *
 * ```ts
 * import platformer from '@gwenengine/kit-platformer/module'
 * export default defineConfig({ modules: [platformer()] })
 * ```
 */

import { defineGwenModule, definePluginTypes } from '@gwenengine/kit';
import { PlatformerKitPlugin } from './plugin.js';
import type { PlatformerKitConfig } from './plugin.js';

/**
 * GWEN module for the Platformer Kit.
 */
export default defineGwenModule<PlatformerKitConfig>({
  defaults: {},
  async setup(options, kit) {
    kit.addPlugin(PlatformerKitPlugin(options));

    kit.addAutoImports([{ name: 'usePlatformer', from: '@gwenengine/kit-platformer' }]);

    kit.addTypeTemplate({
      filename: 'kit-platformer.d.ts',
      getContents: () =>
        definePluginTypes({
          imports: ["import type { PlatformerKitService } from '@gwenengine/kit-platformer'"],
          provides: { platformer: 'PlatformerKitService' },
        }),
    });
  },
});
