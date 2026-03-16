import { describe, expect, it } from 'vitest';
import { getBodySnapshot, getSpeed, isSensorActive } from '../src/helpers/queries.ts';

describe('queries helpers', () => {
  it('should return snapshot with null fields when body is missing', () => {
    const physics = {
      getPosition: () => null,
      getLinearVelocity: () => null,
      getSensorState: () => ({ contactCount: 0, isActive: false }),
    } as any;

    const snap = getBodySnapshot(physics, 12);
    expect(snap).toEqual({ slot: 12, position: null, velocity: null });
  });

  it('should return a full snapshot when body exists', () => {
    const physics = {
      getPosition: () => ({ x: 1, y: 2, rotation: 0.5 }),
      getLinearVelocity: () => ({ x: 3, y: -1 }),
      getSensorState: () => ({ contactCount: 0, isActive: false }),
    } as any;

    const snap = getBodySnapshot(physics, 5);
    expect(snap.slot).toBe(5);
    expect(snap.position).toEqual({ x: 1, y: 2, rotation: 0.5 });
    expect(snap.velocity).toEqual({ x: 3, y: -1 });
  });

  it('should return false when sensor state is inactive', () => {
    const physics = {
      getSensorState: () => ({ contactCount: 0, isActive: false }),
    } as any;

    expect(isSensorActive(physics, 1, 99)).toBe(false);
  });

  it('should return true when sensor state is active', () => {
    const physics = {
      getSensorState: () => ({ contactCount: 2, isActive: true }),
    } as any;

    expect(isSensorActive(physics, 1, 0)).toBe(true);
  });

  it('should compute speed from linear velocity', () => {
    const physics = {
      getLinearVelocity: () => ({ x: 3, y: 4 }),
    } as any;

    expect(getSpeed(physics, 1)).toBe(5);
  });

  it('should return zero speed when velocity is unavailable', () => {
    const physics = {
      getLinearVelocity: () => null,
    } as any;

    expect(getSpeed(physics, 1)).toBe(0);
  });

  it('should return zero speed for zero velocity vector', () => {
    const physics = {
      getLinearVelocity: () => ({ x: 0, y: 0 }),
    } as any;

    expect(getSpeed(physics, 1)).toBe(0);
  });
});
