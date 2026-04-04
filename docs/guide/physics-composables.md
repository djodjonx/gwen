# Physics 2D Composables

GWEN's `@gwenjs/physics2d` package provides high-level composables that replace manual rigid body setup. Call them inside a `defineActor()` factory to bind physics bodies and colliders to entities automatically.

## Quick start

```typescript
import { defineActor } from '@gwenjs/core';
import { useDynamicBody, useBoxCollider, defineLayers, onContact } from '@gwenjs/physics2d';

export const Layers = defineLayers({
  player: 1 << 0,
  enemy: 1 << 1,
  wall: 1 << 2,
});

const PlayerActor = defineActor(PlayerPrefab, () => {
  const body = useDynamicBody({ fixedRotation: true, gravityScale: 2.5 });
  useBoxCollider({ w: 20, h: 32, layer: Layers.player, mask: Layers.wall });

  onContact((e) => {
    if (e.relativeVelocity > 200) emit('player:hard-landing');
  });

  onUpdate(() => {
    if (input.pressed('jump')) body.applyImpulse(0, 400);
  });
});
```

## `useStaticBody(options?)`

Registers the entity as a static (non-moving) physics body. Use this for walls, platforms, and any geometry that never moves.

**Options:**

| Option     | Type              | Default     | Description                         |
| ---------- | ----------------- | ----------- | ----------------------------------- |
| `shape`    | `'box' \| 'ball'` | `'box'`     | Collider shape                      |
| `layer`    | `number`          | `undefined` | Collision membership layer bitmask  |
| `mask`     | `number`          | `undefined` | Collision filter mask bitmask       |
| `isSensor` | `boolean`         | `false`     | Trigger-only — no physical response |

**Returns:** `StaticBodyHandle`

```typescript
interface StaticBodyHandle {
  readonly bodyId: number;
  readonly active: boolean;
  enable(): void;
  disable(): void;
}
```

**Example:**

```typescript
const WallActor = defineActor(WallPrefab, () => {
  useStaticBody({ layer: Layers.wall, mask: Layers.player | Layers.enemy });
});
```

## `useDynamicBody(options?)`

Registers a fully-simulated physics body affected by gravity and forces. Ideal for players, enemies, and projectiles.

**Options:**

| Option           | Type              | Default     | Description                  |
| ---------------- | ----------------- | ----------- | ---------------------------- |
| `shape`          | `'box' \| 'ball'` | `'box'`     | Collider shape               |
| `mass`           | `number`          | `1`         | Mass in kg                   |
| `linearDamping`  | `number`          | `0`         | Air resistance (linear)      |
| `angularDamping` | `number`          | `0`         | Rotational damping           |
| `fixedRotation`  | `boolean`         | `false`     | Prevent rotation             |
| `gravityScale`   | `number`          | `1`         | Gravity multiplier           |
| `layer`          | `number`          | `undefined` | Collision membership bitmask |
| `mask`           | `number`          | `undefined` | Collision filter bitmask     |

**Returns:** `DynamicBodyHandle`

```typescript
interface DynamicBodyHandle {
  readonly bodyId: number;
  readonly active: boolean;
  readonly velocity: { x: number; y: number };
  applyForce(fx: number, fy: number): void;
  applyImpulse(ix: number, iy: number): void;
  setVelocity(vx: number, vy: number): void;
  enable(): void;
  disable(): void;
}
```

::: info Note on `applyForce`
`Physics2DAPI` does not expose a direct `applyForce` method. Use `applyImpulse` for instantaneous velocity changes, or `setVelocity` for direct velocity control.
:::

## `useBoxCollider(options)`

Attaches an axis-aligned box collider to the current actor entity.

**Options:**

| Option     | Type      | Default     | Description                                     |
| ---------- | --------- | ----------- | ----------------------------------------------- |
| `w`        | `number`  | required    | Width in world units                            |
| `h`        | `number`  | required    | Height in world units                           |
| `d`        | `number`  | `undefined` | Depth (ignored in 2D, for 3D structural compat) |
| `offsetX`  | `number`  | `0`         | Local X offset from entity origin               |
| `offsetY`  | `number`  | `0`         | Local Y offset from entity origin               |
| `isSensor` | `boolean` | `false`     | Trigger-only                                    |
| `layer`    | `number`  | `undefined` | Membership bitmask                              |
| `mask`     | `number`  | `undefined` | Filter bitmask                                  |

