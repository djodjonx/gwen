import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Physics3DBodyHandle } from '../../src/types.js';

vi.mock('@gwenjs/core/scene', () => ({
  _getActorEntityId: vi.fn(() => 1n),
}));

vi.mock('../../src/composables/collider-id.js', () => ({
  nextColliderId: vi.fn(() => 1),
}));

const mockBodyHandle: Physics3DBodyHandle = {
  bodyId: 1,
  entityId: 0,
  kind: 'fixed',
  mass: 1,
  linearDamping: 0,
  angularDamping: 0,
};

const mockPhysics3D = {
  createBody: vi.fn(() => mockBodyHandle),
  removeBody: vi.fn(() => true),
  applyImpulse: vi.fn(() => true),
  applyAngularImpulse: vi.fn(() => true),
  applyTorque: vi.fn(() => true),
  setLinearVelocity: vi.fn(() => true),
  getLinearVelocity: vi.fn(() => ({ x: 1, y: 2, z: 3 })),
  getAngularVelocity: vi.fn(() => ({ x: 0.1, y: 0.2, z: 0.3 })),
  addCollider: vi.fn(() => true),
  removeCollider: vi.fn(() => true),
};

vi.mock('../../src/composables.js', () => ({
  usePhysics3D: vi.fn(() => mockPhysics3D),
}));

import { useMeshCollider } from '../../src/composables/use-mesh-collider.js';

describe('useMeshCollider', () => {
  const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const indices = new Uint32Array([0, 1, 2]);

  beforeEach(() => {
    vi.clearAllMocks();
    mockPhysics3D.addCollider.mockReturnValue(true);
    mockPhysics3D.removeCollider.mockReturnValue(true);
  });

  it('calls addCollider with shape.type === mesh', () => {
    useMeshCollider({ vertices, indices });
    const call = mockPhysics3D.addCollider.mock.calls[0][1];
    expect(call.shape.type).toBe('mesh');
  });

  it('vertices are forwarded as the same reference', () => {
    useMeshCollider({ vertices, indices });
    const call = mockPhysics3D.addCollider.mock.calls[0][1];
    expect(call.shape.vertices).toBe(vertices);
  });

  it('indices are forwarded as the same reference', () => {
    useMeshCollider({ vertices, indices });
    const call = mockPhysics3D.addCollider.mock.calls[0][1];
    expect(call.shape.indices).toBe(indices);
  });

  it('handle.colliderId is a number', () => {
    const handle = useMeshCollider({ vertices, indices });
    expect(typeof handle.colliderId).toBe('number');
  });

  it('handle.remove() calls removeCollider with the correct colliderId', () => {
    const handle = useMeshCollider({ vertices, indices });
    const cid = handle.colliderId;
    handle.remove();
    expect(mockPhysics3D.removeCollider).toHaveBeenCalledWith(1n, cid);
  });

  it('passes isSensor to addCollider', () => {
    useMeshCollider({ vertices, indices, isSensor: true });
    expect(mockPhysics3D.addCollider).toHaveBeenCalledWith(
      1n,
      expect.objectContaining({ isSensor: true }),
    );
  });
});
