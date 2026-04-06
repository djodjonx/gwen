# Physics3D VitePress Documentation Update Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update VitePress documentation to cover all composables and Service API methods added in RFC-07/08/09: `useRaycast`, `useShapeCast`, `useOverlap`, `useJoint` (all 5 types + motor), Character Controller, `findPath3D`/`initNavGrid3D`, and the `fixedRotation`/`quality` options on `useDynamicBody`.

**Architecture:** Two existing files are updated in-place — `docs/guide/physics3d-composables.md` (composable reference) and `docs/plugins/physics3d.md` (service API overview). No new files created. No build step — VitePress reads markdown directly.

**Tech Stack:** VitePress-flavoured Markdown.

---

## File Map

| File | Change |
|------|--------|
| `docs/guide/physics3d-composables.md` | Append 8 new sections (fixedRotation, useRaycast, useShapeCast, useOverlap, useJoint, CC, pathfinding), update overview table |
| `docs/plugins/physics3d.md` | Add Service API rows for spatial queries, joints, CC, pathfinding; fix shape list |

---

## Task 1: Update `useDynamicBody` options in composables guide

**Files:**
- Modify: `docs/guide/physics3d-composables.md`

Find the `useDynamicBody` options table. It currently ends with something like `linearDamping` / `angularDamping`. Add two rows:

- [ ] **Step 1: Locate the section**

Search the file for `useDynamicBody` options table. The table header looks like:
```
| Option | Type | Default | Description |
```

- [ ] **Step 2: Add `fixedRotation` and `quality` rows**

After the last row of the `useDynamicBody` options table, add:

```markdown
| `fixedRotation`  | `boolean`                                      | `false`     | Lock all rotational degrees of freedom (ideal for upright characters). |
| `quality`        | `'low' \| 'medium' \| 'high' \| 'esport'`     | `'medium'`  | Per-body solver iteration budget override. Overrides the plugin-level `qualityPreset`. |
```

- [ ] **Step 3: Verify with grep**

```bash
grep -n "fixedRotation\|quality" docs/guide/physics3d-composables.md
```
Expected: at least 2 matches showing both new options.

---

## Task 2: Update the overview table

**Files:**
- Modify: `docs/guide/physics3d-composables.md`

The current overview table ends at `onSensorExit`. Add entries for all RFC-07/08/09 composables.

- [ ] **Step 1: Add rows to the overview table**

Find the line:
```markdown
| `onSensorExit()`       | Sensor zone exit callbacks                     |
```

Add after it:
```markdown
| `useRaycast()`               | Zero-copy SAB raycast slot (result read from SharedArrayBuffer each frame) |
| `useShapeCast()`             | Zero-copy SAB shape-cast slot                                              |
| `useOverlap()`               | Zero-copy SAB overlap slot (max 16 overlapping entities per query)         |
| `useJoint()`                 | Impulse joint between two entities (fixed/revolute/prismatic/ball/spring)  |
| `useCharacterController()`   | Kinematic character controller with ground detection and slope limiting    |
| `initNavGrid3D()`            | Initialise a 3D A\* navigation grid from world bounds                      |
| `findPath3D()`               | Find a path between two world-space points using A\*                       |
```

- [ ] **Step 2: Verify table**

```bash
grep -c "useRaycast\|useShapeCast\|useOverlap\|useJoint\|useCharacterController\|initNavGrid3D\|findPath3D" docs/guide/physics3d-composables.md
```
Expected: ≥ 7

---

## Task 3: Add `useRaycast` section

**Files:**
- Modify: `docs/guide/physics3d-composables.md`

Insert after the `onSensorExit` section (before any trailing `## Related` section or end of file):

- [ ] **Step 1: Append `useRaycast` section**

