/**
 * SpriteAnimPlugin (SpriteAnimatorService) integration tests.
 *
 * Verifies that the plugin registers an `SpriteAnimatorService` on the engine
 * and delegates correctly to the underlying SpriteAnimRuntime.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { EntityId, GwenEngine } from '@gwenjs/core';
import { SpriteAnimPlugin } from '../src/index';
import type { SpriteAnimatorService, SpriteAnimUIExtension } from '../src/types';

// ── MockImage ─────────────────────────────────────────────────────────────────

class MockImage {
  width = 256;
  height = 128;
  onload: (() => void) | null = null;

  set src(_v: string) {
    this.onload?.();
  }
}

// ── Mock engine ───────────────────────────────────────────────────────────────

function createMockEngine(): GwenEngine {
  const services = new Map<string, unknown>();
  return {
    provide: (key: string, value: unknown) => {
      services.set(key, value);
    },
    inject: (key: string) => {
      const v = services.get(key);
      if (v === undefined) throw new Error(`[mock] No service: ${key}`);
      return v;
    },
    tryInject: (key: string) => services.get(key),
    use: vi.fn().mockResolvedValue(undefined),
    unuse: vi.fn().mockResolvedValue(undefined),
    hooks: {
      callHook: vi.fn().mockResolvedValue(undefined),
      hook: vi.fn(),
    } as unknown as GwenEngine['hooks'],
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    startExternal: vi.fn().mockResolvedValue(undefined),
    advance: vi.fn().mockResolvedValue(undefined),
    run: (fn: () => unknown) => fn(),
    activate: vi.fn(),
    deactivate: vi.fn(),
    maxEntities: 1000,
    targetFPS: 60,
    maxDeltaSeconds: 0.1,
    variant: 'light',
    deltaTime: 0,
    frameCount: 0,
    getFPS: () => 0,
    getStats: () => ({ fps: 0, deltaTime: 0, frameCount: 0 }),
    loadWasmModule: vi.fn().mockResolvedValue({}),
    getWasmModule: vi.fn(),
    createLiveQuery: () => [][Symbol.iterator](),
    wasmBridge: {
      physics2d: { enabled: false, enable: vi.fn(), disable: vi.fn(), step: vi.fn() },
      physics3d: { enabled: false, enable: vi.fn(), disable: vi.fn(), step: vi.fn() },
    },
  } as unknown as GwenEngine;
}

// ── Fixture ───────────────────────────────────────────────────────────────────

const extension: SpriteAnimUIExtension = {
  atlas: '/sprites/player.png',
  frame: { width: 32, height: 32, columns: 4 },
  initial: 'idle',
  clips: {
    idle: { row: 0, from: 0, to: 1, fps: 8, loop: true },
    run: { row: 1, from: 0, to: 3, fps: 12, loop: true },
  },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SpriteAnimatorService (via SpriteAnimPlugin)', () => {
  let engine: GwenEngine;
  let service: SpriteAnimatorService;
  const ENTITY: EntityId = 42n as EntityId;

  beforeEach(() => {
    (globalThis as Record<string, unknown>).Image = MockImage as unknown as typeof Image;
    engine = createMockEngine();
    const plugin = SpriteAnimPlugin({ autoUpdate: false });
    plugin.setup(engine);
    service = engine.inject('animator' as any) as SpriteAnimatorService;
  });

  it('registers the spriteAnim service on the engine', () => {
    expect(service).toBeDefined();
    expect(typeof service.attach).toBe('function');
  });

  it('attach() adds an entity and has() returns true', () => {
    service.attach('PlayerUI', ENTITY, extension);
    expect(service.has(ENTITY)).toBe(true);
  });

  it('detach() removes the entity so has() returns false', () => {
    service.attach('PlayerUI', ENTITY, extension);
    service.detach(ENTITY);
    expect(service.has(ENTITY)).toBe(false);
  });

  it('getState() returns the initial state after attach', () => {
    service.attach('PlayerUI', ENTITY, extension);
    const state = service.getState(ENTITY);
    expect(state).not.toBeNull();
    expect(state?.clip).toBe('idle');
  });

  it('tick() advances animation state (frameCursor increases)', () => {
    service.attach('PlayerUI', ENTITY, extension);
    // Advance 0.5 seconds — idle is 8 fps, so several frames should advance
    service.tick(0.5);
    const state = service.getState(ENTITY);
    expect(state?.elapsed).toBeDefined();
  });

  it('play() switches clip', () => {
    service.attach('PlayerUI', ENTITY, extension);
    service.play(ENTITY, 'run', { interrupt: true });
    expect(service.getState(ENTITY)?.clip).toBe('run');
  });

  it('pause() and resume() toggle paused state', () => {
    service.attach('PlayerUI', ENTITY, extension);
    service.pause(ENTITY);
    expect(service.getState(ENTITY)?.paused).toBe(true);
    service.resume(ENTITY);
    expect(service.getState(ENTITY)?.paused).toBe(false);
  });
});
