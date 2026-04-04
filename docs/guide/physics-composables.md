# Physics 2D Composables

**Package:** `@gwenjs/physics2d`

GWEN's `@gwenjs/physics2d` package provides a composable-first API for 2D rigid body physics. Instead of calling the low-level `Physics2DAPI` service directly, you declare physics behaviour inside a `defineActor()` factory — once per actor type, not once per instance. The composables read actor-local context automatically, so there is no entity ID to pass around and no lifecycle boilerplate to write.

---

## Quick Start

The example below shows a complete platformer player: a dynamic body with gravity, a box shape, a jump impulse, and a hard-landing detection handler.

```typescript
import { defineActor, onUpdate } from '@gwenjs/core';
import {
  useShape,
  useDynamicBody,
  defineLayers,
  onContact,
} from '@gwenjs/physics2d';

export const Layers = defineLayers({
  player:  1 << 0, // 1
  enemy:   1 << 1, // 2
  wall:    1 << 2, // 4
  trigger: 1 << 3, // 8
});

export const PlayerActor = defineActor(PlayerPrefab, () => {
  // Declare shape once — read by useDynamicBody AND the sprite renderer
  useShape({ w: 24, h: 40 });

  const body = useDynamicBody({
    gravityScale: 2.5,
    linearDamping: 0.1,
    layer: Layers.player,
    mask: Layers.wall | Layers.enemy,
  });

  onContact((e) => {
    if (e.relativeVelocity > 300) {
      emit('player:hard-landing', { velocity: e.relativeVelocity });
    }
  });

  onUpdate(() => {
    if (input.justPressed('jump')) {
      body.applyImpulse(0, 520);
    }
  });
});
```

---

## Composable Overview

| Composable           | Purpose                                                      | Returns                 |
| -------------------- | ------------------------------------------------------------ | ----------------------- |
| `useShape`           | Set shared shape dimensions (read by physics + renderer)     | `void`                  |
| `useStaticBody`      | Fixed body — walls, platforms, terrain                       | `StaticBodyHandle`      |
| `useDynamicBody`     | Fully simulated body — players, enemies, projectiles         | `DynamicBodyHandle`     |
| `useBoxCollider`     | Standalone box collider (sensor triggers, static overlays)   | `BoxColliderHandle`     |
| `useSphereCollider`  | Standalone circle collider                                   | `CircleColliderHandle`  |
| `useCapsuleCollider` | Standalone capsule collider (box approximation — see note)   | `CapsuleColliderHandle` |
| `defineLayers`       | Named collision layer bitmask definitions                    | layer object            |
| `onContact`          | Per-frame collision event subscription                       | `void`                  |
| `onSensorEnter`      | Sensor zone entry callback                                   | `void`                  |
| `onSensorExit`       | Sensor zone exit callback                                    | `void`                  |

---

## Dimensions: `useShape`

### Why `useShape` exists

When you create a physics body, the engine needs to know the collider dimensions. When you render a sprite, the renderer needs the same dimensions. Without `useShape`, you would specify width and height in two separate places — and keep them in sync manually.

`useShape` writes a `ShapeComponent` onto the current actor entity. Both `useStaticBody` / `useDynamicBody` **and** renderer composables (e.g. `useSprite`) read this component automatically. You specify dimensions once; everything else follows.

::: tip Single source of truth
Always call `useShape()` before your body composable. It makes dimensions one declaration, not two.
:::

### Signature

```typescript
function useShape(options: ShapeOptions): void;
```

### Options

| Option  | Type     | Default | Description                                      |
| ------- | -------- | ------- | ------------------------------------------------ |
| `w`     | `number` | `0`     | Width in world units                             |
| `h`     | `number` | `0`     | Height in world units                            |
| `radius`| `number` | `0`     | Radius in world units (for ball/circle shapes)   |
| `depth` | `number` | `0`     | Depth (ignored in 2D; for 2D/3D structural compat) |