**Returns:** `BoxColliderHandle`

```typescript
interface BoxColliderHandle {
  readonly colliderId: number;
  readonly isSensor: boolean;
}
```

## `useSphereCollider(options)`

Attaches a circle collider to the current actor. Named `useSphereCollider` for 2D/3D structural compatibility.

**Options:**

| Option     | Type      | Default     | Description                  |
| ---------- | --------- | ----------- | ---------------------------- |
| `radius`   | `number`  | required    | Circle radius in world units |
| `offsetX`  | `number`  | `0`         | Local X offset               |
| `offsetY`  | `number`  | `0`         | Local Y offset               |
| `isSensor` | `boolean` | `false`     | Trigger-only                 |
| `layer`    | `number`  | `undefined` | Membership bitmask           |
| `mask`     | `number`  | `undefined` | Filter bitmask               |

**Returns:** `CircleColliderHandle`

**Example:**

```typescript
const zone = useSphereCollider({ radius: 64, isSensor: true });
onSensorEnter(zone.colliderId, (entityId) => {
  console.log('entered zone:', entityId);
});
```

## `useCapsuleCollider(options)`

Attaches a capsule collider to the current actor. Since `Physics2DAPI` does not expose a native capsule primitive, this uses a box collider as an approximation (`hw = radius`, `hh = height / 2`).

**Options:**

| Option     | Type      | Default     | Description                     |
| ---------- | --------- | ----------- | ------------------------------- |
| `radius`   | `number`  | required    | Capsule radius (box half-width) |
| `height`   | `number`  | required    | Capsule total height            |
| `offsetX`  | `number`  | `0`         | Local X offset                  |
| `offsetY`  | `number`  | `0`         | Local Y offset                  |
| `isSensor` | `boolean` | `false`     | Trigger-only                    |
| `layer`    | `number`  | `undefined` | Membership bitmask              |
| `mask`     | `number`  | `undefined` | Filter bitmask                  |

**Returns:** `CapsuleColliderHandle`

## `defineLayers(definition)`

Declares named physics layers with bitmask values. Layer values are validated at runtime — a warning is emitted if two layers share bits.

The `gwen:physics2d` Vite plugin inlines `Layers.wall` → `4` at build time when the definition is visible in the same file.

```typescript
export const Layers = defineLayers({
  player: 1 << 0, // 1
  enemy: 1 << 1, // 2
  wall: 1 << 2, // 4
  trigger: 1 << 3, // 8
});

useStaticBody({ layer: Layers.wall, mask: Layers.player | Layers.enemy });
```

## `onContact(callback)`

Subscribes to collision contact events for the current actor entity. Events are dispatched once per frame after the physics step.

```typescript
onContact((event) => {
  console.log('collision:', {
    entityA: event.entityA,
    entityB: event.entityB,
    velocity: event.relativeVelocity,
    normal: { x: event.normalX, y: event.normalY },
  });
});
```

**ContactEvent fields:**

| Field              | Type     | Description                  |
| ------------------ | -------- | ---------------------------- |
| `entityA`          | `bigint` | First entity ID              |
| `entityB`          | `bigint` | Second entity ID             |
| `contactX`         | `number` | Contact point X              |
| `contactY`         | `number` | Contact point Y              |
| `normalX`          | `number` | Contact normal X             |
| `normalY`          | `number` | Contact normal Y             |
| `relativeVelocity` | `number` | Relative velocity at contact |

## `onSensorEnter(sensorId, callback)` / `onSensorExit(sensorId, callback)`

Subscribe to sensor overlap events using the `colliderId` returned by a collider composable with `isSensor: true`.

```typescript
const zone = useSphereCollider({ radius: 64, isSensor: true });

onSensorEnter(zone.colliderId, (entityId) => {
  console.log('entity entered zone:', entityId);
});

onSensorExit(zone.colliderId, (entityId) => {
  console.log('entity left zone:', entityId);
});
```
