/**
 * AudioPlugin — wraps the Web Audio API.
 *
 * Registers an `AudioService` in `api.services` as `'audio'`.
 *
 * @example
 * ```typescript
 * import { AudioPlugin } from '@djodjonx/gwen-plugin-audio';
 *
 * export default defineConfig({
 *   plugins: [new AudioPlugin({ masterVolume: 0.8 })],
 * });
 *
 * // In any plugin onInit():
 * const audio = api.services.get('audio') as AudioService;
 * await audio.preload('jump', '/sounds/jump.wav');
 * audio.play('jump');
 * ```
 */

import { definePlugin } from '@djodjonx/gwen-kit';
import type { EngineAPI, GwenPluginMeta } from '@djodjonx/gwen-kit';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SoundOptions {
  /** Volume multiplier (0-1). Defaults to 1. */
  volume?: number;
  /** Pitch multiplier (playback rate). Defaults to 1. */
  pitch?: number;
  /** Loop the sound. Defaults to false. */
  loop?: boolean;
}

export interface AudioPluginConfig {
  /** Master volume (0-1). Defaults to 1. */
  masterVolume?: number;
}

interface SoundTrack {
  buffer: AudioBuffer;
  nodes: AudioBufferSourceNode[];
}

/**
 * Service exposed by AudioPlugin via `api.services.get('audio')`.
 */
export interface AudioService {
  /**
   * Preload a sound from a URL. Must be called before `play()`.
   *
   * @param id  Unique sound identifier.
   * @param url Fetch-able URL to audio file (WAV, MP3, OGG…).
   */
  preload(id: string, url: string): Promise<void>;

  /**
   * Preload from an already-decoded AudioBuffer (useful in tests).
   *
   * @param id     Unique sound identifier.
   * @param buffer Pre-decoded AudioBuffer.
   */
  preloadBuffer(id: string, buffer: AudioBuffer): void;

  /**
   * Play a preloaded sound. Multiple instances can play simultaneously.
   *
   * @param id      Sound identifier (must be preloaded first).
   * @param options Volume, pitch, loop flag.
   * @returns The AudioBufferSourceNode, or `null` if sound not found.
   */
  play(id: string, options?: SoundOptions): AudioBufferSourceNode | null;

  /**
   * Stop all playing instances of a specific sound.
   *
   * @param id Sound identifier.
   */
  stop(id: string): void;

  /** Stop all currently playing sounds. */
  stopAll(): void;

  /**
   * Set the master volume.
   *
   * @param volume Value between 0 and 1.
   */
  setMasterVolume(volume: number): void;

  /** Get the current master volume (0-1). */
  getMasterVolume(): number;

  /**
   * Returns `true` if the sound has been preloaded successfully.
   *
   * @param id Sound identifier.
   */
  isLoaded(id: string): boolean;

  /** Returns the underlying AudioContext, or `null` before `onInit`. */
  getContext(): AudioContext | null;
}

export const pluginMeta: GwenPluginMeta = {
  serviceTypes: {
    audio: { from: '@djodjonx/gwen-plugin-audio', exportName: 'AudioService' },
  },
};

// ── AudioPlugin ───────────────────────────────────────────────────────────────

export const AudioPlugin = definePlugin({
  name: 'AudioPlugin',
  meta: pluginMeta,
  provides: { audio: {} as AudioService },

  setup(config: AudioPluginConfig = {}) {
    const masterVolume = config.masterVolume ?? 1;

    let context: AudioContext | null = null;
    let masterGain: GainNode | null = null;
    const sounds = new Map<string, SoundTrack>();
    const pendingLoads = new Map<string, Promise<void>>();

    function stop(id: string): void {
      const track = sounds.get(id);
      if (!track) return;
      for (const node of track.nodes) {
        try {
          node.stop();
        } catch {
          /* already stopped */
        }
      }
      track.nodes = [];
    }

    const service: AudioService = {
      async preload(id, url) {
        if (sounds.has(id)) return;
        if (pendingLoads.has(id)) return pendingLoads.get(id)!;
        if (!context) throw new Error('[AudioPlugin] Plugin not initialized.');

        const p = fetch(url)
          .then((r) => r.arrayBuffer())
          .then((buf) => context!.decodeAudioData(buf))
          .then((buffer) => {
            sounds.set(id, { buffer, nodes: [] });
            pendingLoads.delete(id);
          });
        pendingLoads.set(id, p);
        return p;
      },

      preloadBuffer(id, buffer) {
        sounds.set(id, { buffer, nodes: [] });
      },

      play(id, options = {}) {
        const ctx = context;
        const track = sounds.get(id);
        if (!ctx || !track || !masterGain) {
          console.warn(`[AudioPlugin] Sound '${id}' not found or AudioContext not ready.`);
          return null;
        }
        if (ctx.state === 'suspended') ctx.resume();

        const source = ctx.createBufferSource();
        source.buffer = track.buffer;
        source.playbackRate.value = options.pitch ?? 1;
        source.loop = options.loop ?? false;

        const gain = ctx.createGain();
        gain.gain.value = options.volume ?? 1;
        source.connect(gain);
        gain.connect(masterGain);

        track.nodes.push(source);
        source.onended = () => {
          track.nodes = track.nodes.filter((n) => n !== source);
        };
        source.start(0);
        return source;
      },

      stop,

      stopAll() {
        for (const id of sounds.keys()) stop(id);
      },

      setMasterVolume(volume) {
        if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, volume));
      },

      getMasterVolume() {
        return masterGain?.gain.value ?? 0;
      },

      isLoaded(id) {
        return sounds.has(id);
      },

      getContext() {
        return context;
      },
    };

    return {
      onInit(api: EngineAPI): void {
        context = new AudioContext();
        masterGain = context.createGain();
        masterGain.gain.value = masterVolume;
        masterGain.connect(context.destination);
        api.services.register('audio', service);
      },

      onDestroy(): void {
        service.stopAll();
        context?.close();
        context = null;
        masterGain = null;
        sounds.clear();
        pendingLoads.clear();
      },
    };
  },
});
