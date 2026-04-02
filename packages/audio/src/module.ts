/**
 * @file GWEN Module for @gwenengine/audio.
 *
 * Default export — register this in `modules` inside `gwen.config.ts`:
 *
 * ```ts
 * import audio from '@gwenengine/audio/module'
 * export default defineConfig({ modules: [audio()] })
 * ```
 */

import { defineGwenModule, definePluginTypes } from '@gwenengine/kit';
import { AudioPlugin } from './index.js';
import type { AudioPluginConfig } from './index.js';

/**
 * GWEN module for the Audio plugin.
 */
export default defineGwenModule<AudioPluginConfig>({
  defaults: {},
  async setup(options, kit) {
    kit.addPlugin(AudioPlugin(options));

    kit.addAutoImports([{ name: 'useAudio', from: '@gwenengine/audio' }]);

    kit.addTypeTemplate({
      filename: 'audio.d.ts',
      getContents: () =>
        definePluginTypes({
          imports: ["import type { AudioService } from '@gwenengine/audio'"],
          provides: { audio: 'AudioService' },
        }),
    });
  },
});