### Example — Ground platform

```typescript
import { defineActor } from '@gwenjs/core';
import { useShape, useStaticBody } from '@gwenjs/physics2d';

export const GroundActor = defineActor(GroundPrefab, () => {
  useShape({ w: 800, h: 32 });   // declares 800×32 to the whole actor
  useStaticBody();                // reads Shape → 400×16 half-extents, no repeat needed
  useSprite({ texture: 'ground' }); // renderer also reads Shape for draw size
});
```

---

## Body Composables

Body composables create a complete rigid body **with a built-in collider** in a single call. They are the primary way to give an actor physical presence.

### `useStaticBody`

Register the current actor as a **fixed, non-moving** rigid body. Static bodies participate in collision detection but are never displaced by forces or gravity. Use them for walls, platforms, the ground, and any solid geometry that never changes position.

#### Signature

```typescript
function useStaticBody(options?: StaticBodyOptions): StaticBodyHandle;
```

#### How dimensions are resolved

`useStaticBody` reads the `ShapeComponent` set by `useShape()`:

- **Box shape** — half-extents are `shape.w / 2` × `shape.h / 2`. Falls back to `0.5 × 0.5` if no `ShapeComponent` is present.
- **Ball shape** — radius is `shape.radius`. Falls back to `0.5` if absent.

#### Options

| Option     | Type              | Default     | Description                                       |
| ---------- | ----------------- | ----------- | ------------------------------------------------- |
| `shape`    | `'box' \| 'ball'` | `'box'`     | Collider primitive. `'ball'` reads `ShapeComponent.radius` |
| `layer`    | `number`          | —           | Collision membership bitmask (what "am I")        |
| `mask`     | `number`          | —           | Collision filter bitmask (what "can I hit")       |
| `isSensor` | `boolean`         | `false`     | Generates events but no physical response         |

#### Handle

```typescript
interface StaticBodyHandle {
  /** Unique body ID assigned by the physics engine. */
  readonly bodyId: number;
  /** Whether the body is currently registered in the simulation. */
  readonly active: boolean;
  /** Re-create the body after a previous `disable()` call. */
  enable(): void;
  /** Remove the body from the simulation entirely (no collision response). */
  disable(): void;
}
```

#### Example — Wall with layer filtering

```typescript
import { defineActor } from '@gwenjs/core';
import { useShape, useStaticBody } from '@gwenjs/physics2d';
import { Layers } from './layers';

export const WallActor = defineActor(WallPrefab, () => {
  useShape({ w: 32, h: 128 });
  useStaticBody({
    layer: Layers.wall,
    mask:  Layers.player | Layers.enemy,
  });
});
```

#### Example — Door that opens and closes

```typescript
export const DoorActor = defineActor(DoorPrefab, () => {
  useShape({ w: 16, h: 96 });
  const body = useStaticBody({ layer: Layers.wall });

  onEvent('door:open',  () => body.disable());
  onEvent('door:close', () => body.enable());
});
```

---

### `useDynamicBody`

Register the current actor as a **fully simulated** rigid body. Dynamic bodies respond to gravity, impulses, and collisions. Use them for the player character, enemies, projectiles, and any object that moves through the world.

#### Signature

```typescript
function useDynamicBody(options?: DynamicBodyOptions): DynamicBodyHandle;
```

#### How dimensions are resolved

`useDynamicBody` also reads `ShapeComponent`:

- **Box shape** — half-extents `shape.w / 2` × `shape.h / 2`. **Falls back to `0.5 × 0.5`** (very small!) if no `ShapeComponent` is present. Always call `useShape()` first for dynamic actors.
- **Ball shape** — radius `0.5` (fixed; does not read `ShapeComponent.radius` for the dynamic path).

#### Options

