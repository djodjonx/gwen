/**
 * AudioService unit tests — focused on the service API surface.
 *
 * Uses a mock AudioContext so no real Web Audio API is needed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AudioPlugin } from '../src/index';
import type { AudioService } from '../src/index';
import type { GwenEngine } from '@gwenjs/core';

// ── Mock helpers ─────────────────────────────────────────────────────────────

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

function makeAudioContextMock() {
  const gainNode = { gain: { value: 1 }, connect: vi.fn() };
  const sourceNode = {
    buffer: null as AudioBuffer | null,
    playbackRate: { value: 1 },
    loop: false,
    onended: null as (() => void) | null,
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };

  const ctx = {
    state: 'running' as AudioContextState,
    destination: {},
    createBufferSource: vi.fn(() => ({
      ...sourceNode,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
    })),
    createGain: vi.fn(() => ({ ...gainNode, connect: vi.fn() })),
    decodeAudioData: vi.fn((_buf: ArrayBuffer) =>
      Promise.resolve({ duration: 1 } as unknown as AudioBuffer),
    ),
    resume: vi.fn(),
    close: vi.fn(() => Promise.resolve()),
  };

  const MockAudioContext = vi.fn(function (this: Record<string, unknown>) {
    Object.assign(this, ctx);
  });
  (globalThis as unknown as { AudioContext: unknown }).AudioContext = MockAudioContext;
  return ctx;
}

// ── Helpers to set up plugin ─────────────────────────────────────────────────

function setup(config: Parameters<typeof AudioPlugin>[0] = {}): {
  plugin: ReturnType<typeof AudioPlugin>;
  service: AudioService;
  engine: GwenEngine;
  ctxMock: ReturnType<typeof makeAudioContextMock>;
} {
  const ctxMock = makeAudioContextMock();
  const engine = createMockEngine();
  const plugin = AudioPlugin(config);
  plugin.setup(engine);
  const service = engine.inject('audio' as any) as AudioService;
  return { plugin, service, engine, ctxMock };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AudioService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('preload()', () => {
    it('resolves after loading an audio buffer from a URL', async () => {
      const { plugin, service } = setup();
      (globalThis as any).fetch = vi.fn(() =>
        Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
      );

      await service.preload('sfx', '/sounds/sfx.wav');
      expect(service.isLoaded('sfx')).toBe(true);
      plugin.teardown!();
    });

    it('rejects with an error when fetch fails', async () => {
      const { plugin, service } = setup();
      (globalThis as any).fetch = vi.fn(() => Promise.reject(new Error('Network error')));

      await expect(service.preload('bad', '/not-found.wav')).rejects.toThrow();
      plugin.teardown!();
    });

    it('does not re-fetch a sound already preloaded via preloadBuffer', async () => {
      const { plugin, service } = setup();
      const fetchSpy = vi.fn(() =>
        Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
      );
      (globalThis as any).fetch = fetchSpy;

      service.preloadBuffer('coin', {} as AudioBuffer);
      await service.preload('coin', '/sounds/coin.wav');

      expect(fetchSpy).not.toHaveBeenCalled();
      plugin.teardown!();
    });
  });

  describe('play()', () => {
    it('returns null if the sound is not preloaded', () => {
      const { plugin, service } = setup();
      const result = service.play('missing');
      expect(result).toBeNull();
      plugin.teardown!();
    });

    it('applies volume option to the gain node', () => {
      const { plugin, service, ctxMock } = setup();
      service.preloadBuffer('hit', {} as AudioBuffer);
      service.play('hit', { volume: 0.4 });

      const gainNode = ctxMock.createGain.mock.results[1]?.value;
      expect(gainNode?.gain?.value).toBe(0.4);
      plugin.teardown!();
    });

    it('returns an AudioBufferSourceNode when sound is preloaded', () => {
      const { plugin, service } = setup();
      service.preloadBuffer('jump', {} as AudioBuffer);
      const node = service.play('jump');
      expect(node).not.toBeNull();
      plugin.teardown!();
    });

    it('sets loop=true when the loop option is provided', () => {
      const { plugin, service, ctxMock } = setup();
      service.preloadBuffer('bg', {} as AudioBuffer);
      service.play('bg', { loop: true });

      const sourceNode = ctxMock.createBufferSource.mock.results[0]?.value;
      expect(sourceNode?.loop).toBe(true);
      plugin.teardown!();
    });
  });

  describe('setMasterVolume()', () => {
    it('clamps volume to 1 when value exceeds 1', () => {
      const { plugin, service } = setup();
      service.setMasterVolume(1.5);
      expect(service.getMasterVolume()).toBe(1);
      plugin.teardown!();
    });

    it('clamps volume to 0 when value is negative', () => {
      const { plugin, service } = setup();
      service.setMasterVolume(-0.5);
      expect(service.getMasterVolume()).toBe(0);
      plugin.teardown!();
    });

    it('accepts values within [0, 1]', () => {
      const { plugin, service } = setup();
      service.setMasterVolume(0.6);
      expect(service.getMasterVolume()).toBeCloseTo(0.6);
      plugin.teardown!();
    });
  });
});