```markdown
---

## `useRaycast`

Register a **zero-copy SAB raycast slot** for the current actor. The slot is evaluated during `physics3d_step`; results are available at the start of the next `onUpdate` via the `result` reactive object — no WASM call in the hot path.

> **Performance:** Use `useRaycast` instead of `physics.castRay()` inside `onUpdate`. Imperative calls cross the WASM boundary once per call per frame; SAB slots are filled in batch during the physics step.

### Signature

```typescript
function useRaycast(options: RaycastOptions3D): RaycastHandle3D;
```

### `RaycastOptions3D`

| Option        | Type               | Default     | Description                                              |
| ------------- | ------------------ | ----------- | -------------------------------------------------------- |
| `origin`      | `Vec3 \| () => Vec3` | required  | World-space ray origin. Pass a getter for dynamic origin. |
| `direction`   | `Vec3 \| () => Vec3` | required  | Ray direction (need not be normalised).                  |
| `maxDistance` | `number`           | `100`       | Maximum ray distance (metres).                           |
| `layer`       | `number`           | `0xFFFFFFFF`| Layer bitmask to include.                                |
| `mask`        | `number`           | `0xFFFFFFFF`| Collision mask.                                          |
| `solid`       | `boolean`          | `true`      | Whether the ray starts inside a collider counts as a hit.|

### `RaycastHandle3D`

| Property           | Type      | Description                                       |
| ------------------ | --------- | ------------------------------------------------- |
| `result.hit`       | `boolean` | True if the ray hit something this frame.         |
| `result.entityId`  | `number`  | Entity index of the hit body (`-1` if no hit).    |
| `result.distance`  | `number`  | Distance to the hit point (metres).               |
| `result.normalX/Y/Z` | `number` | Hit surface normal in world space.               |
| `result.pointX/Y/Z`  | `number` | World-space hit point.                           |
| `unregister()`     | `() => void` | Release the SAB slot. Called automatically on actor destroy. |

### Example

```typescript
export const EnemyAI = defineSystem(() => {
  const ray = useRaycast({
    origin: () => transform.position,
    direction: { x: 0, y: -1, z: 0 },
    maxDistance: 2,
    layer: Layers.ground,
  });

  onUpdate(() => {
    if (ray.result.hit) {
      // character is within 2m of the ground
    }
  });
});
```
```

- [ ] **Step 2: Verify**

```bash
grep -n "useRaycast\|RaycastHandle3D\|RaycastOptions3D" docs/guide/physics3d-composables.md | head -20
```
Expected: ≥ 10 matches.

---

## Task 4: Add `useShapeCast` section

**Files:**
- Modify: `docs/guide/physics3d-composables.md`

- [ ] **Step 1: Append `useShapeCast` section**

```markdown
---

## `useShapeCast`

Register a **zero-copy SAB shape-cast slot**. A shape-cast sweeps a convex shape along a direction and reports the first hit, including time-of-impact (TOI) and contact normal.

### Signature

```typescript
function useShapeCast(options: ShapeCastOptions3D): ShapeCastHandle3D;
```

### `ShapeCastOptions3D`

| Option        | Type                                              | Default     | Description                                      |
| ------------- | ------------------------------------------------- | ----------- | ------------------------------------------------ |
| `origin`      | `Vec3 \| () => Vec3`                              | required    | Shape-cast start position.                       |
| `rotation`    | `Quat \| () => Quat`                              | identity    | Shape orientation.                               |
| `direction`   | `Vec3 \| () => Vec3`                              | required    | Cast direction vector.                           |
| `shape`       | `ShapeDescriptor3D`                               | required    | Shape to cast (box, sphere, or capsule).         |
| `maxDistance` | `number`                                          | `50`        | Maximum sweep distance (metres).                 |
| `layer`       | `number`                                          | `0xFFFFFFFF`| Layer bitmask.                                   |
| `mask`        | `number`                                          | `0xFFFFFFFF`| Collision mask.                                  |

### `ShapeDescriptor3D`

```typescript
{ type: 'box';    halfExtents: { x: number; y: number; z: number } }
{ type: 'sphere'; radius: number }
{ type: 'capsule'; halfHeight: number; radius: number }
```

### `ShapeCastHandle3D`

| Property              | Type      | Description                                          |
| --------------------- | --------- | ---------------------------------------------------- |
| `result.hit`          | `boolean` | True if the swept shape hit something.               |
| `result.entityId`     | `number`  | Hit entity index.                                    |
| `result.toi`          | `number`  | Time-of-impact (0 = at origin, 1 = at maxDistance).  |
| `result.normalX/Y/Z`  | `number`  | Contact normal at TOI.                               |
| `result.witnessPt*`   | `number`  | Witness point on hit collider surface (x/y/z).       |
| `unregister()`        | `() => void` | Release the SAB slot.                             |

### Example

```typescript
const sweep = useShapeCast({
  origin: () => transform.position,
  direction: { x: 0, y: -1, z: 0 },
  shape: { type: 'capsule', halfHeight: 0.8, radius: 0.3 },
  maxDistance: 0.2,
});

