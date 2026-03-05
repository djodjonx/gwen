/**
 * AudioPlugin tests — uses a mock AudioContext.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AudioPlugin } from '../src/index';
import type { AudioService } from '../src/index';
import { EntityManager, ComponentRegistry, QueryEngine, createEngineAPI } from '@gwen/engine-core';
import type { EngineAPI } from '@gwen/engine-core';

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
  (globalThis as any).AudioContext = vi.fn(() => mock);
  return mock;
}

function makeAPI(): EngineAPI {
  return createEngineAPI(new EntityManager(50), new ComponentRegistry(), new QueryEngine());
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('AudioPlugin', () => {
  let api: EngineAPI;
  let ctxMock: ReturnType<typeof makeAudioContextMock>;

  beforeEach(() => {
    api = makeAPI();
    ctxMock = installAudioContextMock();
  });

  describe('onInit', () => {
    it('should create AudioContext and register service', () => {
      const plugin = new AudioPlugin();
      plugin.onInit(api);

      expect(api.services.has('audio')).toBe(true);
      expect(api.services.get('audio')).toBeDefined();

      plugin.onDestroy();
    });

    it('should have name "AudioPlugin"', () => {
      expect(new AudioPlugin().name).toBe('AudioPlugin');
    });

    it('should apply master volume on init', () => {
      const plugin = new AudioPlugin({ masterVolume: 0.5 });
      plugin.onInit(api);

      const audio = api.services.get('audio') as AudioService;
      expect(audio.getMasterVolume()).toBe(0.5);
      plugin.onDestroy();
    });
  });

  describe('preloadBuffer + play', () => {
    it('should play a preloaded buffer sound', () => {
      const plugin = new AudioPlugin();
      plugin.onInit(api);
      const audio = api.services.get('audio') as AudioService;

      const fakeBuffer = { duration: 1 } as unknown as AudioBuffer;
      audio.preloadBuffer('jump', fakeBuffer);

      const sourceNode = audio.play('jump');
      expect(sourceNode).not.toBeNull();
      expect(ctxMock.createBufferSource).toHaveBeenCalled();
      expect(ctxMock.createGain).toHaveBeenCalled();

      plugin.onDestroy();
    });

    it('should return null for unknown sound', () => {
      const plugin = new AudioPlugin();
      plugin.onInit(api);
      const audio = api.services.get('audio') as AudioService;

      const result = audio.play('unknown');
      expect(result).toBeNull();

      plugin.onDestroy();
    });

    it('should apply volume option', () => {
      const plugin = new AudioPlugin();
      plugin.onInit(api);
      const audio = api.services.get('audio') as AudioService;

      const fakeBuffer = { duration: 1 } as unknown as AudioBuffer;
      audio.preloadBuffer('sfx', fakeBuffer);
      audio.play('sfx', { volume: 0.3 });

      const gainMock = ctxMock.createGain.mock.results[1]?.value;
      expect(gainMock?.gain?.value).toBe(0.3);

      plugin.onDestroy();
    });

    it('should resume suspended context on play', () => {
      (ctxMock as any).state = 'suspended';
      const plugin = new AudioPlugin();
      plugin.onInit(api);
      const audio = api.services.get('audio') as AudioService;

      const fakeBuffer = { duration: 1 } as unknown as AudioBuffer;
      audio.preloadBuffer('bg', fakeBuffer);
      audio.play('bg');

      expect(ctxMock.resume).toHaveBeenCalled();
      plugin.onDestroy();
    });
  });

  describe('isLoaded', () => {
    it('should return false before preload', () => {
      const plugin = new AudioPlugin();
      plugin.onInit(api);
      const audio = api.services.get('audio') as AudioService;
      expect(audio.isLoaded('jump')).toBe(false);
      plugin.onDestroy();
    });

    it('should return true after preloadBuffer', () => {
      const plugin = new AudioPlugin();
      plugin.onInit(api);
      const audio = api.services.get('audio') as AudioService;
      audio.preloadBuffer('jump', {} as AudioBuffer);
      expect(audio.isLoaded('jump')).toBe(true);
      plugin.onDestroy();
    });
  });

  describe('stop', () => {
    it('should stop all instances of a sound', () => {
      const plugin = new AudioPlugin();
      plugin.onInit(api);
      const audio = api.services.get('audio') as AudioService;
      audio.preloadBuffer('sfx', {} as AudioBuffer);

      const source = audio.play('sfx') as any;
      audio.stop('sfx');

      expect(source.stop).toHaveBeenCalled();
      plugin.onDestroy();
    });

    it('should not throw when stopping unknown sound', () => {
      const plugin = new AudioPlugin();
      plugin.onInit(api);
      const audio = api.services.get('audio') as AudioService;
      expect(() => audio.stop('ghost')).not.toThrow();
      plugin.onDestroy();
    });
  });

  describe('setMasterVolume', () => {
    it('should clamp volume between 0 and 1', () => {
      const plugin = new AudioPlugin();
      plugin.onInit(api);
      const audio = api.services.get('audio') as AudioService;

      audio.setMasterVolume(2);
      expect(audio.getMasterVolume()).toBe(1);

      audio.setMasterVolume(-1);
      expect(audio.getMasterVolume()).toBe(0);

      plugin.onDestroy();
    });

    it('should set mid-range volume', () => {
      const plugin = new AudioPlugin();
      plugin.onInit(api);
      const audio = api.services.get('audio') as AudioService;
      audio.setMasterVolume(0.7);
      expect(audio.getMasterVolume()).toBeCloseTo(0.7);
      plugin.onDestroy();
    });
  });

  describe('preload (async)', () => {
    it('should preload sound from URL', async () => {
      (globalThis as any).fetch = vi.fn(() =>
        Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
      );

      const plugin = new AudioPlugin();
      plugin.onInit(api);
      const audio = api.services.get('audio') as AudioService;

      await audio.preload('bg', '/sounds/bg.mp3');
      expect(audio.isLoaded('bg')).toBe(true);

      plugin.onDestroy();
    });

    it('should not double-load the same sound', async () => {
      (globalThis as any).fetch = vi.fn(() =>
        Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }),
      );

      const plugin = new AudioPlugin();
      plugin.onInit(api);
      const audio = api.services.get('audio') as AudioService;

      await audio.preload('bg', '/sounds/bg.mp3');
      await audio.preload('bg', '/sounds/bg.mp3');

      expect((globalThis as any).fetch).toHaveBeenCalledTimes(1);

      plugin.onDestroy();
    });
  });

  describe('onDestroy', () => {
    it('should close AudioContext on destroy', () => {
      const plugin = new AudioPlugin();
      plugin.onInit(api);
      plugin.onDestroy();
      expect(ctxMock.close).toHaveBeenCalled();
    });
  });

  describe('DI pattern', () => {
    it('should allow another plugin to consume AudioPlugin via services', () => {
      const audio = new AudioPlugin();
      audio.onInit(api);

      const retrieved = api.services.get('audio') as AudioService;
      retrieved.preloadBuffer('hit', {} as AudioBuffer);
      const result = retrieved.play('hit');

      expect(result).not.toBeNull();
      audio.onDestroy();
    });
  });
});
