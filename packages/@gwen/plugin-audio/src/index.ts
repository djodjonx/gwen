/**
 * AudioPlugin — TsPlugin wrapping the Web Audio API
 *
 * Manages an AudioContext, sound buffer preloading, and playback.
 * Registers itself in api.services as 'audio' for other plugins to consume.
 *
 * @example
 * ```typescript
 * import { AudioPlugin } from '@gwen/plugin-audio';
 *
 * engine.registerSystem(new AudioPlugin({ masterVolume: 0.8 }));
 *
 * // In any TsPlugin.onInit():
 * const audio = api.services.get<AudioPlugin>('audio');
 * audio.preload('jump', '/sounds/jump.wav');
 *
 * // In onUpdate():
 * if (keyboard.isJustPressed('Space')) {
 *   audio.play('jump');
 * }
 * ```
 */

import type { EngineAPI } from '@gwen/engine-core';
import type { GwenPlugin } from '@gwen/engine-core';

// ============= Types =============

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

// ============= Sound track =============

interface SoundTrack {
  buffer: AudioBuffer;
  nodes: AudioBufferSourceNode[];
}

// ============= AudioPlugin =============

export class AudioPlugin implements GwenPlugin<'AudioPlugin', { audio: AudioPlugin }> {
  readonly name = 'AudioPlugin' as const;

  /**
   * Déclare le service 'audio' injecté dans api.services.
   * Utilisé par TypeScript pour l'inférence — jamais lu à runtime.
   */
  readonly provides = { audio: {} as AudioPlugin };

  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sounds = new Map<string, SoundTrack>();
  private pendingLoads = new Map<string, Promise<void>>();
  private config: Required<AudioPluginConfig>;

  constructor(config: AudioPluginConfig = {}) {
    this.config = {
      masterVolume: config.masterVolume ?? 1,
    };
  }

  onInit(api: EngineAPI): void {
    // AudioContext creation deferred until user gesture in browsers,
    // but we create it here and it will auto-resume on first interaction.
    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = this.config.masterVolume;
    this.masterGain.connect(this.context.destination);

    api.services.register('audio', this);
  }

  onDestroy(): void {
    this.stopAll();
    this.context?.close();
    this.context = null;
    this.masterGain = null;
    this.sounds.clear();
    this.pendingLoads.clear();
  }

  // ── Preloading ─────────────────────────────────────────────────────────

  /**
   * Preload a sound from a URL. Must be called before play().
   * Returns a promise that resolves when the sound is ready.
   */
  async preload(id: string, url: string): Promise<void> {
    if (this.sounds.has(id)) return;
    if (this.pendingLoads.has(id)) return this.pendingLoads.get(id)!;

    if (!this.context) {
      throw new Error('[AudioPlugin] Plugin not initialized. Call engine.registerSystem() first.');
    }

    const loadPromise = fetch(url)
      .then((res) => res.arrayBuffer())
      .then((buf) => this.context!.decodeAudioData(buf))
      .then((buffer) => {
        this.sounds.set(id, { buffer, nodes: [] });
        this.pendingLoads.delete(id);
      });

    this.pendingLoads.set(id, loadPromise);
    return loadPromise;
  }

  /**
   * Preload from an already-decoded AudioBuffer (useful for tests).
   */
  preloadBuffer(id: string, buffer: AudioBuffer): void {
    this.sounds.set(id, { buffer, nodes: [] });
  }

  // ── Playback ───────────────────────────────────────────────────────────

  /** Play a preloaded sound. Returns the source node (for advanced control). */
  play(id: string, options: SoundOptions = {}): AudioBufferSourceNode | null {
    const ctx = this.context;
    const track = this.sounds.get(id);
    if (!ctx || !track || !this.masterGain) {
      console.warn(`[AudioPlugin] Sound '${id}' not found or AudioContext not ready.`);
      return null;
    }

    // Resume context if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const source = ctx.createBufferSource();
    source.buffer = track.buffer;
    source.playbackRate.value = options.pitch ?? 1;
    source.loop = options.loop ?? false;

    const gainNode = ctx.createGain();
    gainNode.gain.value = options.volume ?? 1;

    source.connect(gainNode);
    gainNode.connect(this.masterGain);

    // Track active nodes for stop/cleanup
    track.nodes.push(source);
    source.onended = () => {
      track.nodes = track.nodes.filter((n) => n !== source);
    };

    source.start(0);
    return source;
  }

  /** Stop all instances of a sound. */
  stop(id: string): void {
    const track = this.sounds.get(id);
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

  /** Stop all sounds. */
  stopAll(): void {
    for (const id of this.sounds.keys()) {
      this.stop(id);
    }
  }

  // ── Volume ─────────────────────────────────────────────────────────────

  setMasterVolume(volume: number): void {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  getMasterVolume(): number {
    return this.masterGain?.gain.value ?? 0;
  }

  // ── State ──────────────────────────────────────────────────────────────

  isLoaded(id: string): boolean {
    return this.sounds.has(id);
  }

  getContext(): AudioContext | null {
    return this.context;
  }
}
