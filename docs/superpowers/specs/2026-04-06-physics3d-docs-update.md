# Physics3D Documentation Update Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Document all physics3d features added in the RFC-07/08/09 implementation sprint — spatial query composables, character controller, pathfinding, fixedRotation, quality — in the existing VitePress docs.

**Architecture:** All additions go into the two existing files (`docs/guide/physics3d-composables.md`, `docs/plugins/physics3d.md`). No new pages — the existing structure has room and the user explicitly chose Option A.

**Tech Stack:** Markdown, VitePress.

---

## What's Missing

### `docs/guide/physics3d-composables.md` (738 lines currently)

Missing sections:
1. `useDynamicBody` — `fixedRotation` and `quality` options (tables need updating)
2. `useRaycast` — full composable doc with options table + result type
3. `useShapeCast` — full composable doc with options table + result type
4. `useOverlap` — full composable doc with options table + result type
5. `useJoint` — discriminated union, all 5 joint types, motor, enable/disable
6. **Character Controller** — `addCharacterController`, `CharacterControllerHandle`, move, isGrounded, groundNormal, groundEntity
7. **Pathfinding** — `initNavGrid3D`, `findPath3D`, `PathWaypoint3D`, `pathWaypoints`

### `docs/plugins/physics3d.md` (143 lines currently)

Missing:
- Service API: spatial query methods (`castRay`, `castShape`, `overlapShape`)
- Service API: joint methods (`addJoint`, `removeJoint`, `setJointMotor`, etc.)
- Service API: CC methods (`addCharacterController`, `removeCharacterController`)
- Service API: pathfinding methods (`initNavGrid3D`, `findPath3D`)
- Config: `fixedRotation`, `quality` fields in body options

---

## Section Designs

### `useRaycast`

```markdown
## `useRaycast`

Register a persistent raycast query on the current actor.
The ray is cast once per physics step and the result is available zero-copy
from the pre-allocated SAB slot — no extra WASM crossing per frame.

### Signature
function useRaycast(opts: RaycastOpts): RaycastSlotHandle

### Options (RaycastOpts)
| Option        | Type             | Default | Description                          |
|---------------|------------------|---------|--------------------------------------|
| `origin`      | `Partial<Vec3>`  | —       | Ray origin in world space            |
| `direction`   | `Partial<Vec3>`  | —       | Ray direction (unit vector)          |
| `maxDistance` | `number`         | `100`   | Maximum cast distance in metres      |
| `layer`       | `number`         | —       | Collision layer filter               |
| `mask`        | `number`         | —       | Collision mask filter                |

### Handle (RaycastSlotHandle)
| Member               | Type                    | Description                         |
|----------------------|-------------------------|-------------------------------------|
| `result.hit`         | `boolean`               | Whether the ray hit something       |
| `result.distance`    | `number`                | Hit distance in metres              |
| `result.point`       | `Vec3 \| null`          | World-space hit point               |
| `result.normal`      | `Vec3 \| null`          | Surface normal at hit point         |
| `result.entityId`    | `EntityId \| null`      | Entity that was hit                 |
| `update(opts)`       | `(opts) => void`        | Update ray parameters mid-frame     |
| `dispose()`          | `() => void`            | Release the SAB slot                |

### Example
\`\`\`typescript
export const groundCheckSystem = defineSystem(() => {
  const ray = useRaycast({
    direction: { x: 0, y: -1, z: 0 },
    maxDistance: 1.5,
  });

  onUpdate(() => {
    if (ray.result.hit) {
      console.log('grounded at distance', ray.result.distance);
    }
  });
});
\`\`\`
```

### `useShapeCast`

Same structure as `useRaycast` but with `ShapeCastOpts` (adds `shape` and `rotation` fields), result adds `witness1/2` hit point pair.

### `useOverlap`

Same structure but result is `OverlapSlotResult` with `entities: EntityId[]`.

### `useJoint`

```markdown
## `useJoint`

Connect two physics bodies with a constraint joint.

### Signature
function useJoint(opts: JointOpts3D): JointHandle3D

### Joint types (discriminated union on `type`)

| `type`       | Description                                            |
|--------------|--------------------------------------------------------|
| `'fixed'`    | Zero degrees of freedom — bodies move as one           |
| `'revolute'` | Rotates around a single axis (hinges, wheels)          |
| `'prismatic'`| Slides along a single axis (pistons, elevators)        |
| `'ball'`     | Rotates freely in all directions (ball-and-socket)     |
| `'spring'`   | Elastic connection with stiffness/damping              |

### Motor
Available on `'revolute'` and `'prismatic'` joints:
\`\`\`typescript
joint.setMotor({ targetVelocity: 3.14, maxForce: 100 });
joint.disableMotor();
\`\`\`

### Example — revolute (hinge) door
\`\`\`typescript
const joint = useJoint({
  type: 'revolute',
  bodyA: doorEntityId,
  bodyB: frameEntityId,
  anchorA: { x: -0.5, y: 0, z: 0 },
  anchorB: { x:  0.5, y: 0, z: 0 },
  axis:    { x: 0, y: 1, z: 0 },
  limits:  { min: 0, max: Math.PI / 2 },
});
\`\`\`
```

