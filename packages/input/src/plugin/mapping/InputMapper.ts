// packages/@gwenjs/plugin-input/src/mapping/InputMapper.ts
import type { KeyboardInput } from '../keyboard.js';
import type { GamepadInput } from '../gamepad.js';
import { BindingType, InputType } from './types.js';
import type { ActionConfig, AnyBinding, InputMapConfig } from './types.js';

/**
 * InputMapper — translates an InputMapConfig into semantic action queries.
 *
 * Registered as the 'inputMapper' service in api.services when an actionMap
 * is passed to InputPlugin config.
 *
 * Design:
 * - Uses Map<string, ActionConfig> for O(1) lookups — no StringPool needed.
 * - String keys are config constants, never serialized to WASM memory.
 * - Public API is string-only — no string|number overloads in the hot path.
 * - Resolve this service in onInit(), never in onUpdate().
 *
 * @example
 * // In a system's onInit:
 * const mapper = api.services.get('inputMapper') as InputMapper;
 *
 * // In onBeforeUpdate:
 * const move = mapper.readAxis2D('Move');   // { x: -1, y: 0 }
 * const jump = mapper.isActionJustPressed('Jump'); // true on first frame
 */
export class InputMapper {
  private actionMap = new Map<string, ActionConfig>();
  private keyboard!: KeyboardInput;
  private gamepad!: GamepadInput;

  /** Initialize with config and input services. Call in onInit(), not onUpdate(). */
  init(config: InputMapConfig, keyboard: KeyboardInput, gamepad: GamepadInput): void {
    this.keyboard = keyboard;
    this.gamepad = gamepad;
    this.actionMap.clear();
    for (const [name, action] of Object.entries(config.actions)) {
      this.actionMap.set(name, action);
    }
  }

  /** True if any Button binding for this action is currently held. */
  isActionPressed(action: string): boolean {
    const cfg = this.actionMap.get(action);
    if (!cfg || cfg.type !== InputType.Button) return false;
    return this._evalBindings(cfg.bindings, 'pressed');
  }

  /** True on the first frame the action transitions to pressed (rising edge). */
  isActionJustPressed(action: string): boolean {
    const cfg = this.actionMap.get(action);
    if (!cfg || cfg.type !== InputType.Button) return false;
    return this._evalBindings(cfg.bindings, 'justPressed');
  }

  /** True on the first frame the action transitions to released (falling edge). */
  isActionJustReleased(action: string): boolean {
    const cfg = this.actionMap.get(action);
    if (!cfg || cfg.type !== InputType.Button) return false;
    return this._evalBindings(cfg.bindings, 'justReleased');
  }

  /**
   * Returns a normalized {x, y} vector from an Axis2D action.
   * Returns {x:0, y:0} for unknown actions or non-Axis2D types.
   */
  readAxis2D(action: string): { x: number; y: number } {
    const cfg = this.actionMap.get(action);
    if (!cfg || cfg.type !== InputType.Axis2D) return { x: 0, y: 0 };

    for (const b of cfg.bindings) {
      if (b.type === BindingType.Composite2D) {
        const left = this._isBound(b.left, 'pressed') ? -1 : 0;
        const right = this._isBound(b.right, 'pressed') ? 1 : 0;
        const up = this._isBound(b.up, 'pressed') ? -1 : 0;
        const down = this._isBound(b.down, 'pressed') ? 1 : 0;
        const x = left + right;
        const y = up + down;
        if (x !== 0 || y !== 0) return { x, y };
      }
      if (b.type === BindingType.GamepadAxis) {
        const stick = this.gamepad.getLeftStick(b.gamepadIndex ?? 0);
        if (stick.x !== 0 || stick.y !== 0) return stick;
      }
    }
    return { x: 0, y: 0 };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private _evalBindings(
    bindings: AnyBinding[],
    mode: 'pressed' | 'justPressed' | 'justReleased',
  ): boolean {
    for (let i = 0; i < bindings.length; i++) {
      const binding = bindings[i];
      if (binding && this._isBound(binding, mode)) return true;
    }
    return false;
  }

  private _isBound(b: AnyBinding, mode: 'pressed' | 'justPressed' | 'justReleased'): boolean {
    if (b.type === BindingType.Key) {
      if (mode === 'pressed') return this.keyboard.isPressed(b.key);
      if (mode === 'justPressed') return this.keyboard.isJustPressed(b.key);
      if (mode === 'justReleased') return this.keyboard.isJustReleased(b.key);
    }
    if (b.type === BindingType.GamepadButton) {
      const idx = b.gamepadIndex ?? 0;
      if (mode === 'pressed') return this.gamepad.isButtonPressed(idx, b.button);
      if (mode === 'justPressed') return this.gamepad.isButtonJustPressed(idx, b.button);
      if (mode === 'justReleased') return this.gamepad.isButtonJustReleased(idx, b.button);
    }
    return false;
  }
}
