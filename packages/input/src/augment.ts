/**
 * @file GwenProvides augmentations for @gwenjs/input.
 *
 * Importing any symbol from `@gwenjs/input` automatically augments
 * `@gwenjs/core` with typed input service keys.
 */

import type { KeyboardInput } from './plugin/keyboard';
import type { MouseInput } from './plugin/mouse';
import type { GamepadInput } from './plugin/gamepad';
import type { InputMapper } from './plugin/mapping/InputMapper';

declare module '@gwenjs/core' {
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
