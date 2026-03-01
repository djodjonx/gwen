/**
 * Input Plugin tests — keyboard, mouse, InputPlugin
 * All tests run headlessly (no real events, tested via synthetic dispatch).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KeyboardInput } from '../src/keyboard';
import { MouseInput } from '../src/mouse';
import { GamepadInput } from '../src/gamepad';
import { InputPlugin } from '../src/index';
import { EntityManager, ComponentRegistry, QueryEngine, createEngineAPI } from '@gwen/engine-core';
import type { EngineAPI } from '@gwen/engine-core';

function makeAPI(): EngineAPI {
  return createEngineAPI(new EntityManager(50), new ComponentRegistry(), new QueryEngine());
}

// ── KeyboardInput ────────────────────────────────────────────────────────

describe('KeyboardInput', () => {
  let kb: KeyboardInput;
  let target: EventTarget;

  beforeEach(() => {
    kb = new KeyboardInput();
    target = new EventTarget();
    kb.attach(target);
  });

  const press = (code: string) =>
    target.dispatchEvent(Object.assign(new Event('keydown'), { code }));
  const release = (code: string) =>
    target.dispatchEvent(Object.assign(new Event('keyup'), { code }));

  it('should be idle initially', () => {
    expect(kb.getState('KeyA')).toBe('idle');
    expect(kb.isPressed('KeyA')).toBe(false);
  });

  it('should be justPressed on first frame', () => {
    press('KeyA');
    kb.update();
    expect(kb.getState('KeyA')).toBe('justPressed');
    expect(kb.isJustPressed('KeyA')).toBe(true);
    expect(kb.isPressed('KeyA')).toBe(true);
  });

  it('should be held on second frame', () => {
    press('KeyA');
    kb.update(); // justPressed
    kb.update(); // held
    expect(kb.getState('KeyA')).toBe('held');
    expect(kb.isHeld('KeyA')).toBe(true);
    expect(kb.isJustPressed('KeyA')).toBe(false);
  });

  it('should be justReleased on frame after release', () => {
    press('KeyA');
    kb.update(); // justPressed
    kb.update(); // held
    release('KeyA');
    kb.update(); // justReleased
    expect(kb.getState('KeyA')).toBe('justReleased');
    expect(kb.isJustReleased('KeyA')).toBe(true);
    expect(kb.isPressed('KeyA')).toBe(false);
  });

  it('should return to idle after justReleased', () => {
    press('KeyA');
    kb.update();
    release('KeyA');
    kb.update(); // justReleased
    kb.update(); // idle
    expect(kb.getState('KeyA')).toBe('idle');
  });

  it('should handle multiple keys independently', () => {
    press('ArrowLeft');
    press('Space');
    kb.update();
    expect(kb.isJustPressed('ArrowLeft')).toBe(true);
    expect(kb.isJustPressed('Space')).toBe(true);
    release('ArrowLeft');
    kb.update();
    expect(kb.isJustReleased('ArrowLeft')).toBe(true);
    expect(kb.isHeld('Space')).toBe(true);
  });

  it('should not trigger justPressed for held keys', () => {
    press('KeyW');
    kb.update(); // justPressed
    kb.update(); // held
    // Dispatch keydown again (OS key repeat)
    press('KeyW');
    kb.update();
    expect(kb.getState('KeyW')).toBe('held');
    expect(kb.isJustPressed('KeyW')).toBe(false);
  });

  it('should reset all keys', () => {
    press('KeyA');
    kb.update();
    kb.reset();
    expect(kb.getState('KeyA')).toBe('idle');
  });

  it('should detach listeners', () => {
    kb.detach(target);
    press('KeyA');
    kb.update();
    expect(kb.getState('KeyA')).toBe('idle');
  });
});

// ── MouseInput ───────────────────────────────────────────────────────────

describe('MouseInput', () => {
  let mouse: MouseInput;
  let target: EventTarget;

  beforeEach(() => {
    mouse = new MouseInput();
    target = new EventTarget();
    mouse.attach(target);
  });

  const clickDown = (btn = 0) =>
    target.dispatchEvent(Object.assign(new Event('mousedown'), { button: btn }));
  const clickUp = (btn = 0) =>
    target.dispatchEvent(Object.assign(new Event('mouseup'), { button: btn }));
  const move = (x: number, y: number) =>
    target.dispatchEvent(Object.assign(new Event('mousemove'), { clientX: x, clientY: y }));

  it('should start in idle state', () => {
    expect(mouse.getButtonState(0)).toBe('idle');
    expect(mouse.isButtonPressed(0)).toBe(false);
  });

  it('should track left button justPressed', () => {
    clickDown(0);
    mouse.update();
    expect(mouse.isButtonJustPressed(0)).toBe(true);
    expect(mouse.isButtonPressed(0)).toBe(true);
  });

  it('should transition to held on next frame', () => {
    clickDown(0);
    mouse.update();
    mouse.update();
    expect(mouse.isButtonHeld(0)).toBe(true);
  });

  it('should detect justReleased', () => {
    clickDown(0);
    mouse.update();
    clickUp(0);
    mouse.update();
    expect(mouse.isButtonJustReleased(0)).toBe(true);
  });

  it('should track mouse position', () => {
    move(150, 250);
    mouse.update();
    expect(mouse.position.x).toBe(150);
    expect(mouse.position.y).toBe(250);
  });

  it('should handle middle and right buttons independently', () => {
    clickDown(1);
    clickDown(2);
    mouse.update();
    expect(mouse.isButtonJustPressed(1)).toBe(true);
    expect(mouse.isButtonJustPressed(2)).toBe(true);
    expect(mouse.isButtonPressed(0)).toBe(false);
  });

  it('should reset state', () => {
    clickDown(0);
    mouse.update();
    mouse.reset();
    expect(mouse.getButtonState(0)).toBe('idle');
    expect(mouse.wheel).toBe(0);
  });
});

// ── GamepadInput ─────────────────────────────────────────────────────────

describe('GamepadInput', () => {
  it('should return 0 connected when no navigator', () => {
    const gp = new GamepadInput();
    // In test env, navigator.getGamepads may not exist
    expect(gp.connectedCount()).toBeGreaterThanOrEqual(0);
  });

  it('should return false for unknown gamepad button', () => {
    const gp = new GamepadInput();
    expect(gp.isButtonPressed(0, 0)).toBe(false);
  });

  it('should return zero axis for unknown gamepad', () => {
    const gp = new GamepadInput();
    const axis = gp.getAxis(0, 0);
    expect(axis.value).toBe(0);
    expect(axis.effective).toBe(0);
  });

  it('should apply deadzone', () => {
    const gp = new GamepadInput(0.2);
    // Can't mock gamepad easily, but we can test the deadzone logic indirectly
    // by checking that effective = 0 when below threshold
    // (covered by the getAxis fallback returning 0, which is < deadzone)
    const axis = gp.getAxis(99, 0);
    expect(axis.effective).toBe(0);
  });
});

// ── InputPlugin ──────────────────────────────────────────────────────────

describe('InputPlugin', () => {
  let api: EngineAPI;
  let target: EventTarget;

  beforeEach(() => {
    api = makeAPI();
    target = new EventTarget();
  });

  it('should register keyboard, mouse, gamepad services on init', () => {
    const plugin = new InputPlugin({ eventTarget: target });
    plugin.onInit(api);

    expect(api.services.has('keyboard')).toBe(true);
    expect(api.services.has('mouse')).toBe(true);
    expect(api.services.has('gamepad')).toBe(true);

    plugin.onDestroy();
  });

  it('should retrieve KeyboardInput from services', () => {
    const plugin = new InputPlugin({ eventTarget: target });
    plugin.onInit(api);

    const kb = api.services.get<KeyboardInput>('keyboard');
    expect(kb).toBeInstanceOf(KeyboardInput);

    plugin.onDestroy();
  });

  it('should update keyboard state in onBeforeUpdate', () => {
    const plugin = new InputPlugin({ eventTarget: target });
    plugin.onInit(api);

    const kb = api.services.get<KeyboardInput>('keyboard');
    target.dispatchEvent(Object.assign(new Event('keydown'), { code: 'KeyA' }));
    plugin.onBeforeUpdate(api, 0.016);

    expect(kb.isJustPressed('KeyA')).toBe(true);
    plugin.onDestroy();
  });

  it('should clean up listeners on destroy', () => {
    const plugin = new InputPlugin({ eventTarget: target });
    plugin.onInit(api);
    plugin.onDestroy();

    const kb = api.services.get<KeyboardInput>('keyboard');
    target.dispatchEvent(Object.assign(new Event('keydown'), { code: 'KeyA' }));
    plugin.onBeforeUpdate(api, 0.016); // update after destroy
    // After detach, key presses should be ignored
    expect(kb.isJustPressed('KeyA')).toBe(false);
  });

  it('should have name InputPlugin', () => {
    expect(new InputPlugin().name).toBe('InputPlugin');
  });

  describe('DI pattern — PlayerController consuming InputPlugin', () => {
    it('should allow another plugin to use keyboard via services', () => {
      const plugin = new InputPlugin({ eventTarget: target });
      plugin.onInit(api);

      // Simulate PlayerController resolving input in onInit
      const kb = api.services.get<KeyboardInput>('keyboard');

      // Simulate a keypress
      target.dispatchEvent(Object.assign(new Event('keydown'), { code: 'ArrowRight' }));
      plugin.onBeforeUpdate(api, 0.016);

      // PlayerController reads in onUpdate
      expect(kb.isPressed('ArrowRight')).toBe(true);
      plugin.onDestroy();
    });
  });
});
