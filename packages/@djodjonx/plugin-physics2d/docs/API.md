# API Reference

## `new Physics2D(config)`

```ts
import { Physics2D } from '@djodjonx/gwen-plugin-physics2d';

export default defineConfig({
  plugins: [
    new Physics2D({
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

`physics2D(config)` remains available for compatibility but is deprecated.

### `Physics2DConfig`

- `gravity?: number` - gravity Y in m/s². Default `-9.81`.
- `gravityX?: number` - gravity X in m/s². Default `0`.
- `maxEntities?: number` - max ECS slots. Default `10_000`.
- `qualityPreset?: 'low' | 'medium' | 'high' | 'esport'` - solver/CCD quality preset. Default `"medium"`.
- `eventMode?: 'pull' | 'hybrid'` - `pull` is the first-class path. `hybrid` also dispatches convenience hooks during `onUpdate`. Default `"pull"`.
- `compat?: { legacyPrefabColliderProps?: boolean; legacyCollisionJsonParser?: boolean }` - transitional compatibility flags. Both default to `true`.
- `debug?: boolean` - enable debug logs. Default `false`.
- `ccdEnabled?: boolean` - global CCD fallback for bodies without local override. If omitted, derived from quality preset (`high`/`esport` => enabled).

#### Quality preset matrix (Sprint 7)

| Preset | Solver iterations | CCD substeps | Typical usage |
| --- | ---: | ---: | --- |
| `low` | `2` | `1` | mobile/CPU budget strict |
| `medium` | `4` | `1` | default balanced profile |
| `high` | `8` | `2` | precision-heavy gameplay |
| `esport` | `10` | `4` | maximum stability / competitive tuning |

Trade-off rule: higher presets reduce instability/tunneling risk, but increase CPU cost.

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
  - `ccdEnabled?: boolean` (per-body override)
  - `additionalSolverIterations?: number` (per-body local boost, clamped by Rust)

Returns: `bodyHandle: number`.

CCD precedence rule:

1. `addRigidBody(..., { ccdEnabled })` / `extensions.physics.ccdEnabled`
2. global `new Physics2D({ ccdEnabled })`
3. derived default from `qualityPreset`

Solver-iterations rule:

- `additionalSolverIterations` is a local additive boost for one body only.
- Guardrail: Rust clamps this value to `16` max to avoid abusive per-body costs.

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

### `loadTilemapPhysicsChunk(chunk, x, y, opts?)`

Loads or replaces one baked tilemap chunk.

- `chunk: TilemapPhysicsChunk`
- `x, y: number` - world origin of the chunk body in meters
- `opts?: { debugNaive?: boolean }`
  - `debugNaive: true` forces one collider per baked rect instead of trusting `chunk.colliders[]`

### `unloadTilemapPhysicsChunk(key)`

Removes one loaded tilemap chunk by stable key.

### `patchTilemapPhysicsChunk(chunk, x, y, opts?)`

Replaces one previously loaded chunk with a freshly patched bake.

## Prefab extension `extensions.physics`

### Recommended vNext shape

```ts
extensions: {
  physics: {
    bodyType: 'dynamic',
    ccdEnabled: true,
    additionalSolverIterations: 4,
    material: 'default',
    colliders: [
      { shape: 'box', hw: 10, hh: 14, material: 'ice' },
      { shape: 'ball', radius: 4, isSensor: true, material: 'rubber' },
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
  membershipLayers?: string[] | number;
  filterLayers?: string[] | number;
  colliderId?: number;
  offsetX?: number;
  offsetY?: number;
}
```

### `PhysicsMaterialPresetName`

```ts
type PhysicsMaterialPresetName = 'default' | 'ice' | 'rubber';
```

### `PHYSICS_MATERIAL_PRESETS`

```ts
const PHYSICS_MATERIAL_PRESETS = {
  default: { friction: 0.5, restitution: 0, density: 1.0 },
  ice: { friction: 0.02, restitution: 0, density: 1.0 },
  rubber: { friction: 1.2, restitution: 0.85, density: 1.0 },
};
```

### `TilemapPhysicsChunk`

```ts
interface TilemapPhysicsChunk {
  key: string;
  chunkX: number;
  chunkY: number;
  checksum: string;
  rects: ReadonlyArray<{ x: number; y: number; w: number; h: number }>;
  colliders: ReadonlyArray<PhysicsColliderDef>;
}
```

See also: `./TILEMAP.md`
