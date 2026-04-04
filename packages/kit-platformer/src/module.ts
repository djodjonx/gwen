/**
 * @file GWEN Module for @gwenjs/kit-platformer.
 *
 * Default export — register this in `modules` inside `gwen.config.ts`:
 *
 * ```ts
 * import platformer from '@gwenjs/kit-platformer/module'
 * export default defineConfig({ modules: [platformer()] })
 * ```
 */

import { defineGwenModule, definePluginTypes } from '@gwenjs/kit';
import { PlatformerKitPlugin } from './plugin/index';
import type { PlatformerKitConfig } from './plugin/index';

/**
 * GWEN module for the Platformer Kit.
 */
export default defineGwenModule<PlatformerKitConfig>({
  meta: { name: '@gwenjs/kit-platformer' },
  defaults: {},
  async setup(options, kit) {
    kit.addPlugin(PlatformerKitPlugin(options));

    kit.addAutoImports([{ name: 'usePlatformer', from: '@gwenjs/kit-platformer' }]);

    kit.addTypeTemplate({
      filename: 'kit-platformer.d.ts',
      getContents: () =>
        definePluginTypes({
          imports: ["import type { PlatformerKitService } from '@gwenjs/kit-platformer'"],
          provides: { platformer: 'PlatformerKitService' },
        }),
    });
  },
});