onUpdate(() => {
  const isGrounded = sweep.result.hit && sweep.result.toi < 0.15;
});
```
```

---

## Task 5: Add `useOverlap` section

**Files:**
- Modify: `docs/guide/physics3d-composables.md`

- [ ] **Step 1: Append `useOverlap` section**

```markdown
---

## `useOverlap`

Register a **zero-copy SAB overlap slot** that reports all colliders intersecting a query shape in a given frame. Returns up to `maxResults` entity indices.

### Signature

```typescript
function useOverlap(options: OverlapOptions3D): OverlapHandle3D;
```

### `OverlapOptions3D`

| Option        | Type                 | Default     | Description                                     |
| ------------- | -------------------- | ----------- | ----------------------------------------------- |
| `origin`      | `Vec3 \| () => Vec3` | required    | Query shape centre.                             |
| `rotation`    | `Quat \| () => Quat` | identity    | Shape orientation.                              |
| `shape`       | `ShapeDescriptor3D`  | required    | Query shape (box, sphere, or capsule).          |
| `layer`       | `number`             | `0xFFFFFFFF`| Layer bitmask.                                  |
| `mask`        | `number`             | `0xFFFFFFFF`| Collision mask.                                 |
| `maxResults`  | `number`             | `16`        | Maximum overlapping entities to report.         |

### `OverlapHandle3D`

| Property           | Type       | Description                                          |
| ------------------ | ---------- | ---------------------------------------------------- |
| `result.count`     | `number`   | Number of overlapping entities this frame.           |
| `result.entities`  | `Int32Array`| Entity indices (first `count` entries are valid).   |
| `unregister()`     | `() => void` | Release the SAB slot.                             |

### Example — Area-of-effect

```typescript
const aoe = useOverlap({
  origin: () => transform.position,
  shape: { type: 'sphere', radius: 5 },
  layer: Layers.enemy,
  maxResults: 32,
});

onUpdate(() => {
  for (let i = 0; i < aoe.result.count; i++) {
    const enemyId = aoe.result.entities[i]!;
    health.damage(enemyId, 10 * dt);
  }
});
```
```

---

## Task 6: Add `useJoint` section

**Files:**
- Modify: `docs/guide/physics3d-composables.md`

- [ ] **Step 1: Append `useJoint` section**

```markdown
---

## `useJoint`

Attach an **impulse joint** between two physics entities. The joint is automatically removed when the actor is destroyed.

### Signature

```typescript
function useJoint(type: JointType3D, options: JointOptions3D): JointHandle3D;
```

### `JointType3D`

`'fixed' | 'revolute' | 'prismatic' | 'ball' | 'spring'`

### `JointOptions3D`

| Option          | Type             | Default     | Description                                                                 |
| --------------- | ---------------- | ----------- | --------------------------------------------------------------------------- |
| `entityA`       | `number`         | required    | First body entity index.                                                    |
| `entityB`       | `number`         | required    | Second body entity index.                                                   |
| `anchorA`       | `Vec3`           | `{0,0,0}`   | Anchor position on body A in body-local space.                              |
| `anchorB`       | `Vec3`           | `{0,0,0}`   | Anchor position on body B in body-local space.                              |
| `axisA`         | `Vec3`           | `{0,1,0}`   | Joint axis in body A's local space (revolute/prismatic).                    |
| `axisB`         | `Vec3`           | `{0,1,0}`   | Joint axis in body B's local space (revolute/prismatic).                    |
| `useLimits`     | `boolean`        | `false`     | Enable angular/linear limits (revolute/prismatic only).                     |
| `limitMin`      | `number`         | `0`         | Minimum angle (rad) or displacement (metres).                               |
| `limitMax`      | `number`         | `0`         | Maximum angle (rad) or displacement (metres).                               |
| `restLength`    | `number`         | `1`         | Natural length at rest (spring only).                                       |
| `stiffness`     | `number`         | `100`       | Spring stiffness coefficient (spring only).                                 |
| `damping`       | `number`         | `10`        | Spring damping coefficient (spring only).                                   |

### `JointHandle3D`

| Method / Property              | Description                                                         |
| ------------------------------ | ------------------------------------------------------------------- |
| `id`                           | Internal joint ID (use with Service API motor methods).             |
| `setEnabled(enabled)`          | Enable/disable the joint at runtime.                                |
| `setMotorVelocity(vel, force)` | Set motor target velocity (revolute/prismatic). `force` = max force.|
| `setMotorPosition(target, k, d)`| Set motor target position with PD gains.                           |
| `remove()`                     | Destroy the joint early (also called on actor destroy).             |

### Examples

**Fixed joint — weld two bodies:**

```typescript
const joint = useJoint('fixed', { entityA: bodyA, entityB: bodyB });
```

**Revolute joint with motor (door hinge):**

```typescript
const hinge = useJoint('revolute', {
  entityA: doorFrame,
  entityB: door,
  axisA: { x: 0, y: 1, z: 0 },
  axisB: { x: 0, y: 1, z: 0 },
  useLimits: true,
  limitMin: 0,
  limitMax: Math.PI * 0.75,
});