| Option           | Type              | Default | Description                                            |
| ---------------- | ----------------- | ------- | ------------------------------------------------------ |
| `shape`          | `'box' \| 'ball'` | `'box'` | Collider primitive                                     |
| `mass`           | `number`          | `1`     | Body mass in kg. Values ≤ 0 are clamped internally     |
| `linearDamping`  | `number`          | `0`     | Linear velocity damping ("air resistance")             |
| `angularDamping` | `number`          | `0`     | Rotational velocity damping                            |
| `gravityScale`   | `number`          | `1`     | Gravity multiplier. `0` = weightless, `2` = twice gravity |
| `fixedRotation`  | `boolean`         | `false` | ⚠️ Accepted but **has no effect** — see warning below  |
| `layer`          | `number`          | —       | Collision membership bitmask                           |
| `mask`           | `number`          | —       | Collision filter bitmask                               |

::: warning `fixedRotation` is a no-op
`fixedRotation: true` is accepted without a TypeScript error but `Physics2DAPI` does not yet expose a rotation-lock parameter. The option is silently ignored and a `console.warn` is emitted at spawn time:

```
[gwen:physics2d] fixedRotation is not yet supported by Physics2DAPI.
The option is accepted but has no effect.
```

To prevent visual rotation on a character, lock rotation in your transform update logic or wait for the API to expose this parameter.
:::

#### Handle

```typescript
interface DynamicBodyHandle {
  /** Unique body ID assigned by the physics engine. */
  readonly bodyId: number;
  /** Whether the body is currently registered in the simulation. */
  readonly active: boolean;
  /**
   * Current linear velocity (read-only).
   * Sourced from `Physics2DAPI.getLinearVelocity()` each time it is accessed.
   */
  readonly velocity: { x: number; y: number };
  /**
   * ⚠️ No-op. Physics2DAPI has no applyForce method.
   * Use `applyImpulse` for instantaneous velocity changes.
   */
  applyForce(fx: number, fy: number): void;
  /** Apply an instantaneous impulse in world-space units. */
  applyImpulse(ix: number, iy: number): void;
  /** Apply a torque to the body (optional — may not be supported on all backends). */
  applyTorque?(t: number): void;
  /** Directly set the linear velocity, bypassing the simulation integrator. */
  setVelocity(vx: number, vy: number): void;
  /** Re-create the body after a previous `disable()` call. */
  enable(): void;
  /** Remove the body from the simulation (useful for respawn invincibility). */
  disable(): void;
}
```

::: warning `applyForce` is a no-op
`applyForce(fx, fy)` compiles without error but **does nothing at runtime**. `Physics2DAPI` does not expose a `applyForce` bridge method. Always use `applyImpulse` to change velocity:

```typescript
// ❌ Silently does nothing
body.applyForce(0, 500);

// ✅ Correct — instantaneous velocity change
body.applyImpulse(0, 500);

// ✅ Also correct — hard velocity override
body.setVelocity(body.velocity.x, 8);
```
:::

#### Example — Platformer player with jump

```typescript
import { defineActor, onUpdate } from '@gwenjs/core';
import { useShape, useDynamicBody, onContact } from '@gwenjs/physics2d';
import { Layers } from './layers';

export const PlayerActor = defineActor(PlayerPrefab, () => {
  useShape({ w: 24, h: 40 });

  const body = useDynamicBody({
    gravityScale: 2.5,
    linearDamping: 0.1,
    layer: Layers.player,
    mask:  Layers.wall | Layers.enemy,
  });

  let grounded = false;

  // Detect landing: contact normal pointing upward = ground below player
  onContact((e) => {
    if (e.normalY < -0.7) grounded = true;

    if (e.relativeVelocity > 300) {
      emit('player:hard-landing', { velocity: e.relativeVelocity });
    }
  });

  onUpdate(() => {
    // Clear grounded each frame; contact events re-set it if still on ground
    grounded = false;

    const speed = 180;
    const vx = (input.isHeld('right') ? speed : 0) - (input.isHeld('left') ? speed : 0);
    body.setVelocity(vx, body.velocity.y);

    if (input.justPressed('jump') && grounded) {
      body.applyImpulse(0, 520);
    }
  });
});
```

