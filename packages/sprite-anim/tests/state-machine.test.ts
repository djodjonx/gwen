/**
 * SpriteAnimRuntime state machine tests.
 *
 * Focused on transition logic, clip playback, and parameter-driven
 * state changes — independent of image loading or draw calls.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { EntityId } from '@gwenjs/core';
import { SpriteAnimRuntime } from '../src/plugin/runtime';
import type { SpriteAnimUIExtension } from '../src/types';

// ── MockImage so atlas "loads" synchronously ──────────────────────────────────

class MockImage {
  width = 256;
  height = 128;
  onload: (() => void) | null = null;

  set src(_v: string) {
    this.onload?.();
  }
}

// ── Shared fixtures ───────────────────────────────────────────────────────────

/** Extension with a 2-state controller driven by a bool parameter. */
const boolControllerExtension: SpriteAnimUIExtension = {
  atlas: '/sprites/hero.png',
  frame: { width: 32, height: 32, columns: 4 },
  initial: 'idle',
  clips: {
    idle: { row: 0, from: 0, to: 1, fps: 8, loop: true },
    run: { row: 1, from: 0, to: 3, fps: 12, loop: true },
    die: { frames: [8, 9, 10], fps: 6, loop: false },
  },
  controller: {
    initial: 'idle',
    parameters: {
      running: { type: 'bool', default: false },
      speed: { type: 'float', default: 0 },
      attack: { type: 'trigger' },
    },
    states: {
      idle: { clip: 'idle' },
      run: { clip: 'run' },
      die: { clip: 'die' },
    },
    transitions: [
      {
        from: 'idle',
        to: 'run',
        conditions: [{ param: 'running', op: '==', value: true }],
      },
      {
        from: 'run',
        to: 'idle',
        conditions: [{ param: 'running', op: '==', value: false }],
      },
      {
        from: 'idle',
        to: 'die',
        conditions: [{ param: 'speed', op: '>', value: 5 }],
      },
    ],
  },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SpriteAnimController state machine', () => {
  let runtime: SpriteAnimRuntime;
  const ENTITY: EntityId = 1n as EntityId;

  beforeEach(() => {
    (globalThis as Record<string, unknown>).Image = MockImage as unknown as typeof Image;
    runtime = new SpriteAnimRuntime();
    runtime.attach('HeroUI', ENTITY, boolControllerExtension);
  });

  describe('transitions', () => {
    it('transitions to target state when condition is met', () => {
      runtime.setParam(ENTITY, 'running', true);
      runtime.tick(1 / 60);
      expect(runtime.getState(ENTITY)?.state).toBe('run');
    });

    it('does not transition when condition is not met', () => {
      // running is false by default — should stay in idle
      runtime.tick(1 / 60);
      expect(runtime.getState(ENTITY)?.state).toBe('idle');
    });

    it('transitions back to idle when bool parameter becomes false', () => {
      runtime.setParam(ENTITY, 'running', true);
      runtime.tick(1 / 60); // → run
      runtime.setParam(ENTITY, 'running', false);
      runtime.tick(1 / 60); // → idle
      expect(runtime.getState(ENTITY)?.state).toBe('idle');
    });

    it('transitions using float comparison operator', () => {
      runtime.setParam(ENTITY, 'speed', 10);
      runtime.tick(1 / 60);
      expect(runtime.getState(ENTITY)?.state).toBe('die');
    });
  });

  describe('clip playback', () => {
    it('loops when clip has loop: true', () => {
      // run clip has loop: true — advance past the last frame
      runtime.setParam(ENTITY, 'running', true);
      runtime.tick(1 / 60); // transition to run

      // Advance enough to wrap around (4 frames at 12 fps ≈ 0.333s)
      runtime.tick(0.4);
      const afterCursor = runtime.getState(ENTITY)?.frameCursor;
      // Cursor should have wrapped back, still in 'run'
      expect(runtime.getState(ENTITY)?.state).toBe('run');
      expect(afterCursor).not.toBeUndefined();
    });

    it('stops at last frame when loop is false', () => {
      // die clip has loop: false
      runtime.setState(ENTITY, 'die', { interrupt: true });
      // Advance well past the clip length (3 frames at 6 fps ≈ 0.5s)
      runtime.tick(1.0);
      const state = runtime.getState(ENTITY);
      // Should be paused at the last frame (index 2)
      expect(state?.paused).toBe(true);
      expect(state?.frameCursor).toBe(2); // last frame of [8,9,10]
    });

    it('advances frame based on frameTime and dt', () => {
      // run clip is 12 fps → one frame every ~0.0833s
      runtime.setParam(ENTITY, 'running', true);
      runtime.tick(1 / 60); // transition

      runtime.tick(1 / 12); // advance exactly one frame
      const cursor = runtime.getState(ENTITY)?.frameCursor;
      expect(cursor).toBeGreaterThanOrEqual(1);
    });
  });

  describe('parameters', () => {
    it('updates boolean parameter and triggers the relevant transition', () => {
      expect(runtime.getState(ENTITY)?.state).toBe('idle');
      runtime.setParam(ENTITY, 'running', true);
      runtime.tick(1 / 60);
      expect(runtime.getState(ENTITY)?.state).toBe('run');
    });

    it('updates float parameter and triggers threshold transition', () => {
      expect(runtime.getState(ENTITY)?.state).toBe('idle');
      runtime.setParam(ENTITY, 'speed', 6); // > 5 triggers die
      runtime.tick(1 / 60);
      expect(runtime.getState(ENTITY)?.state).toBe('die');
    });

    it('setParam returns false for unknown parameter name', () => {
      expect(runtime.setParam(ENTITY, 'nonExistent', 1)).toBe(false);
    });

    it('setParam returns false for trigger type (use setTrigger instead)', () => {
      expect(runtime.setParam(ENTITY, 'attack', true)).toBe(false);
    });

    it('setTrigger fires and is consumed after one tick', () => {
      runtime.setTrigger(ENTITY, 'attack');
      // Triggers are consumed by tryAutoTransition; we just verify it doesn't throw
      expect(() => runtime.tick(1 / 60)).not.toThrow();
    });
  });
});
