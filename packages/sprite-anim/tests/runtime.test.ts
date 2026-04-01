import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityId } from '@gwenengine/core';
import { SpriteAnimRuntime } from '../src/runtime';
import type { SpriteAnimUIExtension } from '../src/types';

class MockImage {
  width = 256;
  height = 128;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  set src(_value: string) {
    this.onload?.();
  }
}

const baseExtension: SpriteAnimUIExtension = {
  atlas: '/sprites/player.png',
  frame: { width: 32, height: 32, columns: 8 },
  initial: 'idle',
  clips: {
    idle: { row: 0, from: 0, to: 1, fps: 10, loop: true },
    run: { row: 1, from: 0, to: 3, fps: 12, loop: true },
    shoot: { row: 2, from: 0, to: 1, fps: 10, loop: false, next: 'idle' },
  },
  controller: {
    initial: 'idle',
    parameters: {
      moving: { type: 'bool', default: false },
      shoot: { type: 'trigger' },
    },
    states: {
      idle: { clip: 'idle' },
      run: { clip: 'run' },
      shoot: { clip: 'shoot' },
    },
    transitions: [
      { from: 'idle', to: 'run', conditions: [{ param: 'moving', op: '==', value: true }] },
      { from: 'run', to: 'idle', conditions: [{ param: 'moving', op: '==', value: false }] },
      { from: '*', to: 'shoot', priority: 1, conditions: [{ param: 'shoot' }] },
      { from: 'shoot', to: 'idle', hasExitTime: true, exitTime: 0.95 },
    ],
  },
};

function createMockCtx() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
}

describe('SpriteAnimRuntime V3', () => {
  beforeEach(() => {
    (globalThis as { Image?: typeof Image }).Image = MockImage as unknown as typeof Image;
  });

  it('attaches entity with initial controller state', () => {
    const runtime = new SpriteAnimRuntime();
    const id = 1n as EntityId;

    runtime.attach('PlayerUI', id, baseExtension);
    const state = runtime.getState(id);

    expect(state).not.toBeNull();
    expect(state?.state).toBe('idle');
    expect(state?.clip).toBe('idle');
  });

  it('transitions via bool parameter', () => {
    const runtime = new SpriteAnimRuntime();
    const id = 2n as EntityId;

    runtime.attach('PlayerUI', id, baseExtension);
    expect(runtime.setParam(id, 'moving', true)).toBe(true);

    runtime.tick(1 / 60);
    expect(runtime.getState(id)?.state).toBe('run');
    expect(runtime.getState(id)?.clip).toBe('run');
  });

  it('transitions via trigger then returns on clip next', () => {
    const runtime = new SpriteAnimRuntime();
    const id = 3n as EntityId;

    runtime.attach('PlayerUI', id, baseExtension);
    expect(runtime.setTrigger(id, 'shoot')).toBe(true);

    runtime.tick(1 / 60);
    expect(runtime.getState(id)?.state).toBe('shoot');

    runtime.tick(0.3);
    expect(runtime.getState(id)?.clip).toBe('idle');
  });

  it('emits hooks for frame/complete/transition', () => {
    const events = {
      frame: vi.fn(),
      complete: vi.fn(),
      transition: vi.fn(),
    };

    const runtime = new SpriteAnimRuntime({
      events: {
        onFrame: events.frame,
        onComplete: events.complete,
        onTransition: events.transition,
      },
    });

    const id = 4n as EntityId;
    runtime.attach('PlayerUI', id, baseExtension);
    runtime.setTrigger(id, 'shoot');
    runtime.tick(0.25);

    expect(events.transition).toHaveBeenCalled();
    expect(events.frame).toHaveBeenCalled();
    expect(events.complete).toHaveBeenCalled();
  });

  it('draws frame and supports culling', () => {
    const runtime = new SpriteAnimRuntime();
    const id = 5n as EntityId;
    const ctx = createMockCtx();

    runtime.attach('PlayerUI', id, baseExtension);

    // First draw loads atlas image (returns false), second draw should render.
    expect(runtime.draw(ctx, id, 10, 10)).toBe(false);
    expect(runtime.draw(ctx, id, 10, 10)).toBe(true);
    expect((ctx.drawImage as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);

    const skipped = runtime.draw(ctx, id, 1000, 1000, {
      cullRect: { x: 0, y: 0, width: 100, height: 100 },
    });
    expect(skipped).toBe(false);
  });

  it('caps frame advances per tick for perf safety', () => {
    const runtime = new SpriteAnimRuntime({}, { maxFrameAdvancesPerEntity: 1 });
    const id = 6n as EntityId;

    runtime.attach('PlayerUI', id, baseExtension);
    runtime.tick(1.0);

    expect(runtime.getState(id)?.frameCursor).toBeLessThanOrEqual(1);
  });

  it('skips tick when entity is marked culled', () => {
    const runtime = new SpriteAnimRuntime();
    const id = 7n as EntityId;

    runtime.attach('PlayerUI', id, baseExtension);
    runtime.setCulled(id, true);

    const before = runtime.getState(id);
    runtime.tick(1.0);
    const after = runtime.getState(id);

    expect(before?.frameCursor).toBe(after?.frameCursor);
    expect(runtime.isCulled(id)).toBe(true);
  });

  it('supports detach then reattach on same entity id', () => {
    const runtime = new SpriteAnimRuntime();
    const id = 8n as EntityId;

    runtime.attach('PlayerUI', id, baseExtension);
    expect(runtime.has(id)).toBe(true);

    runtime.detach(id);
    expect(runtime.has(id)).toBe(false);

    runtime.attach('PlayerUI', id, baseExtension);
    expect(runtime.has(id)).toBe(true);
    expect(runtime.getState(id)?.clip).toBe('idle');
  });

  it('returns cached state snapshot identity until next mutation', () => {
    const runtime = new SpriteAnimRuntime();
    const id = 9n as EntityId;

    runtime.attach('PlayerUI', id, baseExtension);

    const s1 = runtime.getState(id);
    const s2 = runtime.getState(id);
    expect(s1).toBe(s2);

    runtime.tick(1 / 60);
    const s3 = runtime.getState(id);
    expect(s3).not.toBe(s2);
  });
});
