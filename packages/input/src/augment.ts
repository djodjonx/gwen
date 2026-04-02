/**
 * @file GwenProvides augmentations for @gwenengine/input.
 *
 * Importing any symbol from `@gwenengine/input` automatically augments
 * `@gwenengine/core` with typed input service keys.
 */

import type { KeyboardInput } from './keyboard.js';
import type { MouseInput } from './mouse.js';
import type { GamepadInput } from './gamepad.js';
import type { InputMapper } from './mapping/InputMapper.js';

declare module '@gwenengine/core' {
  /**
   * Input service slots in the engine's provide/inject registry.
   * Available after `engine.use(InputPlugin())` completes setup.
   */
  interface GwenProvides {
    keyboard: KeyboardInput;
    mouse: MouseInput;
    gamepad: GamepadInput;
    inputMapper: InputMapper;
  }
}

export {};
