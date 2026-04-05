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
import type { AudioPluginConfig } from './index.js';

/**
 * GWEN module for the Audio plugin.
 *
 * Note: AudioPlugin is imported lazily inside setup() to avoid a circular
 * dependency between index.ts (which re-exports this module's default) and
 * module.ts (which needs AudioPlugin from index.ts). In CJS contexts (jiti)
 * circular deps at the top level can cause unresolvable undefined values.
 */
export default defineGwenModule<AudioPluginConfig>({
  meta: { name: '@gwenjs/audio' },
  defaults: {},
  async setup(options, kit) {
    // Lazy import breaks the index.ts ↔ module.ts circular dependency.
    const { AudioPlugin } = await import('./index.js');
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
