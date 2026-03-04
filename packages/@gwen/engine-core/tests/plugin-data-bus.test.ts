/**
 * Tests for PluginDataBus and event channel helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  PluginDataBus,
  readEventChannel,
  writeEventToChannel,
  getDataChannelView,
} from '../src/wasm/plugin-data-bus';
import type { DataChannel, EventChannel } from '../src/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TRANSFORM_CHANNEL: DataChannel = {
  name: 'transform',
  direction: 'read',
  strideBytes: 20,
  bufferType: 'f32',
};

const EVENTS_CHANNEL: EventChannel = {
  name: 'events',
  direction: 'write',
  bufferType: 'ring',
  capacityEvents: 256,
};

const MAX_ENTITIES = 100;

// ─── PluginDataBus — allocation ───────────────────────────────────────────────

describe('PluginDataBus', () => {
  it('allocates a Float32Array view for a f32 data channel', () => {
    const bus = new PluginDataBus();
    const alloc = bus.allocate('physics2d', TRANSFORM_CHANNEL, MAX_ENTITIES);
    expect(alloc.pluginId).toBe('physics2d');
    expect(alloc.channel).toBe(TRANSFORM_CHANNEL);
    expect(alloc.view).toBeInstanceOf(Float32Array);
    // byteLength = maxEntities × stride + 4 sentinel bytes
    expect(alloc.buffer.byteLength).toBe(MAX_ENTITIES * 20 + 4);
  });

  it('allocates a Uint8Array for a ring event channel', () => {
    const bus = new PluginDataBus();
    const alloc = bus.allocate('physics2d', EVENTS_CHANNEL, MAX_ENTITIES);
    expect(alloc.view).toBeInstanceOf(Uint8Array);
    // 8 header + 256 × 11 body + 4 sentinel
    expect(alloc.buffer.byteLength).toBe(8 + 256 * 11 + 4);
  });

  it('allocates a Int32Array for an i32 channel', () => {
    const bus = new PluginDataBus();
    const ch: DataChannel = {
      name: 'flags',
      direction: 'write',
      strideBytes: 4,
      bufferType: 'i32',
    };
    const alloc = bus.allocate('my-plugin', ch, MAX_ENTITIES);
    expect(alloc.view).toBeInstanceOf(Int32Array);
  });

  it('get() returns the allocated channel', () => {
    const bus = new PluginDataBus();
    bus.allocate('physics2d', TRANSFORM_CHANNEL, MAX_ENTITIES);
    const alloc = bus.get('physics2d', 'transform');
    expect(alloc).toBeDefined();
    expect(alloc!.pluginId).toBe('physics2d');
  });

  it('get() returns undefined for unknown channel', () => {
    const bus = new PluginDataBus();
    expect(bus.get('physics2d', 'transform')).toBeUndefined();
  });

  it('isolates channels between plugins', () => {
    const bus = new PluginDataBus();
    const a = bus.allocate('plugin-a', TRANSFORM_CHANNEL, MAX_ENTITIES);
    const b = bus.allocate('plugin-b', TRANSFORM_CHANNEL, MAX_ENTITIES);
    expect(a.buffer).not.toBe(b.buffer);
  });

  // ── Sentinels ───────────────────────────────────────────────────────────

  it('writeSentinels / checkSentinels — OK when intact', () => {
    const bus = new PluginDataBus();
    bus.allocate('p', TRANSFORM_CHANNEL, MAX_ENTITIES);
    bus.writeSentinels();
    expect(() => bus.checkSentinels()).not.toThrow();
  });

  it('checkSentinels — throws when sentinel is overwritten', () => {
    const bus = new PluginDataBus();
    const alloc = bus.allocate('p', TRANSFORM_CHANNEL, MAX_ENTITIES);
    bus.writeSentinels();
    // Corrupt the sentinel
    const view = new DataView(alloc.buffer);
    view.setUint32(alloc.buffer.byteLength - 4, 0xdeadbeef ^ 1, true);
    expect(() => bus.checkSentinels()).toThrow(/sentinel/i);
  });

  it('checkSentinels — no-op before writeSentinels', () => {
    const bus = new PluginDataBus();
    bus.allocate('p', TRANSFORM_CHANNEL, MAX_ENTITIES);
    expect(() => bus.checkSentinels()).not.toThrow();
  });

  // ── resetEventChannels ──────────────────────────────────────────────────

  it('resetEventChannels resets write_head and read_head to 0', () => {
    const bus = new PluginDataBus();
    const alloc = bus.allocate('physics2d', EVENTS_CHANNEL, MAX_ENTITIES);
    // Simulate Rust having written some events
    const view = new DataView(alloc.buffer);
    view.setUint32(0, 5, true); // write_head = 5
    view.setUint32(4, 3, true); // read_head  = 3

    bus.resetEventChannels();

    expect(view.getUint32(0, true)).toBe(0); // write_head reset
    expect(view.getUint32(4, true)).toBe(0); // read_head  reset
  });

  it('resetEventChannels does not affect data channels', () => {
    const bus = new PluginDataBus();
    const alloc = bus.allocate('physics2d', TRANSFORM_CHANNEL, MAX_ENTITIES);
    const view = new Float32Array(alloc.buffer);
    view[0] = 99.5; // write some data

    bus.resetEventChannels();

    expect(view[0]).toBe(99.5); // untouched
  });
});

// ─── readEventChannel ─────────────────────────────────────────────────────────

describe('readEventChannel', () => {
  it('buffer vide → []', () => {
    const buf = new ArrayBuffer(8 + 256 * 11);
    expect(readEventChannel(buf)).toEqual([]);
  });

  it('1 event → lu correctement', () => {
    const buf = new ArrayBuffer(8 + 256 * 11);
    const view = new DataView(buf);
    view.setUint32(0, 1, true); // write_head = 1
    view.setUint32(4, 0, true); // read_head  = 0
    view.setUint16(8, 42, true); // type = 42
    view.setUint32(8 + 2, 5, true); // slotA = 5
    view.setUint32(8 + 6, 3, true); // slotB = 3
    view.setUint8(8 + 10, 1); // flags = 1
    const events = readEventChannel(buf);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 42, slotA: 5, slotB: 3, flags: 1 });
  });

  it('avance read_head après lecture', () => {
    const buf = new ArrayBuffer(8 + 256 * 11);
    const view = new DataView(buf);
    view.setUint32(0, 1, true);
    view.setUint32(4, 0, true);
    readEventChannel(buf);
    expect(view.getUint32(4, true)).toBe(1);
  });

  it('2e appel retourne [] (buffer consommé)', () => {
    const buf = new ArrayBuffer(8 + 256 * 11);
    const view = new DataView(buf);
    view.setUint32(0, 1, true);
    view.setUint32(4, 0, true);
    readEventChannel(buf);
    expect(readEventChannel(buf)).toEqual([]);
  });
});

// ─── writeEventToChannel ──────────────────────────────────────────────────────

describe('writeEventToChannel', () => {
  it('écrit un event et retourne true', () => {
    const buf = new ArrayBuffer(8 + 4 * 11); // capacity = 4
    const view = new DataView(buf);
    view.setUint32(0, 0, true); // write_head = 0
    view.setUint32(4, 0, true); // read_head  = 0

    const ok = writeEventToChannel(buf, { type: 7, slotA: 10, slotB: 20, flags: 3 });
    expect(ok).toBe(true);

    // Vérifier les données écrites
    const events = readEventChannel(buf);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 7, slotA: 10, slotB: 20, flags: 3 });
  });

  it('retourne false quand le ring est plein', () => {
    const buf = new ArrayBuffer(8 + 2 * 11); // capacity = 2 — ring plein à 1 event
    const view = new DataView(buf);
    view.setUint32(0, 1, true); // write_head = 1
    view.setUint32(4, 0, true); // read_head  = 0 → next = (1+1)%2 = 0 = read_head → plein

    const ok = writeEventToChannel(buf, { type: 0, slotA: 1, slotB: 2, flags: 0 });
    expect(ok).toBe(false);
  });
});

// ─── getDataChannelView ───────────────────────────────────────────────────────

describe('getDataChannelView', () => {
  it('retourne un Float32Array sur le buffer', () => {
    const buf = new ArrayBuffer(20 * 4);
    const view = getDataChannelView(buf);
    expect(view).toBeInstanceOf(Float32Array);
    expect(view.buffer).toBe(buf);
  });
});
