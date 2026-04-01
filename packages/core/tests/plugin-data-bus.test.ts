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
  it('empty buffer → []', () => {
    const buf = new ArrayBuffer(8 + 256 * 11);
    expect(readEventChannel(buf)).toEqual([]);
  });

  it('1 event → read correctly', () => {
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

  it('advances read_head after reading', () => {
    const buf = new ArrayBuffer(8 + 256 * 11);
    const view = new DataView(buf);
    view.setUint32(0, 1, true);
    view.setUint32(4, 0, true);
    readEventChannel(buf);
    expect(view.getUint32(4, true)).toBe(1);
  });

  it('second call returns [] (buffer already consumed)', () => {
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
  it('writes an event and returns true', () => {
    const buf = new ArrayBuffer(8 + 4 * 11); // capacity = 4
    const view = new DataView(buf);
    view.setUint32(0, 0, true); // write_head = 0
    view.setUint32(4, 0, true); // read_head  = 0

    const ok = writeEventToChannel(buf, { type: 7, slotA: 10, slotB: 20, flags: 3 });
    expect(ok).toBe(true);

    // Verify the written data
    const events = readEventChannel(buf);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 7, slotA: 10, slotB: 20, flags: 3 });
  });

  it('returns false when the ring is full', () => {
    const buf = new ArrayBuffer(8 + 2 * 11); // capacity = 2 — ring full at 1 event
    const view = new DataView(buf);
    view.setUint32(0, 1, true); // write_head = 1
    view.setUint32(4, 0, true); // read_head  = 0 → next = (1+1)%2 = 0 = read_head → full

    const ok = writeEventToChannel(buf, { type: 0, slotA: 1, slotB: 2, flags: 0 });
    expect(ok).toBe(false);
  });
});

// ─── getDataChannelView ───────────────────────────────────────────────────────

describe('getDataChannelView', () => {
  it('returns a Float32Array over the buffer', () => {
    const buf = new ArrayBuffer(20 * 4);
    const view = getDataChannelView(buf);
    expect(view).toBeInstanceOf(Float32Array);
    expect(view.buffer).toBe(buf);
  });
});

// ─── Edge cases — readEventChannel ────────────────────────────────────────────

