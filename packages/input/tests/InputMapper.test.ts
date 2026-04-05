// packages/@gwenjs/plugin-input/tests/InputMapper.test.ts
import { describe, it, expect } from 'vitest';
import { InputMapper } from '../src/plugin/mapping/InputMapper.js';
import { Keys } from '../src/constants/keys.js';
import { GamepadButtons } from '../src/constants/gamepad.js';
import { BindingType, InputType } from '../src/plugin/mapping/types.js';

const makeKeyboard = (pressed: string[] = [], justPressed: string[] = []) => ({
  isPressed: (k: string) => pressed.includes(k),
  isJustPressed: (k: string) => justPressed.includes(k),
  isJustReleased: (_: string) => false,
});

const makeGamepad = (curr: number[] = [], prev: number[] = []) => ({
  isButtonPressed: (_: number, b: number) => curr.includes(b),
  isButtonJustPressed: (_: number, b: number) => curr.includes(b) && !prev.includes(b),
  isButtonJustReleased: (_: number, b: number) => !curr.includes(b) && prev.includes(b),
  getLeftStick: (_: number) => ({ x: 0, y: 0 }),
});

const moveMap = {
  name: 'test',
  actions: {
    Move: {
      type: InputType.Axis2D,
      bindings: [
        {
          type: BindingType.Composite2D,
          left: { type: BindingType.Key, key: Keys.A },
          right: { type: BindingType.Key, key: Keys.D },
          up: { type: BindingType.Key, key: Keys.W },
          down: { type: BindingType.Key, key: Keys.S },
        },
      ],
    },
    Jump: {
      type: InputType.Button,
      bindings: [
        { type: BindingType.Key, key: Keys.Space },
        { type: BindingType.GamepadButton, button: GamepadButtons.South, gamepadIndex: 0 },
      ],
    },
  },
};

describe('InputMapper — keyboard', () => {
  it('readAxis2D KeyA → {x:-1, y:0}', () => {
    const m = new InputMapper();
    m.init(moveMap, makeKeyboard([Keys.A]) as any, makeGamepad() as any);
    expect(m.readAxis2D('Move')).toEqual({ x: -1, y: 0 });
  });

  it('readAxis2D KeyD → {x:1, y:0}', () => {
    const m = new InputMapper();
    m.init(moveMap, makeKeyboard([Keys.D]) as any, makeGamepad() as any);
    expect(m.readAxis2D('Move')).toEqual({ x: 1, y: 0 });
  });

  it('readAxis2D nothing → {x:0, y:0}', () => {
    const m = new InputMapper();
    m.init(moveMap, makeKeyboard() as any, makeGamepad() as any);
    expect(m.readAxis2D('Move')).toEqual({ x: 0, y: 0 });
  });

  it('isActionPressed Space → true', () => {
    const m = new InputMapper();
    m.init(moveMap, makeKeyboard([Keys.Space]) as any, makeGamepad() as any);
    expect(m.isActionPressed('Jump')).toBe(true);
  });

  it('isActionJustPressed Space first frame → true', () => {
    const m = new InputMapper();
    m.init(moveMap, makeKeyboard([], [Keys.Space]) as any, makeGamepad() as any);
    expect(m.isActionJustPressed('Jump')).toBe(true);
  });
});

describe('InputMapper — gamepad', () => {
  it('isActionPressed South → true', () => {
    const m = new InputMapper();
    m.init(moveMap, makeKeyboard() as any, makeGamepad([GamepadButtons.South]) as any);
    expect(m.isActionPressed('Jump')).toBe(true);
  });

  it('isActionJustPressed South first frame → true', () => {
    const m = new InputMapper();
    m.init(moveMap, makeKeyboard() as any, makeGamepad([GamepadButtons.South], []) as any);
    expect(m.isActionJustPressed('Jump')).toBe(true);
  });

  it('isActionJustPressed South next frame → false', () => {
    const m = new InputMapper();
    // curr and prev identical = held, not justPressed
    m.init(
      moveMap,
      makeKeyboard() as any,
      makeGamepad([GamepadButtons.South], [GamepadButtons.South]) as any,
    );
    expect(m.isActionJustPressed('Jump')).toBe(false);
  });
});

describe('InputMapper — edge cases', () => {
  it('unknown action → false', () => {
    const m = new InputMapper();
    m.init(moveMap, makeKeyboard() as any, makeGamepad() as any);
    expect(m.isActionPressed('Unknown')).toBe(false);
  });

  it('unknown action readAxis2D → {x:0, y:0}', () => {
    const m = new InputMapper();
    m.init(moveMap, makeKeyboard() as any, makeGamepad() as any);
    expect(m.readAxis2D('Unknown')).toEqual({ x: 0, y: 0 });
  });
});
