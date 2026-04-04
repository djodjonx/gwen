import { describe, it, expect, beforeEach } from 'vitest';
import {
  onContact,
  _dispatchContactEvent,
  _clearContactCallbacks,
} from '../../src/composables/on-contact.js';
import type { ContactEvent3D } from '../../src/types.js';

const sampleEvent: ContactEvent3D = {
  entityA: 1n,
  entityB: 2n,
  contactX: 1.0,
  contactY: 2.0,
  contactZ: -3.5,
  normalX: 0,
  normalY: 1,
  normalZ: 0,
  relativeVelocity: 5.0,
  restitution: 0.4,
};

describe('onContact / _dispatchContactEvent', () => {
  beforeEach(() => {
    _clearContactCallbacks();
  });

  it('registered callback is invoked on dispatch', () => {
    const received: ContactEvent3D[] = [];
    onContact((e) => received.push(e));
    _dispatchContactEvent(sampleEvent);
    expect(received).toHaveLength(1);
    expect(received[0]).toBe(sampleEvent);
  });

  it('multiple callbacks are all invoked', () => {
    let count = 0;
    onContact(() => count++);
    onContact(() => count++);
    onContact(() => count++);
    _dispatchContactEvent(sampleEvent);
    expect(count).toBe(3);
  });

  it('ContactEvent3D has the contactZ field in the callback', () => {
    let receivedZ: number | undefined;
    onContact((e) => {
      receivedZ = e.contactZ;
    });
    _dispatchContactEvent(sampleEvent);
    expect(receivedZ).toBeCloseTo(-3.5, 5);
  });

  it('callback receives event with correct restitution value', () => {
    let receivedRestitution: number | undefined;
    onContact((e) => {
      receivedRestitution = e.restitution;
    });
    _dispatchContactEvent(sampleEvent);
    expect(receivedRestitution).toBeCloseTo(0.4, 5);
  });

  it('no callbacks invoked after _clearContactCallbacks()', () => {
    let invoked = false;
    onContact(() => {
      invoked = true;
    });
    _clearContactCallbacks();
    _dispatchContactEvent(sampleEvent);
    expect(invoked).toBe(false);
  });

  it('dispatch with no callbacks does not throw', () => {
    expect(() => _dispatchContactEvent(sampleEvent)).not.toThrow();
  });

  it('contactEvent has normalZ field', () => {
    let receivedNormalZ: number | undefined;
    onContact((e) => {
      receivedNormalZ = e.normalZ;
    });
    _dispatchContactEvent({ ...sampleEvent, normalZ: -1 });
    expect(receivedNormalZ).toBe(-1);
  });
});