#### Example — Projectile with custom gravity

```typescript
export const BulletActor = defineActor(BulletPrefab, () => {
  useShape({ w: 8, h: 8 });

  const body = useDynamicBody({
    gravityScale: 0.3,  // slight arc, mostly travels straight
    layer: Layers.bullet,
    mask:  Layers.wall | Layers.enemy,
  });

  // Fire horizontally on spawn
  body.applyImpulse(600, 0);

  onContact(() => {
    emit('bullet:hit');
    despawn();
  });
});
```

---

## Collider Composables

`useBoxCollider`, `useSphereCollider`, and `useCapsuleCollider` each create their **own internal fixed body + collider**. They are useful for standalone sensor zones, secondary hitboxes, and trigger areas that are independent from a body composable.

> **Important:** Do not combine `useDynamicBody` and `useBoxCollider` on the same actor expecting them to share one rigid body. They each create separate independent bodies. For a dynamic actor with a specific shape, use `useDynamicBody({ shape: 'box' })` together with `useShape()` for dimensions.

---

### `useBoxCollider`

Attaches an axis-aligned box collider to the current actor entity. The collider is backed by a `'fixed'` rigid body at the given offset.

#### Signature

```typescript
function useBoxCollider(options: BoxColliderOptions): BoxColliderHandle;
```

#### Options

| Option     | Type      | Default     | Description                                         |
| ---------- | --------- | ----------- | --------------------------------------------------- |
| `w`        | `number`  | **required**| Full width in world units (half-extent = `w / 2`)   |
| `h`        | `number`  | **required**| Full height in world units (half-extent = `h / 2`)  |
| `d`        | `number`  | —           | Depth — ignored in 2D, accepted for 2D/3D structural compat |
| `offsetX`  | `number`  | `0`         | Local X offset of the collider from the entity origin |
| `offsetY`  | `number`  | `0`         | Local Y offset of the collider from the entity origin |
| `isSensor` | `boolean` | `false`     | Generates overlap events but no physical response   |
| `layer`    | `number`  | —           | Collision membership bitmask                        |
| `mask`     | `number`  | —           | Collision filter bitmask                            |

#### Handle

```typescript
interface BoxColliderHandle {
  /** Unique collider ID — pass to `onSensorEnter` / `onSensorExit`. */
  readonly colliderId: number;
  /** Whether this collider was created as a sensor. */
  readonly isSensor: boolean;
}
```

#### Example — Sensor trigger zone

```typescript
import { defineActor } from '@gwenjs/core';
import { useBoxCollider, onSensorEnter } from '@gwenjs/physics2d';
import { Layers } from './layers';

export const CheckpointActor = defineActor(CheckpointPrefab, () => {
  const zone = useBoxCollider({
    w: 64,
    h: 96,
    isSensor: true,
    layer: Layers.trigger,
    mask:  Layers.player,
  });

  onSensorEnter(zone.colliderId, (playerId) => {
    emit('game:checkpoint-reached', { playerId });
  });
});
```

---

### `useSphereCollider`

Attaches a **circle** collider to the current actor entity. The composable is named `useSphereCollider` for 2D/3D structural compatibility — in 2D it behaves as a circle.

#### Signature

```typescript
function useSphereCollider(options: SphereColliderOptions): CircleColliderHandle;
```

#### Options

| Option     | Type      | Default     | Description                          |
| ---------- | --------- | ----------- | ------------------------------------ |
| `radius`   | `number`  | **required**| Circle radius in world units         |
| `offsetX`  | `number`  | `0`         | Local X offset from the entity origin |
| `offsetY`  | `number`  | `0`         | Local Y offset from the entity origin |
| `isSensor` | `boolean` | `false`     | Generates overlap events but no physical response |
| `layer`    | `number`  | —           | Collision membership bitmask         |
| `mask`     | `number`  | —           | Collision filter bitmask             |