describe('readEventChannel — edge cases', () => {
  it('wrap-around: read events after write_head wrap-around', () => {
    // Ring of capacity=2: events at slots 0 and 1
    const buf = new ArrayBuffer(8 + 2 * 11 + 4); // capacity = 2
    const view = new DataView(buf);

    // Write 2 events, wrap around: write_head ends at 0 (wrapped)
    // Slot 0: type=10, slotA=1, slotB=2, flags=1
    view.setUint16(8, 10, true);
    view.setUint32(8 + 2, 1, true);
    view.setUint32(8 + 6, 2, true);
    view.setUint8(8 + 10, 1);

    // Slot 1: type=20, slotA=3, slotB=4, flags=0
    view.setUint16(8 + 11, 20, true);
    view.setUint32(8 + 11 + 2, 3, true);
    view.setUint32(8 + 11 + 6, 4, true);
    view.setUint8(8 + 11 + 10, 0);

    // Simulate: write_head has wrapped to 0 after writing 2 events
    view.setUint32(0, 0, true); // write_head = 0 (wrapped)
    view.setUint32(4, 0, true); // read_head  = 0

    // Nothing to read: write_head == read_head
    const events1 = readEventChannel(buf);
    expect(events1).toHaveLength(0);

    // Add one event at slot 0 (write_head advances to 1)
    view.setUint32(0, 1, true); // write_head = 1

    // Now read from slot 0 (read_head=0, write_head=1)
    const events2 = readEventChannel(buf);
    expect(events2).toHaveLength(1);
    expect(events2[0]).toEqual({ type: 10, slotA: 1, slotB: 2, flags: 1 });

    // read_head advanced to 1 after reading
    expect(view.getUint32(4, true)).toBe(1);
  });

  it('multiple consecutive events', () => {
    const buf = new ArrayBuffer(8 + 256 * 11 + 4);
    const view = new DataView(buf);

    // Write 3 events
    for (let i = 0; i < 3; i++) {
      const offset = 8 + i * 11;
      view.setUint16(offset, 100 + i, true); // type
      view.setUint32(offset + 2, i * 10, true); // slotA
      view.setUint32(offset + 6, i * 20, true); // slotB
      view.setUint8(offset + 10, i); // flags
    }

    view.setUint32(0, 3, true); // write_head = 3
    view.setUint32(4, 0, true); // read_head  = 0

    const events = readEventChannel(buf);
    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ type: 100, slotA: 0, slotB: 0, flags: 0 });
    expect(events[1]).toEqual({ type: 101, slotA: 10, slotB: 20, flags: 1 });
    expect(events[2]).toEqual({ type: 102, slotA: 20, slotB: 40, flags: 2 });
  });

  it('read_head < write_head + wrap-around scenario', () => {
    // Ring of capacity=4: write_head=1, read_head=3 (events at slots 3 and 0)
    const buf = new ArrayBuffer(8 + 4 * 11 + 4); // capacity = 4
    const view = new DataView(buf);

    // Slot 3: type=30
    view.setUint16(8 + 3 * 11, 30, true);
    view.setUint32(8 + 3 * 11 + 2, 300, true);
    view.setUint32(8 + 3 * 11 + 6, 300, true);
    view.setUint8(8 + 3 * 11 + 10, 1);

    // Slot 0: type=31
    view.setUint16(8 + 0, 31, true);
    view.setUint32(8 + 0 + 2, 310, true);
    view.setUint32(8 + 0 + 6, 310, true);
    view.setUint8(8 + 0 + 10, 1);

    view.setUint32(0, 1, true); // write_head = 1
    view.setUint32(4, 3, true); // read_head  = 3

    const events = readEventChannel(buf);
    expect(events).toHaveLength(2);
    expect(events[0]!.type).toBe(30);
    expect(events[1]!.type).toBe(31);
  });
});

// ─── Edge cases — writeEventToChannel ─────────────────────────────────────────

describe('writeEventToChannel — edge cases', () => {
  it('write multiple events until ring is full', () => {
    const buf = new ArrayBuffer(8 + 3 * 11 + 4); // capacity = 3
    const view = new DataView(buf);

    // Ring empty: write_head=0, read_head=0
    expect(writeEventToChannel(buf, { type: 1, slotA: 1, slotB: 1, flags: 0 })).toBe(true);
    expect(view.getUint32(0, true)).toBe(1); // write_head advanced

    expect(writeEventToChannel(buf, { type: 2, slotA: 2, slotB: 2, flags: 0 })).toBe(true);
    expect(view.getUint32(0, true)).toBe(2);

    // Room for 1 more (next = (2+1)%3 = 0, read_head = 0 → full)
    expect(writeEventToChannel(buf, { type: 3, slotA: 3, slotB: 3, flags: 0 })).toBe(false);
    expect(view.getUint32(0, true)).toBe(2); // write_head unchanged
  });

  it('write with write_head wrap-around', () => {
    const buf = new ArrayBuffer(8 + 3 * 11 + 4); // capacity = 3
    const view = new DataView(buf);

    // Simulate: write_head=2, read_head=0, capacity=3
    // next = (2+1)%3 = 0, read_head=0 → full (before write)
    view.setUint32(0, 2, true); // write_head = 2
    view.setUint32(4, 0, true); // read_head  = 0

    // Try to write: should fail (full)
    expect(writeEventToChannel(buf, { type: 99, slotA: 99, slotB: 99, flags: 0 })).toBe(false);

    // Advance read_head to free space
    view.setUint32(4, 2, true); // read_head = 2

    // Now next = (2+1)%3 = 0, read_head = 2 → not full
    expect(writeEventToChannel(buf, { type: 77, slotA: 77, slotB: 77, flags: 0 })).toBe(true);
    expect(view.getUint32(0, true)).toBe(0); // write_head wrapped to 0
  });
});

