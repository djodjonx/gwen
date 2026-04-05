// @vitest-environment jsdom
/**
 * InputMapper unit tests.
 *
 * Tests semantic action queries (isActionPressed, isActionJustPressed,
 * isActionJustReleased, readAxis2D) against mocked keyboard and gamepad inputs.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InputMapper } from '../src/plugin/mapping/InputMapper';
import { KeyboardInput } from '../src/plugin/keyboard';
import { GamepadInput } from '../src/plugin/gamepad';
import { BindingType, InputType } from '../src/plugin/mapping/types';
import type { InputMapConfig } from '../src/plugin/mapping/types';

// ── Shared config fixture ─────────────────────────────────────────────────────

const jumpConfig: InputMapConfig = {
  name: 'test',
  actions: {
    Jump: {
      type: InputType.Button,
      bindings: [{ type: BindingType.Key, key: 'Space' as any }],
    },
    Move: {
      type: InputType.Axis2D,
      bindings: [
        {
          type: BindingType.Composite2D,
          left: { type: BindingType.Key, key: 'ArrowLeft' as any },
          right: { type: BindingType.Key, key: 'ArrowRight' as any },
          up: { type: BindingType.Key, key: 'ArrowUp' as any },
          down: { type: BindingType.Key, key: 'ArrowDown' as any },
        },
      ],
    },
    Fire: {
      type: InputType.Button,
      bindings: [{ type: BindingType.GamepadButton, button: 0 as any, gamepadIndex: 0 }],
    },
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function pressKey(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
}

function releaseKey(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('InputMapper', () => {
  let mapper: InputMapper;
  let keyboard: KeyboardInput;
  let gamepad: GamepadInput;

  beforeEach(() => {
    keyboard = new KeyboardInput();
    keyboard.attach(window);
    gamepad = new GamepadInput();
    mapper = new InputMapper();
    mapper.init(jumpConfig, keyboard, gamepad);
  });

  describe('isActionPressed()', () => {
    it('returns false when no key is held', () => {
      keyboard.update();
      expect(mapper.isActionPressed('Jump')).toBe(false);
    });

    it('returns true while the bound key is held', () => {
      pressKey('Space');
      keyboard.update(); // justPressed
      keyboard.update(); // held — no new keydown
      expect(mapper.isActionPressed('Jump')).toBe(true);
    });
  });

  describe('isActionJustPressed()', () => {
    it('returns true only on the first press frame', () => {
      pressKey('Space');
      keyboard.update();
      expect(mapper.isActionJustPressed('Jump')).toBe(true);
    });

    it('returns false on subsequent frames while still held', () => {
      pressKey('Space');
      keyboard.update(); // justPressed
      keyboard.update(); // held — no new keydown
      expect(mapper.isActionJustPressed('Jump')).toBe(false);
    });
  });

  describe('isActionJustReleased()', () => {
    it('returns true on the first frame after key release', () => {
      pressKey('Space');
      keyboard.update();
      releaseKey('Space');
      keyboard.update();
      expect(mapper.isActionJustReleased('Jump')).toBe(true);
    });
  });

  describe('readAxis2D()', () => {
    it('returns {x:0, y:0} when no directional key is pressed', () => {
      keyboard.update();
      expect(mapper.readAxis2D('Move')).toEqual({ x: 0, y: 0 });
    });

    it('returns {x:1, y:0} when ArrowRight is held', () => {
      pressKey('ArrowRight');
      keyboard.update();
      expect(mapper.readAxis2D('Move')).toEqual({ x: 1, y: 0 });
    });

    it('returns {x:0, y:0} for unknown Axis2D action name', () => {
      keyboard.update();
      expect(mapper.readAxis2D('NonExistent')).toEqual({ x: 0, y: 0 });
    });

    it('returns {x:0, y:0} for Button action queried as Axis2D', () => {
      keyboard.update();
      expect(mapper.readAxis2D('Jump')).toEqual({ x: 0, y: 0 });
    });
  });
});