#### Handle

```typescript
interface CircleColliderHandle {
  /** Unique collider ID — pass to `onSensorEnter` / `onSensorExit`. */
  readonly colliderId: number;
  /** Whether this collider was created as a sensor. */
  readonly isSensor: boolean;
}
```

#### Example — NPC aggro radius

```typescript
import { defineActor } from '@gwenjs/core';
import { useSphereCollider, onSensorEnter, onSensorExit } from '@gwenjs/physics2d';
import { Layers } from './layers';

export const EnemyActor = defineActor(EnemyPrefab, () => {
  // Solid enemy body
  useShape({ w: 32, h: 48 });
  useStaticBody({ layer: Layers.enemy, mask: Layers.wall });

  // Wider detection radius — sensor only
  const aggroZone = useSphereCollider({
    radius: 120,
    isSensor: true,
    layer: Layers.trigger,
    mask:  Layers.player,
  });

  onSensorEnter(aggroZone.colliderId, (playerId) => {
    emit('enemy:player-spotted', { playerId });
  });

  onSensorExit(aggroZone.colliderId, (playerId) => {
    emit('enemy:player-lost', { playerId });
  });
});
```

---

### `useCapsuleCollider`

Attaches a capsule collider to the current actor entity.

::: info Box approximation
`Physics2DAPI` does not expose a native capsule primitive. `useCapsuleCollider` approximates the capsule using a **box collider** with half-extents derived as `hw = radius`, `hh = height / 2`. For most sensor and trigger uses this is indistinguishable from a true capsule.

For character controllers where accurate rounded edges matter, prefer `useDynamicBody({ shape: 'box' })` with a `useShape()` that matches your sprite, then handle edge-rounding in game logic (e.g. a small downward probe ray for coyote-time).
:::

#### Signature

```typescript
function useCapsuleCollider(options: CapsuleColliderOptions): CapsuleColliderHandle;
```

#### Options

| Option     | Type      | Default     | Description                                          |
| ---------- | --------- | ----------- | ---------------------------------------------------- |
| `radius`   | `number`  | **required**| Capsule radius — used as box `hw` in the approximation |
| `height`   | `number`  | **required**| Total capsule height — box `hh = height / 2`         |
| `offsetX`  | `number`  | `0`         | Local X offset from the entity origin                |
| `offsetY`  | `number`  | `0`         | Local Y offset from the entity origin                |
| `isSensor` | `boolean` | `false`     | Generates overlap events but no physical response    |
| `layer`    | `number`  | —           | Collision membership bitmask                         |
| `mask`     | `number`  | —           | Collision filter bitmask                             |

#### Handle

```typescript
interface CapsuleColliderHandle {
  /** Unique collider ID — pass to `onSensorEnter` / `onSensorExit`. */
  readonly colliderId: number;
  /** Whether this collider was created as a sensor. */
  readonly isSensor: boolean;
}
```

#### Example — Foot sensor for grounded detection

```typescript
export const PlayerActor = defineActor(PlayerPrefab, () => {
  useShape({ w: 24, h: 40 });
  const body = useDynamicBody({ gravityScale: 2.5, layer: Layers.player });

  // Narrow foot sensor just below the player's feet
  const foot = useCapsuleCollider({
    radius: 10,
    height: 4,
    offsetY: -22, // below center of 40px tall body
    isSensor: true,
    layer: Layers.trigger,
    mask:  Layers.wall,
  });

  let grounded = false;
  onSensorEnter(foot.colliderId, () => { grounded = true; });
  onSensorExit(foot.colliderId,  () => { grounded = false; });

  onUpdate(() => {
    if (input.justPressed('jump') && grounded) {
      body.applyImpulse(0, 520);
    }
  });
});
```

