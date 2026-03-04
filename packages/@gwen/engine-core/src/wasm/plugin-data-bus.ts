/**
 * PluginDataBus — JS-native buffer allocator for WASM plugin channels.
 *
 * Allocates independent `ArrayBuffer`s for each declared plugin channel.
 * These buffers are completely decoupled from gwen-core's WASM linear memory,
 * so a `memory.grow()` event in gwen-core has zero effect on them.
 *
 * ## Design rationale
 * - Two WASM modules compiled separately cannot share raw pointers.
 * - A JS `Uint8Array` over a native `ArrayBuffer` is the only safe, spec-compliant
 *   bridge between two WASM modules in a browser.
 * - One `copy_from()` bulk call per channel per frame costs ~1–20µs and is negligible
 *   compared to the physics simulation itself.
 *
 * ## Ring-buffer protocol (event channels)
 * ```
 * Offset  0 : write_head  (u32 LE) — next slot to write
 * Offset  4 : read_head   (u32 LE) — next slot to read
 * Offset  8…: events, each 11 bytes: [type u16][slotA u32][slotB u32][flags u8]
 * ```
 *
 * Reset at start of every frame: both heads → 0.
 */

import type { PluginChannel, DataChannel, EventChannel, GwenEvent } from '../types';
import { EVENT_HEADER_BYTES, EVENT_STRIDE } from '../types';

// ─── AllocatedChannel ─────────────────────────────────────────────────────────

export interface AllocatedChannel {
  readonly pluginId: string;
  readonly channel: PluginChannel;
  readonly buffer: ArrayBuffer;
  /** Typed view over the buffer (Float32Array | Int32Array | Uint8Array). */
  readonly view: Float32Array | Int32Array | Uint8Array;
}

// ─── Helpers: ring-buffer event I/O ──────────────────────────────────────────

/** Byte size of the sentinel canary appended to each buffer in debug mode. */
const SENTINEL = 0xdeadbeef;
const SENTINEL_BYTES = 4;

/**
 * Read all pending events from a ring-buffer channel.
 * Advances `read_head` to `write_head` (marks the buffer as consumed).
 *
 * The buffer **must** have been reset to heads=0 at the start of the frame
 * before the Rust plugin's `step()` wrote into it.
 */
export function readEventChannel(buffer: ArrayBuffer): GwenEvent[] {
  const view = new DataView(buffer);
  const writeHead = view.getUint32(0, true);
  const readHead = view.getUint32(4, true);
  const capacity = Math.floor((buffer.byteLength - EVENT_HEADER_BYTES) / EVENT_STRIDE);

  if (writeHead === readHead) return [];

  const events: GwenEvent[] = [];
  let idx = readHead;

  while (idx !== writeHead) {
    const offset = EVENT_HEADER_BYTES + idx * EVENT_STRIDE;
    events.push({
      type: view.getUint16(offset, true),
      slotA: view.getUint32(offset + 2, true),
      slotB: view.getUint32(offset + 6, true),
      flags: view.getUint8(offset + 10),
    });
    idx = (idx + 1) % capacity;
  }

  // Mark buffer as consumed — advance read_head to write_head
  view.setUint32(4, writeHead, true);
  return events;
}

/**
 * Write a single event into a ring-buffer channel from TypeScript.
 * Returns `false` if the ring is full (overflow — event dropped).
 */
export function writeEventToChannel(buffer: ArrayBuffer, event: GwenEvent): boolean {
  const view = new DataView(buffer);
  const capacity = Math.floor((buffer.byteLength - EVENT_HEADER_BYTES) / EVENT_STRIDE);
  const writeHead = view.getUint32(0, true);
  const readHead = view.getUint32(4, true);
  const next = (writeHead + 1) % capacity;

  if (next === readHead) return false; // ring full

  const offset = EVENT_HEADER_BYTES + writeHead * EVENT_STRIDE;
  view.setUint16(offset, event.type, true);
  view.setUint32(offset + 2, event.slotA, true);
  view.setUint32(offset + 6, event.slotB, true);
  view.setUint8(offset + 10, event.flags);
  view.setUint32(0, next, true); // advance write_head
  return true;
}

/**
 * Get a Float32Array view over a data channel buffer.
 * Convenience helper for plugins reading/writing typed float data.
 */
export function getDataChannelView(buffer: ArrayBuffer): Float32Array {
  return new Float32Array(buffer);
}

