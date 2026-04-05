/**
 * @file GWEN Module for @gwenjs/input.
 *
 * Default export — register this in `modules` inside `gwen.config.ts`:
 *
 * ```ts
 * import input from '@gwenjs/input/module'
 * export default defineConfig({ modules: [input()] })
 * ```
 */

import { defineGwenModule, definePluginTypes } from '@gwenjs/kit';
import { InputPlugin } from './plugin/index';
import type { InputPluginConfig } from './plugin/index';

/**
 * GWEN module for the Input plugin.
 */
export default defineGwenModule<InputPluginConfig>({
  meta: { name: '@gwenjs/input' },
  defaults: {},
  async setup(options, kit) {
    kit.addPlugin(InputPlugin(options));

    kit.addAutoImports([
      { name: 'useKeyboard', from: '@gwenjs/input' },
      { name: 'useMouse', from: '@gwenjs/input' },
      { name: 'useGamepad', from: '@gwenjs/input' },
      { name: 'useInputMapper', from: '@gwenjs/input' },
    ]);

    kit.addTypeTemplate({
      filename: 'input.d.ts',
      getContents: () =>
        definePluginTypes({
          imports: [
            "import type { KeyboardInput } from '@gwenjs/input'",
            "import type { MouseInput } from '@gwenjs/input'",
            "import type { GamepadInput } from '@gwenjs/input'",
            "import type { InputMapper } from '@gwenjs/input'",
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
