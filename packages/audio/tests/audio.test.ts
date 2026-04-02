/**
 * AudioPlugin tests — uses a mock AudioContext.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AudioPlugin } from '../src/index';
import type { AudioService } from '../src/index';
import type { GwenEngine } from '@gwenengine/core';

// ── Mock GwenEngine ──────────────────────────────────────────────────────

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

// ── AudioContext Mock ────────────────────────────────────────────────────

function makeSourceNode() {
  const node = {
    buffer: null as AudioBuffer | null,
    playbackRate: { value: 1 },
    loop: false,
    onended: null as (() => void) | null,
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(() => {
      node.onended?.();
    }),
  };
  return node;
}

function makeGainNode() {
  return {
    gain: { value: 1 },
    connect: vi.fn(),
  };
}

function makeAudioContextMock() {
  const ctx = {
    state: 'running' as AudioContextState,
    destination: {},
    createBufferSource: vi.fn(() => makeSourceNode()),
    createGain: vi.fn(() => makeGainNode()),
    decodeAudioData: vi.fn((_buf: ArrayBuffer) =>
      Promise.resolve({ duration: 1, numberOfChannels: 1 } as unknown as AudioBuffer),
    ),
    resume: vi.fn(),
    close: vi.fn(() => Promise.resolve()),
  };
  return ctx;
}

// Inject mock AudioContext globally before each test
function installAudioContextMock() {
  const mock = makeAudioContextMock();

  // Vitest 4 requires a constructable mock for `new AudioContext()`.
  const MockAudioContext = vi.fn(function MockAudioContext(this: Record<string, unknown>) {
    Object.assign(this, mock);
  });

  (globalThis as unknown as { AudioContext: unknown }).AudioContext = MockAudioContext;
  return mock;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('AudioPlugin', () => {
  let engine: GwenEngine;
  let ctxMock: ReturnType<typeof makeAudioContextMock>;

  beforeEach(() => {
    engine = createMockEngine();
    ctxMock = installAudioContextMock();
  });

  describe('setup', () => {
    it('should create AudioContext and register service', () => {
      const plugin = new AudioPlugin();
      plugin.setup(engine);

      expect(engine.tryInject('audio' as any)).toBeDefined();

      plugin.teardown!();
    });

    it('should have name "AudioPlugin"', () => {
      expect(new AudioPlugin().name).toBe('@gwenengine/audio');
    });

    it('should apply master volume on init', () => {
      const plugin = new AudioPlugin({ masterVolume: 0.5 });
      plugin.setup(engine);

      const audio = engine.inject('audio' as any) as AudioService;
      expect(audio.getMasterVolume()).toBe(0.5);
      plugin.teardown!();
    });
  });

  describe('preloadBuffer + play', () => {
    it('should play a preloaded buffer sound', () => {
      const plugin = new AudioPlugin();
      plugin.setup(engine);
      const audio = engine.inject('audio' as any) as AudioService;

      const fakeBuffer = { duration: 1 } as unknown as AudioBuffer;
      audio.preloadBuffer('jump', fakeBuffer);

      const sourceNode = audio.play('jump');
      expect(sourceNode).not.toBeNull();
      expect(ctxMock.createBufferSource).toHaveBeenCalled();
      expect(ctxMock.createGain).toHaveBeenCalled();

      plugin.teardown!();
    });

    it('should return null for unknown sound', () => {
      const plugin = new AudioPlugin();
      plugin.setup(engine);
      const audio = engine.inject('audio' as any) as AudioService;

      const result = audio.play('unknown');
      expect(result).toBeNull();

      plugin.teardown!();
    });

    it('should apply volume option', () => {
      const plugin = new AudioPlugin();
      plugin.setup(engine);
      const audio = engine.inject('audio' as any) as AudioService;

      const fakeBuffer = { duration: 1 } as unknown as AudioBuffer;
      audio.preloadBuffer('sfx', fakeBuffer);
      audio.play('sfx', { volume: 0.3 });

      const gainMock = ctxMock.createGain.mock.results[1]?.value;
      expect(gainMock?.gain?.value).toBe(0.3);

      plugin.teardown!();
    });

    it('should resume suspended context on play', () => {
      (ctxMock as any).state = 'suspended';
      const plugin = new AudioPlugin();
      plugin.setup(engine);
      const audio = engine.inject('audio' as any) as AudioService;

      const fakeBuffer = { duration: 1 } as unknown as AudioBuffer;
      audio.preloadBuffer('bg', fakeBuffer);
      audio.play('bg');

      expect(ctxMock.resume).toHaveBeenCalled();
      plugin.teardown!();
    });
  });

  describe('isLoaded', () => {
    it('should return false before preload', () => {
      const plugin = new AudioPlugin();
      plugin.setup(engine);
      const audio = engine.inject('audio' as any) as AudioService;
      expect(audio.isLoaded('jump')).toBe(false);
      plugin.teardown!();
    });

    it('should return true after preloadBuffer', () => {
      const plugin = new AudioPlugin();
      plugin.setup(engine);
      const audio = engine.inject('audio' as any) as AudioService;
      audio.preloadBuffer('jump', {} as AudioBuffer);
      expect(audio.isLoaded('jump')).toBe(true);
      plugin.teardown!();
    });
  });

  describe('stop', () => {
    it('should stop all instances of a sound', () => {
      const plugin = new AudioPlugin();
      plugin.setup(engine);
      const audio = engine.inject('audio' as any) as AudioService;
      audio.preloadBuffer('sfx', {} as AudioBuffer);

      const source = audio.play('sfx') as any;
      audio.stop('sfx');

      expect(source.stop).toHaveBeenCalled();
      plugin.teardown!();
    });

    it('should not throw when stopping unknown sound', () => {
      const plugin = new AudioPlugin();
      plugin.setup(engine);
      const audio = engine.inject('audio' as any) as AudioService;
      expect(() => audio.stop('ghost')).not.toThrow();
      plugin.teardown!();
    });
  });

  describe('setMasterVolume', () => {
    it('should clamp volume between 0 and 1', () => {
      const plugin = new AudioPlugin();
      plugin.setup(engine);
      const audio = engine.inject('audio' as any) as AudioService;

      audio.setMasterVolume(2);
      expect(audio.getMasterVolume()).toBe(1);

      audio.setMasterVolume(-1);
      expect(audio.getMasterVolume()).toBe(0);

      plugin.teardown!();
    });

    it('should set mid-range volume', () => {
      const plugin = new AudioPlugin();
      plugin.setup(engine);
      const audio = engine.inject('audio' as any) as AudioService;
      audio.setMasterVolume(0.7);
      expect(audio.getMasterVolume()).toBeCloseTo(0.7);
      plugin.teardown!();
    });
  });

  describe('preload (async)', () => {
    it('should preload sound from URL', async () => {
      (globalThis as any).fetch = vi.fn(() =>
        Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
      );

      const plugin = new AudioPlugin();
      plugin.setup(engine);
      const audio = engine.inject('audio' as any) as AudioService;

      await audio.preload('bg', '/sounds/bg.mp3');
      expect(audio.isLoaded('bg')).toBe(true);

      plugin.teardown!();
    });

    it('should not double-load the same sound', async () => {
      (globalThis as any).fetch = vi.fn(() =>
        Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
      );

      const plugin = new AudioPlugin();
      plugin.setup(engine);
      const audio = engine.inject('audio' as any) as AudioService;

      await audio.preload('bg', '/sounds/bg.mp3');
      await audio.preload('bg', '/sounds/bg.mp3');

      expect((globalThis as any).fetch).toHaveBeenCalledTimes(1);

      plugin.teardown!();
    });
  });

  describe('teardown', () => {
    it('should close AudioContext on teardown', () => {
      const plugin = new AudioPlugin();
      plugin.setup(engine);
      plugin.teardown!();
      expect(ctxMock.close).toHaveBeenCalled();
    });
  });

  describe('DI pattern', () => {
    it('should allow another plugin to consume AudioPlugin via inject', () => {
      const audio = new AudioPlugin();
      audio.setup(engine);

      const retrieved = engine.inject('audio' as any) as AudioService;
      retrieved.preloadBuffer('hit', {} as AudioBuffer);
      const result = retrieved.play('hit');

      expect(result).not.toBeNull();
      audio.teardown!();
    });
  });
});
