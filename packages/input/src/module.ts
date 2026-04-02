/**
 * @file GWEN Module for @gwenengine/input.
 *
 * Default export — register this in `modules` inside `gwen.config.ts`:
 *
 * ```ts
 * import input from '@gwenengine/input/module'
 * export default defineConfig({ modules: [input()] })
 * ```
 */

import { defineGwenModule, definePluginTypes } from '@gwenengine/kit';
import { InputPlugin } from './index.js';
import type { InputPluginConfig } from './index.js';

/**
 * GWEN module for the Input plugin.
 */
export default defineGwenModule<InputPluginConfig>({
  defaults: {},
  async setup(options, kit) {
    kit.addPlugin(InputPlugin(options));

    kit.addAutoImports([
      { name: 'useKeyboard', from: '@gwenengine/input' },
      { name: 'useMouse', from: '@gwenengine/input' },
      { name: 'useGamepad', from: '@gwenengine/input' },
      { name: 'useInputMapper', from: '@gwenengine/input' },
    ]);

    kit.addTypeTemplate({
      filename: 'input.d.ts',
      getContents: () =>
        definePluginTypes({
          imports: [
            "import type { KeyboardInput } from '@gwenengine/input'",
            "import type { MouseInput } from '@gwenengine/input'",
            "import type { GamepadInput } from '@gwenengine/input'",
            "import type { InputMapper } from '@gwenengine/input'",
          ],
          provides: {
            keyboard: 'KeyboardInput',
            mouse: 'MouseInput',
            gamepad: 'GamepadInput',
            inputMapper: 'InputMapper',
          },
        }),
    });
  },
});