// Open the door when triggered
hinge.setMotorVelocity(2, 50);
```

**Spring joint:**

```typescript
useJoint('spring', {
  entityA: anchor,
  entityB: bob,
  restLength: 3,
  stiffness: 80,
  damping: 5,
});
```
```

---

## Task 7: Add Character Controller section

**Files:**
- Modify: `docs/guide/physics3d-composables.md`

- [ ] **Step 1: Append `useCharacterController` section**

```markdown
---

## `useCharacterController`

Attach a **kinematic character controller** to a capsule-collider body. The controller resolves collisions via Rapier's `KinematicCharacterController`, handles step climbing and slope limits, and writes results into a `SharedArrayBuffer` slot.

### Signature

```typescript
function useCharacterController(options?: CCOptions3D): CCHandle3D;
```

### `CCOptions3D`

| Option              | Type      | Default  | Description                                                                       |
| ------------------- | --------- | -------- | --------------------------------------------------------------------------------- |
| `stepHeight`        | `number`  | `0.3`    | Maximum stair step height the CC will climb (metres).                             |
| `slopeLimit`        | `number`  | `0.785`  | Maximum walkable slope angle (radians). Default ≈ 45°.                           |
| `skinWidth`         | `number`  | `0.01`   | Collision skin width (metres). Prevents jitter.                                   |
| `snapToGround`      | `boolean` | `true`   | Snap the character to the ground if within `stepHeight`.                          |
| `slideOnSlopes`     | `boolean` | `true`   | Slide along surfaces instead of stopping.                                         |
| `applyImpulses`     | `boolean` | `true`   | Push dynamic bodies the character walks into.                                     |

### `CCHandle3D`

| Property / Method                | Type       | Description                                             |
| -------------------------------- | ---------- | ------------------------------------------------------- |
| `move(dx, dy, dz, dt)`           | `void`     | Submit a desired displacement this frame (metres).      |
| `isGrounded`                     | `boolean`  | True if the CC was on the ground after the last move.   |
| `groundNormalX/Y/Z`              | `number`   | World-space normal of the surface under the character.  |
| `groundEntity`                   | `number`   | Entity index of the ground body (`-1` if airborne).     |
| `remove()`                       | `void`     | Destroy the CC slot. Called automatically on actor destroy. |

### Example — Grounded character movement

```typescript
export const PlayerMovement = defineSystem(() => {
  const input = useInput();
  const cc = useCharacterController({ stepHeight: 0.4, slopeLimit: Math.PI / 4 });

  onUpdate((dt) => {
    const moveX = input.axis('horizontal') * 5;
    const moveZ = input.axis('vertical') * 5;
    const gravity = cc.isGrounded ? 0 : -9.81 * dt;

    cc.move(moveX * dt, gravity, moveZ * dt, dt);
  });
});
```

> **SAB:** CC results are written to `Float32Array` slots in a `SharedArrayBuffer` during `physics3d_step`. Reading `cc.isGrounded` is a plain SAB read — no WASM call.
```

