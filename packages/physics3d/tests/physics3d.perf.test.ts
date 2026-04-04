import { describe, it, expect } from 'vitest';
import { ContactRingBuffer3D } from '../src/ring-buffer.js';

describe('physics3d performance', () => {
  it('drains 500 contact events in < 0.5ms', () => {
    const buf = new ContactRingBuffer3D();

    for (let i = 0; i < 500; i++) {
      buf.write({
        entityAIdx: i,
        entityBIdx: i + 1,
        contactX: 0,
        contactY: 0,
        contactZ: 0,
        normalX: 0,
        normalY: 1,
        normalZ: 0,
        relativeVelocity: 1,
        restitution: 0,
      });
    }

    const start = performance.now();
    const events = buf.drain();
    const elapsed = performance.now() - start;

    expect(events).toHaveLength(500);
    expect(elapsed).toBeLessThan(0.5);
  });

  it('writing and draining 512 events (full ring capacity) completes without data loss', () => {
    const buf = new ContactRingBuffer3D();

    for (let i = 0; i < 512; i++) {
      buf.write({
        entityAIdx: i,
        entityBIdx: i + 1,
        contactX: i,
        contactY: 0,
        contactZ: 0,
        normalX: 0,
        normalY: 1,
        normalZ: 0,
        relativeVelocity: 0,
        restitution: 0,
      });
    }

    const events = buf.drain();
    expect(events).toHaveLength(512);
    // Verify first and last event
    expect(events[0].entityA).toBe(0n);
    expect(events[511].entityA).toBe(511n);
  });
});
