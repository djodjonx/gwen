/**
 * InputPlugin — manages all input devices (keyboard, mouse, gamepad).
 *
 * Registers keyboard, mouse, and gamepad via the engine's provide/inject registry.
 *
 * @example
 * ```typescript
 * import { InputPlugin } from '@gwenjs/input';
 *
 * export default defineConfig({
 *   plugins: [InputPlugin()],
 * });
 *
 * // In any plugin setup():
 * const keyboard = engine.inject('keyboard');
 * ```
 */

import { definePlugin } from '@gwenjs/kit';
import type { GwenEngine } from '@gwenjs/core';
import { KeyboardInput } from './keyboard';
import { MouseInput } from './mouse';
import { GamepadInput } from './gamepad';
import { InputMapper } from './mapping/InputMapper';
import type { InputMapConfig } from './mapping/types';

/** Services provided by InputPlugin via engine.inject(). */
export interface InputPluginServices {
  keyboard: KeyboardInput;
  mouse: MouseInput;
  gamepad: GamepadInput;
}

export interface InputPluginConfig {
  /** Canvas element for mouse position offset. */
  canvas?: HTMLCanvasElement;
  /** Event target for keyboard/mouse listeners (defaults to window). */
  eventTarget?: EventTarget;
  /** Deadzone for gamepad axes (0-1, default 0.15). */
  gamepadDeadzone?: number;
  /**
   * Optional input action map. If provided, registers an 'inputMapper'
   * service via engine.provide() — accessible by systems via
   * `engine.inject('inputMapper')`.
   */
  actionMap?: InputMapConfig;
}

export const InputPlugin = definePlugin((config: InputPluginConfig = {}) => {
  let keyboard: KeyboardInput;
  let mouse: MouseInput;
  let gamepad: GamepadInput;
  let target: EventTarget;

  return {
    name: '@gwenjs/input',

    setup(engine: GwenEngine): void {
      target =
        config.eventTarget ??
        (typeof window !== 'undefined' ? window : (globalThis as unknown as EventTarget));

      keyboard = new KeyboardInput();
      mouse = new MouseInput();
      gamepad = new GamepadInput(config.gamepadDeadzone ?? 0.15);

      keyboard.attach(target);
      mouse.attach(target, config.canvas);

      engine.provide('keyboard', keyboard);
      engine.provide('mouse', mouse);
      engine.provide('gamepad', gamepad);

      if (config.actionMap) {
        const mapper = new InputMapper();
        mapper.init(config.actionMap, keyboard, gamepad);
        engine.provide('inputMapper', mapper);
      }
    },

    onBeforeUpdate(_dt: number): void {
      keyboard.update();
      mouse.update();
      gamepad.update();
    },

    teardown(): void {
      keyboard.detach(target);
      mouse.detach(target);
      keyboard.reset();
      mouse.reset();
    },
  };
});

export { InputPlugin as default };
