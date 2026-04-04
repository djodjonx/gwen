/**
 * @file Compile-time type compatibility tests for RFC-06 types.
 *
 * These tests contain no runtime assertions — the test file itself is the test.
 * If TypeScript compiles this file without errors, the type constraints are satisfied.
 */
import type {
  ContactEvent3D,
  StaticBodyHandle3D,
  DynamicBodyHandle3D,
  BoxColliderHandle3D,
  ColliderHandle3D,
} from '../src/types.js';

// DynamicBodyHandle3D must extend StaticBodyHandle3D
const _dynamicIsStatic: StaticBodyHandle3D = {} as DynamicBodyHandle3D;
void _dynamicIsStatic;

// BoxColliderHandle3D must extend ColliderHandle3D
const _boxIsCollider: ColliderHandle3D = {} as BoxColliderHandle3D;
void _boxIsCollider;

// ContactEvent3D must have all z-coordinate fields
const _event: ContactEvent3D = {
  entityA: 0n,
  entityB: 1n,
  contactX: 0,
  contactY: 0,
  contactZ: 0, // must exist (3D-only field)
  normalX: 0,
  normalY: 0,
  normalZ: 0, // must exist (3D-only field)
  relativeVelocity: 0,
  restitution: 0,
};
void _event;

// DynamicBodyHandle3D must have applyForce, applyImpulse, applyTorque, setVelocity
const _dh: DynamicBodyHandle3D = {} as DynamicBodyHandle3D;
const _applyForce: (fx: number, fy: number, fz: number) => void = _dh.applyForce;
const _applyImpulse: (ix: number, iy: number, iz: number) => void = _dh.applyImpulse;
const _applyTorque: (tx: number, ty: number, tz: number) => void = _dh.applyTorque;
const _setVelocity: (vx: number, vy: number, vz: number) => void = _dh.setVelocity;
void _applyForce;
void _applyImpulse;
void _applyTorque;
void _setVelocity;

// Vitest requires at least one test in the file
import { it, expect } from 'vitest';
it('type compatibility — this test just needs to compile', () => {
  // The compile-time checks above are the real assertions.
  expect(true).toBe(true);
});