---

## Task 8: Add Pathfinding section

**Files:**
- Modify: `docs/guide/physics3d-composables.md`

- [ ] **Step 1: Append pathfinding section**

```markdown
---

## Pathfinding — `initNavGrid3D` / `findPath3D`

GWEN ships a lightweight grid-based **A\* pathfinder** for 3D navigation. It is best suited for tile-like environments. For large open worlds, consider a NavMesh (not yet available in public API).

### `initNavGrid3D`

Initialise the navigation grid from world bounds and per-cell walkability data.

```typescript
function initNavGrid3D(options: NavGridOptions3D): void;
```

#### `NavGridOptions3D`

| Option      | Type          | Default | Description                                        |
| ----------- | ------------- | ------- | -------------------------------------------------- |
| `minX`      | `number`      | required | World-space minimum X extent.                     |
| `minZ`      | `number`      | required | World-space minimum Z extent.                     |
| `maxX`      | `number`      | required | World-space maximum X extent.                     |
| `maxZ`      | `number`      | required | World-space maximum Z extent.                     |
| `cellSize`  | `number`      | `1`     | Grid cell size (metres).                           |
| `walkable`  | `(x: number, z: number) => boolean` | `() => true` | Returns false for blocked cells. |

#### Example — Build from tile map

```typescript
import { initNavGrid3D } from '@gwenjs/physics3d';

initNavGrid3D({
  minX: 0, minZ: 0, maxX: 30, maxZ: 30,
  cellSize: 1,
  walkable: (x, z) => !tileMap.isWall(x, z),
});
```

---

### `findPath3D`

Find a path between two world-space points using A\*.

```typescript
function findPath3D(
  from: Vec3,
  to: Vec3,
  options?: PathfindOptions3D,
): Vec3[] | null;
```

Returns an array of world-space waypoints from `from` to `to`, or `null` if no path exists.

#### `PathfindOptions3D`

| Option       | Type     | Default  | Description                                                   |
| ------------ | -------- | -------- | ------------------------------------------------------------- |
| `maxNodes`   | `number` | `512`    | Maximum A\* nodes to expand (budget cap).                    |
| `allowDiagonal` | `boolean` | `true` | Whether diagonal grid moves are allowed.                    |

#### Example — Enemy follow player

```typescript
const path = findPath3D(enemy.position, player.position);
if (path && path.length > 1) {
  const next = path[1]!;
  const dx = next.x - enemy.position.x;
  const dz = next.z - enemy.position.z;
  cc.move(dx * speed * dt, 0, dz * speed * dt, dt);
}
```

> **Complexity:** O(n log n) with the built-in binary min-heap. On a 30×30 grid (~900 cells) a worst-case path completes in < 2ms.
```

---

## Task 9: Update `docs/plugins/physics3d.md` Service API table

**Files:**
- Modify: `docs/plugins/physics3d.md`

The existing Service API table only lists body creation methods. Expand it to include all RFC-07/08/09 additions.

- [ ] **Step 1: Extend the Rigid bodies table**

Find the table that starts:
```markdown
| Method                                        | Description
```

After the last row (`applyForce`, `setGravityScale`), add:

```markdown
| `physics3d.addForce(entityId, fx, fy, fz)`               | Add a continuous force (Newtons) this frame.       |
| `physics3d.addTorque(entityId, tx, ty, tz)`               | Apply torque (N·m).                                |
| `physics3d.addForceAtPoint(entityId, f, p)`               | Apply force at a world-space point.                |
| `physics3d.getGravityScale(entityId)`                     | Returns current gravity multiplier.                |
| `physics3d.lockTranslations(entityId, x, y, z)`           | Lock translation axes (boolean each).              |
| `physics3d.lockRotations(entityId, x, y, z)`              | Lock rotation axes (boolean each).                 |
| `physics3d.setBodySleeping(entityId, sleeping)`           | Force-sleep or wake a body.                        |
| `physics3d.isBodySleeping(entityId)`                      | Returns `true` if the body is sleeping.            |
| `physics3d.wakeAll()`                                     | Wake all sleeping bodies in the world.             |
```