// ─── Edge cases — resetEventChannels ──────────────────────────────────────────

describe('resetEventChannels — edge cases', () => {
  it('resets multiple ring channels simultaneously', () => {
    const bus = new PluginDataBus();
    const _ch1 = bus.allocate('physics2d', EVENTS_CHANNEL, 100);
    const ch2: EventChannel = {
      name: 'ai-events',
      direction: 'write',
      bufferType: 'ring',
      capacityEvents: 128,
    };
    const ch2Alloc = bus.allocate('ai-plugin', ch2, 100);

    const view1 = new DataView(_ch1.buffer);
    const view2 = new DataView(ch2Alloc.buffer);

    view1.setUint32(0, 10, true);
    view1.setUint32(4, 5, true);
    view2.setUint32(0, 20, true);
    view2.setUint32(4, 15, true);

    bus.resetEventChannels();

    expect(view1.getUint32(0, true)).toBe(0);
    expect(view1.getUint32(4, true)).toBe(0);
    expect(view2.getUint32(0, true)).toBe(0);
    expect(view2.getUint32(4, true)).toBe(0);
  });

  it('resetEventChannels with a mix of ring and data channels', () => {
    const bus = new PluginDataBus();
    const ringCh = bus.allocate('physics2d', EVENTS_CHANNEL, 100);
    const dataCh = bus.allocate('physics2d', TRANSFORM_CHANNEL, 100);

    const ringView = new DataView(ringCh.buffer);
    const dataView = new Float32Array(dataCh.buffer);

    ringView.setUint32(0, 7, true);
    ringView.setUint32(4, 3, true);
    dataView[0] = 42.0;
    dataView[5] = 99.5;

    bus.resetEventChannels();

    // Ring reset
    expect(ringView.getUint32(0, true)).toBe(0);
    expect(ringView.getUint32(4, true)).toBe(0);

    // Data channel untouched
    expect(dataView[0]).toBe(42.0);
    expect(dataView[5]).toBe(99.5);
  });
});

// ─── Edge cases — Sentinels ──────────────────────────────────────────────────

describe('PluginDataBus.checkSentinels — edge cases', () => {
  it('detects corruption at the sentinel of channel 2 out of 3', () => {
    const bus = new PluginDataBus();
    bus.allocate('plugin-a', TRANSFORM_CHANNEL, 100);
    const ch2 = bus.allocate('plugin-b', EVENTS_CHANNEL, 100);
    bus.allocate('plugin-c', TRANSFORM_CHANNEL, 50);

    bus.writeSentinels();

    // Corrupt the sentinel of channel 2
    const view2 = new DataView(ch2.buffer);
    view2.setUint32(ch2.buffer.byteLength - 4, 0xbeefdead, true);

    expect(() => bus.checkSentinels()).toThrow(/plugin-b.*events/i);
  });

  it('error message includes plugin ID and channel name', () => {
    const bus = new PluginDataBus();
    const ch = bus.allocate('my-special-plugin', EVENTS_CHANNEL, 100);
    bus.writeSentinels();

    const view = new DataView(ch.buffer);
    view.setUint32(ch.buffer.byteLength - 4, 0, true);

    expect(() => bus.checkSentinels()).toThrow(/my-special-plugin/);
    expect(() => bus.checkSentinels()).toThrow(/events/);
  });

  it('checkSentinels passes after writeSentinels even if buffers were modified before', () => {
    const bus = new PluginDataBus();
    const alloc = bus.allocate('physics2d', TRANSFORM_CHANNEL, 100);

    // Modify the buffer BEFORE writeSentinels
    const view = new Float32Array(alloc.buffer);
    view.fill(3.14159);

    bus.writeSentinels();

    // checkSentinels should pass (only the sentinel matters)
    expect(() => bus.checkSentinels()).not.toThrow();
  });
});
