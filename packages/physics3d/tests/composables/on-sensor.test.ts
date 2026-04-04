import { describe, it, expect, beforeEach } from 'vitest';
import {
  onSensorEnter,
  onSensorExit,
  _dispatchSensorEnter,
  _dispatchSensorExit,
  _clearSensorCallbacks,
} from '../../src/composables/on-sensor.js';

describe('onSensorEnter / onSensorExit', () => {
  beforeEach(() => {
    _clearSensorCallbacks();
  });

  it('onSensorEnter callback triggered by _dispatchSensorEnter with matching sensorId', () => {
    const received: bigint[] = [];
    onSensorEnter(10, (id) => received.push(id));
    _dispatchSensorEnter(10, 42n);
    expect(received).toEqual([42n]);
  });

  it('onSensorExit callback triggered by _dispatchSensorExit with matching sensorId', () => {
    const received: bigint[] = [];
    onSensorExit(20, (id) => received.push(id));
    _dispatchSensorExit(20, 99n);
    expect(received).toEqual([99n]);
  });

  it('enter callbacks only triggered for matching sensorId', () => {
    let triggeredA = false;
    let triggeredB = false;
    onSensorEnter(1, () => {
      triggeredA = true;
    });
    onSensorEnter(2, () => {
      triggeredB = true;
    });
    _dispatchSensorEnter(1, 0n);
    expect(triggeredA).toBe(true);
    expect(triggeredB).toBe(false);
  });

  it('exit callbacks only triggered for matching sensorId', () => {
    let triggeredA = false;
    let triggeredB = false;
    onSensorExit(100, () => {
      triggeredA = true;
    });
    onSensorExit(200, () => {
      triggeredB = true;
    });
    _dispatchSensorExit(200, 0n);
    expect(triggeredA).toBe(false);
    expect(triggeredB).toBe(true);
  });

  it('multiple enter callbacks for the same sensor are all invoked', () => {
    let count = 0;
    onSensorEnter(5, () => count++);
    onSensorEnter(5, () => count++);
    _dispatchSensorEnter(5, 0n);
    expect(count).toBe(2);
  });

  it('multiple exit callbacks for the same sensor are all invoked', () => {
    let count = 0;
    onSensorExit(7, () => count++);
    onSensorExit(7, () => count++);
    _dispatchSensorExit(7, 0n);
    expect(count).toBe(2);
  });

  it('dispatch on unregistered sensorId does not throw', () => {
    expect(() => _dispatchSensorEnter(999, 0n)).not.toThrow();
    expect(() => _dispatchSensorExit(999, 0n)).not.toThrow();
  });

  it('callbacks removed after _clearSensorCallbacks()', () => {
    let invoked = false;
    onSensorEnter(1, () => {
      invoked = true;
    });
    _clearSensorCallbacks();
    _dispatchSensorEnter(1, 0n);
    expect(invoked).toBe(false);
  });

  it('entityId is passed as bigint to enter callback', () => {
    let received: bigint | undefined;
    onSensorEnter(3, (id) => {
      received = id;
    });
    _dispatchSensorEnter(3, 1234n);
    expect(received).toBe(1234n);
    expect(typeof received).toBe('bigint');
  });
});
