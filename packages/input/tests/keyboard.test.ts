// @vitest-environment jsdom
/**
 * KeyboardInput unit tests.
 *
 * Tests the 4-state machine (idle → justPressed → held → justReleased → idle)
 * that powers the per-frame keyboard API.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { KeyboardInput } from '../src/plugin/keyboard';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Simulate a keydown event on the target (or window if none given).
 */
function fireKeyDown(code: string, target: EventTarget = window): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
}

/**
 * Simulate a keyup event on the target (or window if none given).
 */
function fireKeyUp(code: string, target: EventTarget = window): void {
  target.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('KeyboardInput', () => {
  let kb: KeyboardInput;

  beforeEach(() => {
    kb = new KeyboardInput();
    kb.attach(window);
  });

  describe('wasPressed() / isJustPressed()', () => {
    it('returns true only on the first frame a key is held', () => {
      fireKeyDown('Space');
      kb.update();
      expect(kb.isJustPressed('Space')).toBe(true);
    });

    it('returns false on subsequent frames while the key is still held', () => {
      fireKeyDown('Space');
      kb.update(); // frame 1: justPressed
      kb.update(); // frame 2: held — no new down event
      expect(kb.isJustPressed('Space')).toBe(false);
    });

    it('returns false after the key is released', () => {
      fireKeyDown('Space');
      kb.update();
      fireKeyUp('Space');
      kb.update(); // frame 2: justReleased
      kb.update(); // frame 3: idle
      expect(kb.isJustPressed('Space')).toBe(false);
    });
  });

  describe('isDown() / isPressed()', () => {
    it('returns true while the key is being held down', () => {
      fireKeyDown('KeyW');
      kb.update();
      // Still held — no keyup
      kb.update();
      expect(kb.isPressed('KeyW')).toBe(true);
    });

    it('returns true on the first press frame (justPressed counts as pressed)', () => {
      fireKeyDown('KeyW');
      kb.update();
      expect(kb.isPressed('KeyW')).toBe(true);
      expect(kb.isJustPressed('KeyW')).toBe(true);
    });

    it('returns false after keyup event', () => {
      fireKeyDown('KeyA');
      kb.update();
      fireKeyUp('KeyA');
      kb.update();
      expect(kb.isPressed('KeyA')).toBe(false);
    });
  });

  describe('isJustReleased()', () => {
    it('returns true only on the first frame after the key is released', () => {
      fireKeyDown('ArrowLeft');
      kb.update();
      fireKeyUp('ArrowLeft');
      kb.update();
      expect(kb.isJustReleased('ArrowLeft')).toBe(true);
    });

    it('returns false on the frame after justReleased', () => {
      fireKeyDown('ArrowLeft');
      kb.update();
      fireKeyUp('ArrowLeft');
      kb.update(); // justReleased
      kb.update(); // back to idle
      expect(kb.isJustReleased('ArrowLeft')).toBe(false);
    });
  });

  describe('reset()', () => {
    it('clears all key states to idle', () => {
      fireKeyDown('Space');
      kb.update();
      kb.reset();
      expect(kb.isJustPressed('Space')).toBe(false);
      expect(kb.isPressed('Space')).toBe(false);
      expect(kb.getState('Space')).toBe('idle');
    });
  });
});
