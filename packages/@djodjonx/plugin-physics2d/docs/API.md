# API Reference

## `physics2D(config)`

```ts
import { physics2D } from '@djodjonx/gwen-plugin-physics2d';

export default defineConfig({
  plugins: [
    physics2D({
      gravity: -9.81,
      qualityPreset: 'medium',
      eventMode: 'pull',
      compat: {
        legacyPrefabColliderProps: true,
        legacyCollisionJsonParser: true,
      },
    }),
  ],
});
```

### `Physics2DConfig`

- `gravity?: number` - gravity Y in m/s². Default `-9.81`.
- `gravityX?: number` - gravity X in m/s². Default `0`.
- `maxEntities?: number` - max ECS slots. Default `10_000`.
- `qualityPreset?: 'low' | 'medium' | 'high' | 'esport'` - quality contract reserved for upcoming solver tuning. Default `"medium"`.
- `eventMode?: 'pull' | 'hybrid'` - `pull` is the first-class path. `hybrid` also dispatches convenience hooks during `onUpdate`. Default `"pull"`.
- `compat?: { legacyPrefabColliderProps?: boolean; legacyCollisionJsonParser?: boolean }` - transitional compatibility flags. Both default to `true`.
- `debug?: boolean` - enable debug logs. Default `false`.

## `physics` Service (`Physics2DAPI`)

Access:

```ts
onInit(api) {
  const physics = api.services.get('physics');
}
```

### `addRigidBody(entityIndex, type, x, y, opts?)`

Creates a rigid body.

- `entityIndex: number` - ECS slot index (not a packed `EntityId`)
- `type: 'fixed' | 'dynamic' | 'kinematic'`
- `x, y: number` - position in meters
- `opts`:
  - `mass?: number`
  - `gravityScale?: number`
  - `linearDamping?: number`
  - `angularDamping?: number`
  - `initialVelocity?: { vx: number; vy: number }` (m/s)

Returns: `bodyHandle: number`.

### `addBoxCollider(bodyHandle, hw, hh, opts?)`

- `hw, hh` in meters (half extents)
- `opts: ColliderOptions`

### `addBallCollider(bodyHandle, radius, opts?)`

- `radius` in meters
- `opts: ColliderOptions`

### `removeBody(entityIndex)`

Removes the rigid body associated with the ECS slot.

### `setKinematicPosition(entityIndex, x, y)`

Updates kinematic position in meters.

### `applyImpulse(entityIndex, x, y)`

Applies a linear impulse.

### `setLinearVelocity(entityIndex, vx, vy)`

Sets linear velocity directly.

### `getCollisionEventsBatch(opts?)`

Pull-first event API.

```ts
const events = physics.getCollisionEventsBatch({ max: 128, coalesced: true });
```

- Reads from the binary ring buffer through typed views (`DataView` on the channel buffer).
- Reuses the same frame-local batch if called multiple times in the same frame.
- `coalesced` is reserved for future behavior and currently ignored.

Returns raw `CollisionEvent[]`:

```ts
interface CollisionEvent {
  slotA: number;
  slotB: number;
  started: boolean;
}
```

### `getCollisionEvents()`

Legacy alias kept for compatibility.

> Deprecated since `0.4.0`. Use `getCollisionEventsBatch()` instead. Planned removal: `1.0.0`.

### `getPosition(entityIndex)`

Returns `{ x, y, rotation } | null` in meters/radians.

## Prefab extension `extensions.physics`

### Recommended vNext shape

```ts
extensions: {
  physics: {
    bodyType: 'dynamic',
    colliders: [
      { shape: 'box', hw: 10, hh: 14, friction: 0.2 },
      { shape: 'ball', radius: 4, isSensor: true },
    ],
  },
}
```

### Legacy mono-collider shape (still supported)

```ts
extensions: {
  physics: {
    bodyType: 'dynamic',
    hw: 10,
    hh: 14,
  },
}
```

Legacy top-level collider props are adapted automatically in dev mode with a deprecation warning.

## Bridge contract

### Versioning

- TS constant: `PHYSICS2D_BRIDGE_SCHEMA_VERSION`
- WASM export: `bridge_schema_version()`
- On mismatch, plugin initialization throws an actionable error asking for a WASM rebuild.

### Hot-path constraints

- No JSON serialization on the collision-event hot path.
- The `events` channel is consumed from the channel `ArrayBuffer` via typed views.
- Repeated reads in the same frame use the cached decoded batch instead of re-draining the ring buffer.

## Useful types

### `RigidBodyType`

```ts
type RigidBodyType = 'fixed' | 'dynamic' | 'kinematic';
```

### `ColliderOptions`

```ts
interface ColliderOptions {
  restitution?: number;
  friction?: number;
  isSensor?: boolean;
  density?: number;
}
```

### `CollisionContact` (enriched)

Type used by `physics:collision` hook:

```ts
interface CollisionContact {
  entityA: EntityId;
  entityB: EntityId;
  slotA: number;
  slotB: number;
  started: boolean;
}
```