---

## Collision Layers

### `defineLayers`

Declares named physics layers with power-of-two bitmask values. Layers drive collision filtering: every collider has a `layer` (what "am I") and a `mask` (what "can I hit"). A collision only occurs when `A.layer & B.mask` and `B.layer & A.mask` are both non-zero.

#### Signature

```typescript
function defineLayers<T extends Record<string, number>>(
  definition: T,
): { [K in keyof T]: number };
```

#### Bitmask rules

- Each value **must be a unique power of two**: `1 << 0`, `1 << 1`, `1 << 2`, …
- Values are validated at runtime. If two layers share any bits, a `console.warn` is emitted:
  ```
  [gwen:physics2d] defineLayers: layers at index 0 and 2 share bits (1 & 3 = 1).
  This may cause unexpected collision filtering.
  ```
- The `gwen:physics2d` Vite plugin **inlines layer values at build time** when the `defineLayers` call is visible in the same file. `Layers.wall` becomes the literal `4` — no runtime object lookup and zero bundle overhead.

#### Example — Full layer definition

```typescript
// src/layers.ts
import { defineLayers } from '@gwenjs/physics2d';

export const Layers = defineLayers({
  player:  1 << 0, //  1 — player character
  enemy:   1 << 1, //  2 — enemy characters
  wall:    1 << 2, //  4 — static world geometry
  trigger: 1 << 3, //  8 — sensor zones (checkpoints, aggro radii)
  bullet:  1 << 4, // 16 — projectiles
});
```

#### Layer/mask filtering patterns

| Actor          | `layer`          | `mask`                             | Notes                                      |
| -------------- | ---------------- | ---------------------------------- | ------------------------------------------ |
| Player         | `Layers.player`  | `Layers.wall \| Layers.enemy`      | Hits walls and enemies; ignores triggers   |
| Enemy          | `Layers.enemy`   | `Layers.wall \| Layers.player`     | Hits walls and player; ignores other enemies |
| Wall / ground  | `Layers.wall`    | `Layers.player \| Layers.enemy \| Layers.bullet` | Collides with anything that can hit it |
| Bullet         | `Layers.bullet`  | `Layers.wall \| Layers.enemy`      | Passes through player; hits walls/enemies  |
| Trigger zone   | `Layers.trigger` | `Layers.player`                    | Sensor only — fires events on player overlap |

```typescript
// Applying layer patterns
useDynamicBody({ layer: Layers.player, mask: Layers.wall | Layers.enemy });

useStaticBody({ layer: Layers.wall, mask: Layers.player | Layers.enemy | Layers.bullet });

useSphereCollider({
  radius: 80,
  isSensor: true,
  layer: Layers.trigger,
  mask:  Layers.player,
});
```

---

## Collision Events

### `onContact`

Subscribes to collision contact events for the current actor entity. Events are dispatched once per frame after the physics step, for every active contact pair involving this entity.

#### Signature

```typescript
function onContact(callback: (contact: ContactEvent) => void): void;
```

#### `ContactEvent` fields

| Field              | Type     | Description                                              |
| ------------------ | -------- | -------------------------------------------------------- |
| `entityA`          | `bigint` | Packed entity ID of the first collision participant      |
| `entityB`          | `bigint` | Packed entity ID of the second collision participant     |
| `contactX`         | `number` | World-space contact point X                              |
| `contactY`         | `number` | World-space contact point Y                              |
| `normalX`          | `number` | Contact normal X — unit vector pointing from B toward A  |
| `normalY`          | `number` | Contact normal Y — unit vector pointing from B toward A  |
| `relativeVelocity` | `number` | Magnitude of relative velocity at the contact point      |

#### Example — Impact sound and damage

