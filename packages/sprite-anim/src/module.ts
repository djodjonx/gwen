/**
 * @file GWEN Module for @gwenjs/sprite-anim.
 *
 * Default export — register this in `modules` inside `gwen.config.ts`:
 *
 * ```ts
 * import spriteAnim from '@gwenjs/sprite-anim/module'
 * export default defineConfig({ modules: [spriteAnim()] })
 * ```
 */

import { defineGwenModule, definePluginTypes } from '@gwenjs/kit';
import { SpriteAnimPlugin } from './index';
import type { SpriteAnimPluginConfig } from './types';

/**
 * GWEN module for the Sprite Animator plugin.
 */
export default defineGwenModule<SpriteAnimPluginConfig>({
  meta: { name: '@gwenjs/sprite-anim' },
  defaults: {},
  async setup(options, kit) {
    kit.addPlugin(SpriteAnimPlugin(options));

    kit.addAutoImports([{ name: 'useSpriteAnim', from: '@gwenjs/sprite-anim' }]);

    kit.addTypeTemplate({
      filename: 'sprite-anim.d.ts',
      getContents: () =>
        definePluginTypes({
          imports: ["import type { SpriteAnimatorService } from '@gwenjs/sprite-anim'"],
          provides: { animator: 'SpriteAnimatorService' },
        }),
    });
  },
});
