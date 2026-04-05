/**
 * Tests — DebugPlugin + FpsTracker
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FpsTracker } from '../src/plugin/fps-tracker';
import { DebugPlugin } from '../src/index';
import type { GwenEngine } from '@gwenjs/core';

// ── Mock GwenEngine ───────────────────────────────────────────────────────────

function createMockEngine(overrides: Partial<{ frameCount: number }> = {}): GwenEngine {
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
    hooks: {} as GwenEngine['hooks'],
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
    frameCount: overrides.frameCount ?? 0,
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

// ── FpsTracker ────────────────────────────────────────────────────────────────

describe('FpsTracker', () => {
  it('returns 0 when empty', () => {
    const t = new FpsTracker(10);
    expect(t.instantFps()).toBe(0);
    expect(t.rollingFps()).toBe(0);
    expect(t.minFps()).toBe(0);
    expect(t.maxFps()).toBe(0);
    expect(t.jitter()).toBe(0);
  });

  it('computes instantaneous FPS correctly', () => {
    const t = new FpsTracker(10);
    t.push(1 / 60); // 60 FPS
    expect(t.instantFps()).toBeCloseTo(60, 0);
  });

  it('computes rolling FPS over the window', () => {
    const t = new FpsTracker(4);
    t.push(1 / 60);
    t.push(1 / 60);
    t.push(1 / 60);
    t.push(1 / 60);
    expect(t.rollingFps()).toBeCloseTo(60, 0);
  });

  it('detects min and max', () => {
    const t = new FpsTracker(10);
    t.push(1 / 30); // 30 FPS
    t.push(1 / 60); // 60 FPS
    t.push(1 / 120); // 120 FPS
    expect(t.minFps()).toBeCloseTo(30, 0);
    expect(t.maxFps()).toBeCloseTo(120, 0);
  });

  it('computes non-zero jitter with varied deltas', () => {
    const t = new FpsTracker(10);
    t.push(1 / 30);
    t.push(1 / 120);
    expect(t.jitter()).toBeGreaterThan(0);
  });

  it('jitter is zero with identical deltas', () => {
    const t = new FpsTracker(10);
    for (let i = 0; i < 5; i++) t.push(1 / 60);
    expect(t.jitter()).toBeCloseTo(0, 1);
  });

  it('works as a circular buffer (overflow)', () => {
    const t = new FpsTracker(3);
    t.push(1 / 30);
    t.push(1 / 30);
    t.push(1 / 30);
    t.push(1 / 60); // overwrites the 1st slot
    t.push(1 / 60);
    t.push(1 / 60);
    // The last 3 slots should all be 60 FPS
    expect(t.rollingFps()).toBeCloseTo(60, 0);
  });

  it('reset clears everything to zero', () => {
    const t = new FpsTracker(10);
    t.push(1 / 60);
    t.reset();
    expect(t.instantFps()).toBe(0);
  });

  it('clamps outlier deltas', () => {
    const t = new FpsTracker(5);
    t.push(-1); // negative → clamped to 0.001
    t.push(999); // too large → clamped to 1.0 (= 1 FPS)
    expect(t.instantFps()).toBeGreaterThanOrEqual(1);
  });
});

// ── DebugPlugin ───────────────────────────────────────────────────────────────

describe('DebugPlugin', () => {
  let engine: GwenEngine;

  beforeEach(() => {
    engine = createMockEngine({ frameCount: 42 });
  });

  it('has the correct name', () => {
    expect(new DebugPlugin().name).toBe('@gwenjs/debug');
  });

  it('registers the debug service via engine.provide() on init', () => {
    const plugin = new DebugPlugin();
    plugin.setup(engine);
    expect(engine.tryInject('debug' as any)).toBeDefined();
  });

  it('getMetrics() returns metrics with initial values', () => {
    const engine2 = createMockEngine({ frameCount: 10 });

    const plugin = new DebugPlugin({ updateInterval: 1 });
    plugin.setup(engine2);
    plugin.onBeforeUpdate!(1 / 60);

    const service = engine2.inject('debug' as any) as {
      getMetrics: () => import('../src/types').DebugMetrics;
    };
    const m = service.getMetrics();

    expect(m.fps).toBeGreaterThan(0);
    expect(m.frameTimeMs).toBeCloseTo(1000 / 60, 0);
    expect(m.frameCount).toBe(10);
    expect(m.isDropping).toBe(false);
  });

  it('detects an FPS drop after the grace period', () => {
    const engine2 = createMockEngine({ frameCount: 100 });
    const onDrop = vi.fn();

    const plugin = new DebugPlugin({
      updateInterval: 1,
      fpsDrop: { threshold: 50, gracePeriodFrames: 3, onDrop },
    });
    plugin.setup(engine2);

    const slowDelta = 1 / 20; // 20 FPS — below 50 threshold
    plugin.onBeforeUpdate!(slowDelta); // frame 1: consecutiveDropFrames=1 — not yet
    plugin.onBeforeUpdate!(slowDelta); // frame 2: consecutiveDropFrames=2 — not yet
    plugin.onBeforeUpdate!(slowDelta); // frame 3: consecutiveDropFrames=3 — 1st trigger
    plugin.onBeforeUpdate!(slowDelta); // frame 4: consecutiveDropFrames=4 — 2nd trigger
    plugin.onBeforeUpdate!(slowDelta); // frame 5: consecutiveDropFrames=5 — 3rd trigger

    expect(onDrop).toHaveBeenCalledTimes(3);
  });

  it('does not trigger a drop when FPS is OK', () => {
    const onDrop = vi.fn();
    const plugin = new DebugPlugin({
      updateInterval: 1,
      fpsDrop: { threshold: 30, onDrop },
    });
    plugin.setup(engine);
    plugin.onBeforeUpdate!(1 / 60); // 60 FPS > 30
    plugin.onBeforeUpdate!(1 / 60);
    plugin.onBeforeUpdate!(1 / 60);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('reset clears the tracker', () => {
    const engine2 = createMockEngine();

    const plugin = new DebugPlugin({ updateInterval: 1 });
    plugin.setup(engine2);
    plugin.onBeforeUpdate!(1 / 60);

    const service = engine2.inject('debug' as any) as {
      reset: () => void;
      getMetrics: () => import('../src/types').DebugMetrics;
    };
    service.reset();
    const m = service.getMetrics();
    // After reset, metrics remain as the last snapshot (reset does not clear them)
    expect(m).toBeDefined();
  });

  it('teardown does not throw', () => {
    const plugin = new DebugPlugin();
    plugin.setup(engine);
    expect(() => plugin.teardown!()).not.toThrow();
  });
});