```typescript
import { onContact } from '@gwenjs/physics2d';

export const PlayerActor = defineActor(PlayerPrefab, () => {
  useShape({ w: 24, h: 40 });
  useDynamicBody({ gravityScale: 2.5, layer: Layers.player });

  onContact((e) => {
    // Hard landing — normal points up (normalY < 0 means floor is below)
    const isGroundContact = e.normalY < -0.7;

    if (isGroundContact && e.relativeVelocity > 400) {
      emit('player:hard-landing', {
        velocity: e.relativeVelocity,
        x: e.contactX,
        y: e.contactY,
      });
      // Play a heavy thud at impact volume proportional to velocity
      audio.playSfx('land-heavy', {
        volume: Math.min(e.relativeVelocity / 800, 1),
      });
    }

    // Side collision — could be enemy bump
    const isSideContact = Math.abs(e.normalX) > 0.7;
    if (isSideContact && e.relativeVelocity > 150) {
      emit('player:bumped', { entityA: e.entityA, entityB: e.entityB });
    }
  });
});
```

#### Example — Filtering by entity

```typescript
onContact((e) => {
  // Only react to contacts where this entity is the "A" side
  if (e.entityA !== currentEntityId) return;

  // Velocity threshold to ignore micro-contacts
  if (e.relativeVelocity < 50) return;

  emit('entity:collision', { other: e.entityB, velocity: e.relativeVelocity });
});
```

---

### `onSensorEnter` / `onSensorExit`

Subscribe to sensor overlap events by passing the `colliderId` returned from any collider composable with `isSensor: true`.

- `onSensorEnter` fires when an entity **begins** overlapping the sensor.
- `onSensorExit` fires when an entity **stops** overlapping the sensor.

Neither fires on stable "stay" frames — only on the transition edge.

#### Signature

```typescript
function onSensorEnter(sensorId: number, callback: (entityId: bigint) => void): void;
function onSensorExit(sensorId: number, callback: (entityId: bigint) => void): void;
```

#### Parameters

| Parameter  | Type                             | Description                                              |
| ---------- | -------------------------------- | -------------------------------------------------------- |
| `sensorId` | `number`                         | The `colliderId` from a collider composable set to `isSensor: true` |
| `callback` | `(entityId: bigint) => void`     | Receives the packed entity ID of the overlapping entity  |

#### Example — Pickup collectible

```typescript
import { defineActor } from '@gwenjs/core';
import { useSphereCollider, onSensorEnter } from '@gwenjs/physics2d';
import { Layers } from './layers';

export const CoinActor = defineActor(CoinPrefab, () => {
  // Small visual body with a slightly larger pickup area
  useShape({ radius: 8 });
  useStaticBody({ shape: 'ball', layer: Layers.trigger });

  const pickup = useSphereCollider({
    radius: 20,            // larger than the coin sprite for generous pickup
    isSensor: true,
    layer: Layers.trigger,
    mask:  Layers.player,
  });

  onSensorEnter(pickup.colliderId, (playerId) => {
    emit('coin:collected', { playerId });
    despawn(); // remove coin from the world
  });
});
```

#### Example — NPC aggro enter/exit

```typescript
export const GuardActor = defineActor(GuardPrefab, () => {
  useShape({ w: 36, h: 52 });
  useStaticBody({ layer: Layers.enemy, mask: Layers.wall });

  const sight = useSphereCollider({
    radius: 200,
    isSensor: true,
    layer: Layers.trigger,
    mask:  Layers.player,
  });

  onSensorEnter(sight.colliderId, (playerId) => {
    // Start chasing the player
    emit('guard:alert', { guardId: currentEntityId, playerId });
  });

  onSensorExit(sight.colliderId, (playerId) => {
    // Player escaped detection radius — return to patrol
    emit('guard:lost-sight', { guardId: currentEntityId, playerId });
  });
});
```

---

## Common Patterns

### Platform with a static collider (`useShape` pattern)