// ─── PluginDataBus ────────────────────────────────────────────────────────────

/**
 * Central allocator for all plugin channel buffers.
 * Instantiated once by `createEngine()` and passed to each `GwenWasmPlugin.onInit()`.
 */
export class PluginDataBus {
  private readonly _channels = new Map<string, AllocatedChannel>();
  /** True when sentinel canaries have been written (debug mode). */
  private _sentinelsWritten = false;

  // ── Allocation ────────────────────────────────────────────────────────────

  /**
   * Allocate a buffer for a plugin channel.
   *
   * - `DataChannel`: `maxEntities × strideBytes` bytes (+ 4 sentinel in debug).
   * - `EventChannel`: `8 + capacityEvents × 11` bytes (+ 4 sentinel in debug).
   */
  allocate(pluginId: string, channel: PluginChannel, maxEntities: number): AllocatedChannel {
    const key = `${pluginId}:${channel.name}`;

    let byteLength: number;
    let view: Float32Array | Int32Array | Uint8Array;

    if (channel.bufferType === 'ring') {
      const ec = channel as EventChannel;
      byteLength = EVENT_HEADER_BYTES + ec.capacityEvents * EVENT_STRIDE + SENTINEL_BYTES;
      const buffer = new ArrayBuffer(byteLength);
      view = new Uint8Array(buffer);
      const allocated: AllocatedChannel = { pluginId, channel, buffer, view };
      this._channels.set(key, allocated);
      return allocated;
    } else {
      const dc = channel as DataChannel;
      byteLength = maxEntities * dc.strideBytes + SENTINEL_BYTES;
      const buffer = new ArrayBuffer(byteLength);
      if (dc.bufferType === 'f32') {
        view = new Float32Array(buffer);
      } else if (dc.bufferType === 'i32') {
        view = new Int32Array(buffer);
      } else {
        view = new Uint8Array(buffer);
      }
      const allocated: AllocatedChannel = { pluginId, channel, buffer, view };
      this._channels.set(key, allocated);
      return allocated;
    }
  }

  /**
   * Look up an already-allocated channel.
   * Returns `undefined` if the plugin did not declare this channel.
   */
  get(pluginId: string, channelName: string): AllocatedChannel | undefined {
    return this._channels.get(`${pluginId}:${channelName}`);
  }

  // ── Debug sentinels ───────────────────────────────────────────────────────

  /**
   * Write `0xDEADBEEF` sentinel canaries at the end of every allocated buffer.
   * Call once after all channels are allocated (before `onInit()`).
   */
  writeSentinels(): void {
    for (const alloc of this._channels.values()) {
      const view = new DataView(alloc.buffer);
      const offset = alloc.buffer.byteLength - SENTINEL_BYTES;
      view.setUint32(offset, SENTINEL, true);
    }
    this._sentinelsWritten = true;
  }

  /**
   * Verify that no sentinel has been overwritten.
   * Throws if a buffer overrun is detected.
   * Call each frame in debug mode after `dispatchWasmStep`.
   */
  checkSentinels(): void {
    if (!this._sentinelsWritten) return;
    for (const alloc of this._channels.values()) {
      const view = new DataView(alloc.buffer);
      const offset = alloc.buffer.byteLength - SENTINEL_BYTES;
      const value = view.getUint32(offset, true);
      if (value !== SENTINEL) {
        throw new Error(
          `[GWEN] PluginDataBus: sentinel overwrite detected in plugin '${alloc.pluginId}' ` +
            `channel '${alloc.channel.name}' — ` +
            `expected 0x${SENTINEL.toString(16).toUpperCase()}, ` +
            `got 0x${value.toString(16).toUpperCase().padStart(8, '0')}. ` +
            `The Rust plugin wrote past the end of its buffer.`,
        );
      }
    }
  }

  // ── Frame protocol ────────────────────────────────────────────────────────

  /**
   * Reset all ring-buffer event channels to empty (write_head = read_head = 0).
   * Must be called at the start of each frame, before `dispatchWasmStep`.
   */
  resetEventChannels(): void {
    for (const alloc of this._channels.values()) {
      if (alloc.channel.bufferType === 'ring') {
        const view = new DataView(alloc.buffer);
        view.setUint32(0, 0, true); // write_head = 0
        view.setUint32(4, 0, true); // read_head  = 0
      }
    }
  }
}
