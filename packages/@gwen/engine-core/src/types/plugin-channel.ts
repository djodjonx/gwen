/**
 * Plugin Data Bus channel types.
 *
 * Channels are declared statically on a `GwenWasmPlugin` so that
 * `PluginDataBus` can pre-allocate the right `ArrayBuffer` for each one
 * before `onInit()` is called.
 *
 * Two kinds of channels:
 * - `DataChannel`  — bulk typed arrays (transforms, positions, velocities…)
 * - `EventChannel` — ring-buffer of fixed-size binary events (collisions…)
 */

// ── Data channel ──────────────────────────────────────────────────────────────

/**
 * Bulk data channel — one `Float32Array` / `Int32Array` / `Uint8Array`
 * with `strideBytes` bytes per entity slot.
 *
 * @example Transform read channel (20 bytes/entity: pos_x, pos_y, rot, sx, sy)
 * ```ts
 * { name: 'transform', direction: 'read', strideBytes: 20, bufferType: 'f32' }
 * ```
 */
export interface DataChannel {
  readonly name: string;
  /** Which side owns the writes. */
  readonly direction: 'read' | 'write' | 'readwrite';
  /** Bytes consumed per entity slot. Must be a multiple of the element size. */
  readonly strideBytes: number;
  readonly bufferType: 'f32' | 'i32' | 'u8';
}

// ── Event channel ─────────────────────────────────────────────────────────────

/**
 * Ring-buffer event channel — written by a WASM plugin, consumed by TypeScript.
 *
 * Buffer layout:
 * ```
 * [write_head u32][read_head u32]  ← 8-byte header
 * [type u16][slotA u32][slotB u32][flags u8]  ← 11 bytes × capacityEvents
 * ```
 *
 * @example Collision event channel (256 events max)
 * ```ts
 * { name: 'events', direction: 'write', bufferType: 'ring', capacityEvents: 256 }
 * ```
 */
export interface EventChannel {
  readonly name: string;
  readonly direction: 'write';
  readonly bufferType: 'ring';
  /** Maximum number of events that fit in the ring before wrap-around. */
  readonly capacityEvents: number;
}

/** Union — pass either kind to `GwenWasmPlugin.channels[]`. */
export type PluginChannel = DataChannel | EventChannel;

// ── Binary event ──────────────────────────────────────────────────────────────

/**
 * A single decoded event from a ring-buffer channel.
 * The 11-byte wire format is shared across all plugins.
 */
export interface GwenEvent {
  /** u16 — event type code (plugin-defined, e.g. 0 = collision started). */
  type: number;
  /** u32 — raw ECS slot index of the first entity (NOT a packed EntityId). */
  slotA: number;
  /** u32 — raw ECS slot index of the second entity, or 0 if N/A. */
  slotB: number;
  /** u8 — plugin-defined flags (e.g. bit 0 = contact started). */
  flags: number;
}

// ── Wire-format constants ─────────────────────────────────────────────────────

/** Byte size of the ring-buffer header (`write_head` + `read_head`). */
export const EVENT_HEADER_BYTES = 8;

/** Byte size of a single event in the ring-buffer wire format. */
export const EVENT_STRIDE = 11;