Use `useShape` as the single source of truth for dimensions. Both the physics collider and the sprite renderer read from it:

```typescript
import { defineActor } from '@gwenjs/core';
import { useShape, useStaticBody } from '@gwenjs/physics2d';
import { Layers } from './layers';

export const PlatformActor = defineActor(PlatformPrefab, () => {
  // Specify dimensions once — physics and renderer both read this
  useShape({ w: 256, h: 24 });

  useStaticBody({
    layer: Layers.wall,
    mask:  Layers.player | Layers.enemy | Layers.bullet,
  });

  // Renderer reads Shape.w / Shape.h — no duplication
  useSprite({ texture: 'platform' });
});
```

---

### Platformer player

Full platformer character: physics body, grounded state via contact normals, horizontal movement, and a jump impulse:

```typescript
import { defineActor, onUpdate } from '@gwenjs/core';
import { useShape, useDynamicBody, onContact } from '@gwenjs/physics2d';
import { Layers } from './layers';

export const PlayerActor = defineActor(PlayerPrefab, () => {
  useShape({ w: 24, h: 40 });

  const body = useDynamicBody({
    gravityScale: 2.5,
    linearDamping: 0.15,
    layer: Layers.player,
    mask:  Layers.wall | Layers.enemy,
  });

  let grounded = false;

  onContact((e) => {
    // A contact normal pointing mostly upward means a floor below the player
    if (e.normalY < -0.6) grounded = true;
  });

  onUpdate(() => {
    // Reset grounded at the start of each frame; contacts re-set it immediately
    grounded = false;

    const moveSpeed = 200;
    let vx = 0;
    if (input.isHeld('left'))  vx = -moveSpeed;
    if (input.isHeld('right')) vx =  moveSpeed;
    body.setVelocity(vx, body.velocity.y);

    if (input.justPressed('jump') && grounded) {
      body.applyImpulse(0, 580);
    }
  });
});
```

---

### Sensor zone (pickup / trigger area)

A circle sensor zone that fires an event when the player enters, then removes itself:

```typescript
import { defineActor } from '@gwenjs/core';
import { useShape, useStaticBody, useSphereCollider, onSensorEnter } from '@gwenjs/physics2d';
import { Layers } from './layers';

export const HealthPackActor = defineActor(HealthPackPrefab, () => {
  useShape({ radius: 12 });
  useStaticBody({ shape: 'ball', layer: Layers.trigger });

  const area = useSphereCollider({
    radius: 24,              // generous pickup radius
    isSensor: true,
    layer: Layers.trigger,
    mask:  Layers.player,
  });

  onSensorEnter(area.colliderId, (playerId) => {
    emit('player:heal', { playerId, amount: 25 });
    despawn();
  });
});
```

---

### Dynamic enable / disable (respawn invincibility)

Use `body.disable()` to remove the physics presence during invincibility frames, then `body.enable()` to restore it on respawn:

```typescript
import { defineActor, onUpdate } from '@gwenjs/core';
import { useShape, useDynamicBody } from '@gwenjs/physics2d';
import { Layers } from './layers';

export const PlayerActor = defineActor(PlayerPrefab, () => {
  useShape({ w: 24, h: 40 });

  const body = useDynamicBody({
    gravityScale: 2.5,
    layer: Layers.player,
    mask:  Layers.wall | Layers.enemy,
  });

  let invincible = false;

  onEvent('player:respawn', () => {
    // Snap to spawn point and re-enable physics
    transform.setPosition(SPAWN_X, SPAWN_Y);
    body.enable();
    invincible = false;
  });

  onEvent('player:died', () => {
    // Remove the body so no collision occurs during death animation
    body.disable();
    invincible = true;

    // Respawn after 2 seconds
    scheduleOnce(2000, () => emit('player:respawn'));
  });

  onUpdate(() => {
    if (invincible) return; // skip movement while dead
    // … normal movement logic
  });
});