- [ ] **Step 2: Add Joints table**

After the Rigid bodies table, add:

```markdown
### Joints

| Method                                                        | Description                                            |
| ------------------------------------------------------------- | ------------------------------------------------------ |
| `physics3d.addFixedJoint(slotA, slotB, ...anchors)`           | Weld two bodies together.                              |
| `physics3d.addRevoluteJoint(slotA, slotB, ...opts)`           | Hinge joint with optional limits.                     |
| `physics3d.addPrismaticJoint(slotA, slotB, ...opts)`          | Slide joint along an axis.                            |
| `physics3d.addBallJoint(slotA, slotB, anchorA, anchorB)`      | Ball-and-socket joint.                                |
| `physics3d.addSpringJoint(slotA, slotB, rest, k, d)`          | Spring connecting two bodies.                         |
| `physics3d.removeJoint(jointId)`                              | Destroy a joint by ID.                                |
| `physics3d.setJointMotorVelocity(jointId, vel, maxForce)`     | Drive a revolute/prismatic joint at target velocity.  |
| `physics3d.setJointMotorPosition(jointId, target, k, d)`      | Drive a joint to a target angle/displacement.         |
| `physics3d.setJointEnabled(jointId, enabled)`                 | Enable or disable a joint.                            |
```

- [ ] **Step 3: Add Spatial Queries table**

```markdown
### Spatial Queries

> Prefer the `useRaycast`, `useShapeCast`, and `useOverlap` composables inside `defineSystem` for zero-copy SAB reads. Use these Service API methods for one-shot queries outside a per-frame update loop.

| Method                                            | Returns      | Description                                    |
| ------------------------------------------------- | ------------ | ---------------------------------------------- |
| `physics3d.castRay(opts)`                         | `RaycastResult3D \| null` | Immediate single raycast.         |
| `physics3d.castShape(opts)`                       | `ShapeCastResult3D \| null` | Immediate shape-cast.           |
| `physics3d.overlapShape(opts)`                    | `number[]`   | Immediate overlap query (entity indices).      |
| `physics3d.projectPoint(px, py, pz, layers, mask)`| `PointProjectionResult3D \| null` | Project a point onto the nearest collider. |
```

- [ ] **Step 4: Add Character Controller table**

```markdown
### Character Controller

| Method                                                   | Description                                               |
| -------------------------------------------------------- | --------------------------------------------------------- |
| `physics3d.addCharacterController(entityId, opts)`       | Create a CC for a kinematic body. Returns compact slot.   |
| `physics3d.characterControllerMove(slot, dx, dy, dz, dt)`| Move CC and write results to SAB.                        |
| `physics3d.removeCharacterController(slot)`              | Destroy the CC and release its SAB slot.                  |
| `physics3d.getCCSABPtr()`                                | Returns the `SharedArrayBuffer` offset of CC state data.  |
| `physics3d.getMaxCCEntities()`                           | Returns the maximum number of simultaneous CCs (32).      |
```

- [ ] **Step 5: Add Pathfinding table**

```markdown
### Pathfinding

| Method                                    | Description                                                      |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `physics3d.initNavGrid3D(opts)`           | Initialise the A\* grid. Must be called before `findPath3D`.    |
| `physics3d.findPath3D(from, to, opts?)`   | Returns `Vec3[]` waypoints or `null` if no path found.          |
```

- [ ] **Step 6: Verify**

```bash
grep -n "addRevoluteJoint\|useRaycast\|addCharacterController\|findPath3D" docs/plugins/physics3d.md | head -20
```
Expected: at least one match per term.

- [ ] **Step 7: Commit all documentation changes**

```bash
git add docs/guide/physics3d-composables.md docs/plugins/physics3d.md
git commit -m "docs(physics3d): add RFC-07/08/09 composables and Service API documentation

Covers: useRaycast, useShapeCast, useOverlap, useJoint (all 5 types + motor),
useCharacterController, initNavGrid3D/findPath3D, fixedRotation/quality on
useDynamicBody. Updates overview table and plugins/physics3d.md Service API.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
git push
```
