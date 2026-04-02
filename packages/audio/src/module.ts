/**
 * @file GWEN Module for @gwenjs/audio.
 *
 * Default export — register this in `modules` inside `gwen.config.ts`:
 *
 * ```ts
 * import audio from '@gwenjs/audio/module'
 * export default defineConfig({ modules: [audio()] })
 * ```
 */

import { defineGwenModule, definePluginTypes } from '@gwenjs/kit';
import { AudioPlugin } from './index.js';
import type { AudioPluginConfig } from './index.js';

/**
 * GWEN module for the Audio plugin.
 */
export default defineGwenModule<AudioPluginConfig>({
  meta: { name: '@gwenjs/audio' },
  defaults: {},
  async setup(options, kit) {
    kit.addPlugin(AudioPlugin(options));

    kit.addAutoImports([{ name: 'useAudio', from: '@gwenjs/audio' }]);

    kit.addTypeTemplate({
      filename: 'audio.d.ts',
      getContents: () =>
        definePluginTypes({
          imports: ["import type { AudioService } from '@gwenjs/audio'"],
          provides: { audio: 'AudioService' },
        }),
    });
  },
});
