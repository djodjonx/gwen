/**
 * InputPlugin — TsPlugin that manages all input devices
 *
 * Registers keyboard, mouse, and gamepad inputs as services.
 * Other plugins resolve them via api.services in their onInit().
 *
 * @example
 * ```typescript
 * import { InputPlugin } from '@gwen/plugin-input';
 *
 * engine.registerSystem(new InputPlugin());
 *
 * // In PlayerController.onInit():
 * const keyboard = api.services.get<KeyboardInput>('keyboard');
 * const mouse = api.services.get<MouseInput>('mouse');
 * ```
 */

import type { TsPlugin, EngineAPI } from '@gwen/engine-core';
import { KeyboardInput } from './keyboard';
import { MouseInput } from './mouse';
import { GamepadInput } from './gamepad';

export { KeyboardInput } from './keyboard';
export { MouseInput } from './mouse';
export { GamepadInput } from './gamepad';
export type { KeyState } from './keyboard';
export type { MouseButton, MouseButtonState, MousePosition } from './mouse';
export type { GamepadAxis } from './gamepad';

export interface InputPluginConfig {
  /** Canvas element for mouse position offset. */
  canvas?: HTMLCanvasElement;
  /** Event target for keyboard/mouse listeners (defaults to window). */
  eventTarget?: EventTarget;
  /** Deadzone for gamepad axes (0-1, default 0.15). */
  gamepadDeadzone?: number;
}

export class InputPlugin implements TsPlugin {
  readonly name = 'InputPlugin';

  private keyboard!: KeyboardInput;
  private mouse!: MouseInput;
  private gamepad!: GamepadInput;
  private target!: EventTarget;
  private config: InputPluginConfig;

  constructor(config: InputPluginConfig = {}) {
    this.config = config;
  }

  onInit(api: EngineAPI): void {
    this.target = this.config.eventTarget ?? (typeof window !== 'undefined' ? window : globalThis as unknown as EventTarget);

    this.keyboard = new KeyboardInput();
    this.mouse = new MouseInput();
    this.gamepad = new GamepadInput(this.config.gamepadDeadzone ?? 0.15);

    this.keyboard.attach(this.target);
    this.mouse.attach(this.target, this.config.canvas);

    // Register as services so other plugins can consume them
    api.services.register('keyboard', this.keyboard);
    api.services.register('mouse', this.mouse);
    api.services.register('gamepad', this.gamepad);
  }

  onBeforeUpdate(_api: EngineAPI, _dt: number): void {
    // Update input states BEFORE game logic reads them
    this.keyboard.update();
    this.mouse.update();
    // Gamepad is poll-based — no update needed
  }

  onDestroy(): void {
    this.keyboard.detach(this.target);
    this.mouse.detach(this.target);
    this.keyboard.reset();
    this.mouse.reset();
  }
}
