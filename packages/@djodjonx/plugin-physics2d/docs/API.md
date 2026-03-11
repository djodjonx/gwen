# API Reference

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

### `getCollisionEvents()`

Returns raw `CollisionEvent[]`:

```ts
interface CollisionEvent {
  slotA: number;
  slotB: number;
  started: boolean;
}
```

### `getPosition(entityIndex)`

Returns `{ x, y, rotation } | null` in meters/radians.

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