### Character Controller

```markdown
## Character Controller

High-level kinematic character controller powered by Rapier's built-in CC.
Handles slope limit, step height, snap-to-ground, and collision response.

### addCharacterController(entityId, opts)

| Option                     | Type      | Default | Description                           |
|----------------------------|-----------|---------|---------------------------------------|
| `capsuleRadius`            | `number`  | `0.3`   | Capsule radius in metres              |
| `slopeMaxDeg`              | `number`  | `45`    | Max walkable slope in degrees         |
| `minSkinWidth`             | `number`  | `0.02`  | Minimum gap to maintain from surfaces |
| `stepHeight`               | `number`  | `0.2`   | Max step-up height in metres          |
| `applyImpulsesToDynamic`   | `boolean` | `true`  | Push dynamic bodies on contact        |
| `snapToGround`             | `boolean` | `true`  | Snap character to ground              |

### CharacterControllerHandle

| Member            | Type               | Description                                  |
|-------------------|--------------------|----------------------------------------------|
| `move(vel, dt)`   | `method`           | Apply desired velocity for this frame        |
| `isGrounded`      | `boolean`          | Whether character is on ground (read per SAB)|
| `groundNormal`    | `Vec3 \| null`     | Ground surface normal                        |
| `groundEntity`    | `EntityId \| null` | Entity the character is standing on          |
| `lastTranslation` | `Vec3`             | Actual displacement applied this frame       |
| `remove()`        | `() => void`       | Destroy the character controller             |

### Example
\`\`\`typescript
const cc = physics.addCharacterController(entityId, {
  capsuleRadius: 0.35,
  slopeMaxDeg: 50,
  stepHeight: 0.3,
});

onUpdate((dt) => {
  cc.move({ x: input.x * 5, y: jumpVelocity, z: input.z * 5 }, dt);
  if (cc.isGrounded) jumpVelocity = 0;
  if (cc.groundEntity) { /* standing on a platform */ }
});
\`\`\`
```

### Pathfinding

```markdown
## 3D Pathfinding

Voxel-grid A* pathfinding. Runs in WASM (production) or in a local JS fallback.

### initNavGrid3D(opts)

\`\`\`typescript
physics.initNavGrid3D({
  grid:     new Uint8Array(width * height * depth),  // 0=open, 1=blocked
  width, height, depth,
  cellSize: 1.0,   // world-space metres per cell
  origin:   { x: -50, y: 0, z: -50 },
});
\`\`\`

### findPath3D(from, to)

Returns `PathWaypoint3D[]` — world-space waypoints from `from` to `to`.
Falls back to a direct 2-point path if no route is found.

\`\`\`typescript
const waypoints = physics.findPath3D(
  { x: 0, y: 0, z: 0 },
  { x: 40, y: 0, z: 40 },
);
for (const wp of waypoints) { ... }
\`\`\`
```

---

## useDynamicBody Options Update

The options table must add two rows:

| `fixedRotation` | `boolean` | `false` | Lock all rotation axes (prevents tumbling) |
| `quality`       | `Physics3DQualityPreset` | `undefined` | Per-body solver iterations override |

---

## Composables Overview Table Update

Add these rows to the summary table at the top of `physics3d-composables.md`:

| `useRaycast()`              | Persistent zero-copy ray query (SAB-backed)                 |
| `useShapeCast()`            | Persistent shape-sweep query (SAB-backed)                   |
| `useOverlap()`              | Persistent shape overlap query (SAB-backed)                 |
| `useJoint()`                | Constraint joints between two bodies (5 types + motor)      |
| `addCharacterController()`  | High-level kinematic CC with ground detection               |
| `initNavGrid3D()`           | Upload a voxel navigation grid for pathfinding              |
| `findPath3D()`              | A* path query returning world-space waypoints               |

---

## Non-Goals

- No API reference auto-generation (no tsdoc setup change)
- No new VitePress pages
- No migration guide (all additions are new APIs)
