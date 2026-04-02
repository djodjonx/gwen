/**
 * @file GWEN Module for @gwenengine/sprite-anim.
 *
 * Default export — register this in `modules` inside `gwen.config.ts`:
 *
 * ```ts
 * import spriteAnim from '@gwenengine/sprite-anim/module'
 * export default defineConfig({ modules: [spriteAnim()] })
 * ```
 */

import { defineGwenModule, definePluginTypes } from '@gwenengine/kit';
import { SpriteAnimPlugin } from './index.js';
import type { SpriteAnimPluginConfig } from './types.js';

/**
 * GWEN module for the Sprite Animator plugin.
 */
export default defineGwenModule<SpriteAnimPluginConfig>({
  defaults: {},
  async setup(options, kit) {
    kit.addPlugin(SpriteAnimPlugin(options));

    kit.addAutoImports([{ name: 'useSpriteAnim', from: '@gwenengine/sprite-anim' }]);

    kit.addTypeTemplate({
      filename: 'sprite-anim.d.ts',
      getContents: () =>
        definePluginTypes({
          imports: ["import type { SpriteAnimatorService } from '@gwenengine/sprite-anim'"],
          provides: { animator: 'SpriteAnimatorService' },
        }),
    });
  },
});
