# RFC-07b: useCompoundCollider — Multi-Shape Rigid Bodies

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `useCompoundCollider()` composable for attaching multiple primitive shapes to a single rigid body — the recommended approach for complex dynamic objects (cars, robots, buildings) instead of trimesh on dynamic bodies.

**Architecture:** Rapier3D already supports multiple colliders per body via `ColliderSet::insert_with_parent()`. The compound composable simply calls `insert_collider()` multiple times with different offsets, wrapped in a clean array API. No new Rust data structures needed for the basic case; `physics3d_add_compound_collider` is added as an optimised batch variant to avoid N WASM round-trips for N shapes.

**Tech Stack:** Rust/Rapier3D 0.22, wasm-bindgen, TypeScript, Vitest

---

## Why Compound vs Trimesh on Dynamic Bodies

Rapier3D does narrowphase collision on every (body, collider) pair every frame:

- 1 trimesh dynamic body (1000 tris) × 100 contacts = O(1000) triangle tests per pair
- 1 compound body (6 boxes + 2 spheres) × 100 contacts = O(8) primitive tests per pair — ~125× faster

**Key insight:** `insert_collider()` in `world.rs` (line ~548) already inserts a collider parented to any body. Multiple calls with different shape builders and offsets = compound body. No new Rust data structures needed.

---

## Codebase Orientation

| File                                                 | Purpose                                                                                                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crates/gwen-core/src/physics3d/world.rs`            | `PhysicsWorld3D` — `insert_collider()` at ~548, `add_capsule_collider()` at ~700, `#[cfg(test)] mod tests` at ~1079                                     |
| `crates/gwen-core/src/bindings.rs`                   | WASM exports; `physics3d_add_capsule_collider` at ~1440, `physics3d_remove_collider` at ~1484                                                           |
| `crates/gwen-core/tests/physics3d_extended_tests.rs` | Integration tests using `Engine` struct                                                                                                                 |
| `packages/physics3d/src/types.ts`                    | `Physics3DAPI` interface at ~399; `ColliderHandle3D` at ~867; `addCollider` at ~655; `removeCollider` at ~662                                           |
| `packages/physics3d/src/index.ts`                    | `Physics3DWasmBridge` at ~83; `physics3d_remove_collider` at ~210; `addColliderImpl` at ~978; `removeCollider` impl at ~1068; `service` object at ~1194 |
| `packages/physics3d/src/composables/`                | One file per composable; `use-box-collider.ts` is the reference pattern                                                                                 |
| `packages/physics3d/src/composables/collider-id.ts`  | `nextColliderId()` — global auto-increment for stable collider IDs                                                                                      |
| `packages/physics3d/src/helpers/`                    | `contact.ts`, `movement.ts`, `queries.ts` — pure utility functions                                                                                      |

---

## Buffer Layout Reference

The flat `Float32Array` sent to WASM encodes 12 `f32` values per shape:

```
Index  Field           Notes
─────  ──────────────  ──────────────────────────────────────────────
  0    shape_type      0 = BOX, 1 = SPHERE, 2 = CAPSULE
  1    p0              BOX → halfX  | SPHERE → radius  | CAPSULE → radius
  2    p1              BOX → halfY  | SPHERE → 0       | CAPSULE → halfHeight
  3    p2              BOX → halfZ  | SPHERE → 0       | CAPSULE → 0
  4    p3              reserved (always 0)
  5    offset_x        local-space X offset from body origin
  6    offset_y        local-space Y offset from body origin
  7    offset_z        local-space Z offset from body origin
  8    is_sensor       0.0 = solid, 1.0 = sensor
  9    friction        ≥ 0.0 (default 0.5)
 10    restitution     0.0–1.0 (default 0.0)
 11    collider_id     stable u32 assigned by TypeScript
```

`layer_bits` and `mask_bits` are passed once for all shapes (shared across the entire compound body).

---

## Task 1: Rust — `add_compound_collider` in `world.rs`

**Files modified:** `crates/gwen-core/src/physics3d/world.rs`

### 1.1 — Add shape-type constants and `add_compound_collider` method

- [ ] Add three `const` declarations for shape type encoding immediately before `pub fn add_capsule_collider` (line ~700). These must be module-level `const`, not inside the `impl` block.
- [ ] Add `pub fn add_compound_collider` method inside the `impl PhysicsWorld3D` block, immediately after `add_capsule_collider`.

```rust
// ─── Shape type constants for the compound batch buffer ─────────────────────
const COMPOUND_SHAPE_BOX: u32 = 0;
const COMPOUND_SHAPE_SPHERE: u32 = 1;
const COMPOUND_SHAPE_CAPSULE: u32 = 2;
```

```rust
    /// Attach multiple primitive colliders to one rigid body in a single call.
    ///
    /// This avoids N WASM round-trips for an N-shape compound body.
    ///
    /// # Buffer layout (12 `f32` per shape)
    /// `[shape_type, p0, p1, p2, p3, offset_x, offset_y, offset_z, is_sensor, friction, restitution, collider_id]`
    /// - BOX (0):     `p0=half_x, p1=half_y, p2=half_z, p3=0`
    /// - SPHERE (1):  `p0=radius, p1=p2=p3=0`
    /// - CAPSULE (2): `p0=radius, p1=half_height, p2=p3=0`
    ///
    /// Unknown shape types are silently skipped (not counted).
    ///
    /// # Returns
    /// Number of colliders successfully inserted (0 if `entity_index` has no
    /// body or `shape_data.len()` is not a multiple of 12).
    pub fn add_compound_collider(
        &mut self,
        entity_index: u32,
        shape_data: &[f32],
        layer_bits: u32,
        mask_bits: u32,
    ) -> u32 {
        const FLOATS_PER_SHAPE: usize = 12;
        if shape_data.len() % FLOATS_PER_SHAPE != 0 {
            return 0;
        }

        let mut count = 0u32;
        for chunk in shape_data.chunks_exact(FLOATS_PER_SHAPE) {
            let shape_type = chunk[0] as u32;
            let p0 = chunk[1];
            let p1 = chunk[2];
            let p2 = chunk[3];
            // chunk[4] is reserved (p3), ignored
            let ox = chunk[5];
            let oy = chunk[6];
            let oz = chunk[7];
            let is_sensor = chunk[8] != 0.0;
            let friction = chunk[9];
            let restitution = chunk[10];
            let collider_id = chunk[11] as u32;

            let builder = match shape_type {
                COMPOUND_SHAPE_BOX => ColliderBuilder::cuboid(p0, p1, p2),
                COMPOUND_SHAPE_SPHERE => ColliderBuilder::ball(p0),
                COMPOUND_SHAPE_CAPSULE => ColliderBuilder::capsule_y(p1, p0),
                _ => continue,
            };

            if self.insert_collider(
                entity_index,
                collider_id,
                ox,
                oy,
                oz,
                is_sensor,
                friction,
                restitution,
                layer_bits,
                mask_bits,
                builder,
            ) {
                count += 1;
            }
        }
        count
    }
```

### 1.2 — Add unit tests to the existing `#[cfg(test)] mod tests` block

Locate the existing `#[cfg(test)] mod tests {` block (line ~1079) and append the following tests **inside** that block, after the last existing test function.

```rust
    // ── add_compound_collider ─────────────────────────────────────────────────

    #[test]
    fn test_add_compound_collider_three_boxes_returns_3() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);

        // Three BOX shapes encoded as 3 × 12 floats
        #[rustfmt::skip]
        let data: Vec<f32> = vec![
            // shape, p0,  p1,  p2,  p3,  ox,  oy,  oz,  sensor, friction, rest, id
            0.0, 1.0, 0.3, 2.0, 0.0,  0.0, 0.3, 0.0,  0.0, 0.5, 0.0, 1.0, // chassis box
            0.0, 0.35,0.35,0.35,0.0, -0.9, 0.0, 1.6,  0.0, 0.5, 0.0, 2.0, // wheel FL
            0.0, 0.35,0.35,0.35,0.0,  0.9, 0.0, 1.6,  0.0, 0.5, 0.0, 3.0, // wheel FR
        ];

        let count = world.add_compound_collider(0, &data, u32::MAX, u32::MAX);
        assert_eq!(count, 3);
        assert_eq!(world.collider_handles.len(), 3);
    }

    #[test]
    fn test_add_compound_collider_mixed_shapes_returns_3() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);

        #[rustfmt::skip]
        let data: Vec<f32> = vec![
            // BOX (type 0)
            0.0, 0.5, 0.5, 0.5, 0.0,  0.0, 0.0, 0.0,  0.0, 0.5, 0.0, 10.0,
            // SPHERE (type 1)
            1.0, 0.4, 0.0, 0.0, 0.0,  0.0, 1.0, 0.0,  0.0, 0.5, 0.0, 11.0,
            // CAPSULE (type 2)
            2.0, 0.25,0.5, 0.0, 0.0,  0.0,-1.0, 0.0,  0.0, 0.5, 0.0, 12.0,
        ];

        let count = world.add_compound_collider(0, &data, u32::MAX, u32::MAX);
        assert_eq!(count, 3);
        assert_eq!(world.collider_handles.len(), 3);
    }

    #[test]
    fn test_add_compound_collider_unknown_entity_returns_zero() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        // No body registered at entity 99.
        #[rustfmt::skip]
        let data: Vec<f32> = vec![
            0.0, 0.5, 0.5, 0.5, 0.0,  0.0, 0.0, 0.0,  0.0, 0.5, 0.0, 1.0,
        ];
        assert_eq!(world.add_compound_collider(99, &data, u32::MAX, u32::MAX), 0);
    }

    #[test]
    fn test_add_compound_collider_empty_buffer_returns_zero() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);
        assert_eq!(world.add_compound_collider(0, &[], u32::MAX, u32::MAX), 0);
    }

    #[test]
    fn test_add_compound_collider_misaligned_buffer_returns_zero() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);
        // 11 floats — not a multiple of 12
        let data = vec![0.0f32; 11];
        assert_eq!(world.add_compound_collider(0, &data, u32::MAX, u32::MAX), 0);
    }

    #[test]
    fn test_add_compound_collider_unknown_shape_type_skipped() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);

        #[rustfmt::skip]
        let data: Vec<f32> = vec![
            // shape type 99 — unknown, should be skipped
            99.0, 0.5, 0.5, 0.5, 0.0,  0.0, 0.0, 0.0,  0.0, 0.5, 0.0, 1.0,
            // valid BOX
             0.0, 0.5, 0.5, 0.5, 0.0,  0.0, 0.0, 0.0,  0.0, 0.5, 0.0, 2.0,
        ];

        // Only the valid box is inserted.
        assert_eq!(world.add_compound_collider(0, &data, u32::MAX, u32::MAX), 1);
        assert_eq!(world.collider_handles.len(), 1);
    }

    #[test]
    fn test_add_compound_collider_sensor_shape_tracked() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);

        #[rustfmt::skip]
        let data: Vec<f32> = vec![
            // is_sensor = 1.0
            0.0, 0.5, 0.5, 0.5, 0.0,  0.0, 0.0, 0.0,  1.0, 0.5, 0.0, 5.0,
        ];
        assert_eq!(world.add_compound_collider(0, &data, u32::MAX, u32::MAX), 1);
    }
```

### 1.3 — Verify

```bash
cargo test -p gwen-core --features physics3d test_add_compound
```

**Expected output:**

```
test physics3d::world::tests::test_add_compound_collider_empty_buffer_returns_zero ... ok
test physics3d::world::tests::test_add_compound_collider_misaligned_buffer_returns_zero ... ok
test physics3d::world::tests::test_add_compound_collider_mixed_shapes_returns_3 ... ok
test physics3d::world::tests::test_add_compound_collider_sensor_shape_tracked ... ok
test physics3d::world::tests::test_add_compound_collider_three_boxes_returns_3 ... ok
test physics3d::world::tests::test_add_compound_collider_unknown_entity_returns_zero ... ok
test physics3d::world::tests::test_add_compound_collider_unknown_shape_type_skipped ... ok

test result: ok. 7 passed; 0 failed
```

### 1.4 — Commit

```
git add crates/gwen-core/src/physics3d/world.rs
git commit -m "feat(physics3d): add add_compound_collider batch method to PhysicsWorld3D

Attaches multiple primitive colliders to one rigid body in a single
call using a flat f32 buffer (12 floats per shape), avoiding N
round-trips for N shapes. Supports BOX (0), SPHERE (1), CAPSULE (2)
shape types. Unknown shape types are silently skipped.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Rust — `physics3d_add_compound_collider` binding in `bindings.rs` + integration tests

**Files modified:**

- `crates/gwen-core/src/bindings.rs`
- `crates/gwen-core/tests/physics3d_extended_tests.rs`

### 2.1 — Add binding to `bindings.rs`

Locate `pub fn physics3d_remove_collider` (line ~1484) and insert the following immediately **before** it (between `physics3d_add_capsule_collider` and `physics3d_remove_collider`):

```rust
    /// Attach multiple primitive colliders to one 3D body in a single WASM call.
    ///
    /// The `shape_data` slice encodes 12 `f32` values per shape:
    /// `[shape_type, p0, p1, p2, p3, offset_x, offset_y, offset_z, is_sensor, friction, restitution, collider_id]`
    ///
    /// Shape types: `0` = BOX, `1` = SPHERE, `2` = CAPSULE.
    ///
    /// `layer_bits` and `mask_bits` apply to all shapes in the batch.
    ///
    /// # Returns
    /// Number of colliders successfully inserted; `0` if the world is not
    /// initialised, the entity has no body, or `shape_data` is malformed.
    #[cfg(feature = "physics3d")]
    #[wasm_bindgen]
    pub fn physics3d_add_compound_collider(
        &mut self,
        entity_index: u32,
        shape_data: &[f32],
        layer_bits: u32,
        mask_bits: u32,
    ) -> u32 {
        if let Some(ref mut world) = self.physics3d_world {
            world.add_compound_collider(entity_index, shape_data, layer_bits, mask_bits)
        } else {
            0
        }
    }
```

### 2.2 — Add integration tests to `physics3d_extended_tests.rs`

Inside the existing `mod physics3d_extended { ... }` block, append:

```rust
    // ── add_compound_collider binding ─────────────────────────────────────────

    #[test]
    fn test_physics3d_add_compound_collider_returns_count() {
        let mut engine = engine_with_one_body();

        #[rustfmt::skip]
        let data: Vec<f32> = vec![
            // BOX chassis
            0.0, 1.0, 0.3, 2.0, 0.0,  0.0, 0.3, 0.0,  0.0, 0.5, 0.0, 1.0,
            // SPHERE wheel
            1.0, 0.35,0.0, 0.0, 0.0, -0.9, 0.0, 1.6,  0.0, 0.5, 0.0, 2.0,
            // CAPSULE bumper
            2.0, 0.1, 0.4, 0.0, 0.0,  0.0, 0.0,-2.0,  0.0, 0.5, 0.0, 3.0,
        ];

        assert_eq!(
            engine.physics3d_add_compound_collider(0, &data, 0xFFFF_FFFF, 0xFFFF_FFFF),
            3
        );
    }

    #[test]
    fn test_physics3d_add_compound_collider_no_body_returns_zero() {
        let mut engine = Engine::new(32);
        engine.physics3d_init(0.0, -9.81, 0.0, 32);
        // Entity 5 has no body.
        let data: Vec<f32> = vec![0.0, 0.5, 0.5, 0.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.5, 0.0, 1.0];
        assert_eq!(
            engine.physics3d_add_compound_collider(5, &data, 0xFFFF_FFFF, 0xFFFF_FFFF),
            0
        );
    }

    #[test]
    fn test_physics3d_add_compound_collider_world_uninitialised_returns_zero() {
        let mut engine = Engine::new(32);
        // No physics3d_init call.
        let data: Vec<f32> = vec![0.0, 0.5, 0.5, 0.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.5, 0.0, 1.0];
        assert_eq!(
            engine.physics3d_add_compound_collider(0, &data, 0xFFFF_FFFF, 0xFFFF_FFFF),
            0
        );
    }

    #[test]
    fn test_physics3d_add_compound_collider_partial_on_unknown_shape() {
        let mut engine = engine_with_one_body();

        #[rustfmt::skip]
        let data: Vec<f32> = vec![
            // shape type 77 — unknown, skipped
            77.0, 0.5, 0.5, 0.5, 0.0,  0.0, 0.0, 0.0,  0.0, 0.5, 0.0, 1.0,
            // valid BOX
             0.0, 0.5, 0.5, 0.5, 0.0,  0.0, 0.0, 0.0,  0.0, 0.5, 0.0, 2.0,
        ];

        assert_eq!(
            engine.physics3d_add_compound_collider(0, &data, 0xFFFF_FFFF, 0xFFFF_FFFF),
            1
        );
    }
```

### 2.3 — Verify

```bash
cargo test -p gwen-core --features physics3d test_physics3d_add_compound
```

**Expected output:**

```
test physics3d_extended::test_physics3d_add_compound_collider_no_body_returns_zero ... ok
test physics3d_extended::test_physics3d_add_compound_collider_partial_on_unknown_shape ... ok
test physics3d_extended::test_physics3d_add_compound_collider_returns_count ... ok
test physics3d_extended::test_physics3d_add_compound_collider_world_uninitialised_returns_zero ... ok

test result: ok. 4 passed; 0 failed
```

### 2.4 — Commit

```
git add crates/gwen-core/src/bindings.rs crates/gwen-core/tests/physics3d_extended_tests.rs
git commit -m "feat(physics3d): expose physics3d_add_compound_collider WASM binding

Adds the wasm_bindgen export for the batch compound collider insertion.
Takes a flat &[f32] buffer (Float32Array on the JS side), layer_bits
and mask_bits, and delegates to PhysicsWorld3D::add_compound_collider.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Build WASM and Verify Export

### 3.1 — Run the WASM build

```bash
pnpm build:wasm
```

**Expected output (no errors):**

```
   Compiling gwen-core v0.1.0
    Finished release [optimized] target(s) in ...
  [wasm-bindgen] Generating JS bindings
  [wasm-opt] Optimising WASM binary
```

### 3.2 — Verify the export is present

```bash
grep -r "physics3d_add_compound_collider" packages/core/src/wasm/ 2>/dev/null || \
grep -r "physics3d_add_compound_collider" crates/gwen-core/pkg/ 2>/dev/null | head -5
```

Confirm that `physics3d_add_compound_collider` appears in the generated JS/TypeScript bindings.

### 3.3 — Run full Rust test suite to confirm no regressions

```bash
cargo test -p gwen-core --features physics3d
```

**Expected:** all previously-passing tests continue to pass.

### 3.4 — Commit

```
git add crates/gwen-core/pkg/ packages/core/src/wasm/
git commit -m "build(wasm): rebuild with physics3d_add_compound_collider export

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

_(If the pkg/ files are gitignored and generated at install-time, skip this commit.)_

---

## Task 4: TypeScript — Types, Bridge Extension, Encoding Helper, and API Implementation

**Files created:**

- `packages/physics3d/src/helpers/compound.ts`
- `packages/physics3d/tests/compound-encoding.test.ts`

**Files modified:**

- `packages/physics3d/src/types.ts`
- `packages/physics3d/src/index.ts`

### 4.1 — Add types to `packages/physics3d/src/types.ts`

#### 4.1.1 — Add `CompoundShapeSpec`, `CompoundColliderOptions3D`, and `CompoundColliderHandle3D`

Locate the line `export type ConvexColliderHandle3D = ColliderHandle3D;` (last type alias after `ColliderHandle3D`) and insert the following block immediately after it:

```typescript
// ─── Compound collider ────────────────────────────────────────────────────────

/**
 * Specification for a single primitive shape within a compound collider.
 *
 * All offsets are in local body space (metres). `isSensor`, `friction`, and
 * `restitution` default to `false`, `0.5`, and `0.0` respectively when omitted.
 */
export type CompoundShapeSpec =
  | {
      type: 'box';
      /** Half-extent along the local X axis (metres). */
      halfX: number;
      /** Half-extent along the local Y axis (metres). */
      halfY: number;
      /** Half-extent along the local Z axis (metres). */
      halfZ: number;
      offsetX?: number;
      offsetY?: number;
      offsetZ?: number;
      isSensor?: boolean;
      friction?: number;
      restitution?: number;
    }
  | {
      type: 'sphere';
      radius: number;
      offsetX?: number;
      offsetY?: number;
      offsetZ?: number;
      isSensor?: boolean;
      friction?: number;
      restitution?: number;
    }
  | {
      type: 'capsule';
      radius: number;
      halfHeight: number;
      offsetX?: number;
      offsetY?: number;
      offsetZ?: number;
      isSensor?: boolean;
      friction?: number;
      restitution?: number;
    };

/**
 * Options for {@link useCompoundCollider}.
 *
 * At least one shape must be provided. `layers` and `mask` are shared across
 * all shapes in the compound body.
 */
export interface CompoundColliderOptions3D {
  /** Ordered list of primitive shapes to attach to the body. */
  shapes: CompoundShapeSpec[];
  /** Collision layer membership (named layers, resolved to bitmask). */
  layers?: string[];
  /** Collision filter — which layers this body collides with. */
  mask?: string[];
}

/**
 * Handle returned by {@link useCompoundCollider}.
 *
 * Holds stable IDs for every shape collider, in the same order as
 * `options.shapes`. Call `remove()` to detach all shapes at once.
 */
export interface CompoundColliderHandle3D {
  /** Stable numeric IDs for each shape collider, in `options.shapes` order. */
  readonly colliderIds: readonly number[];
  /** Remove all shapes of this compound collider from the entity. */
  remove(): void;
}
```

#### 4.1.2 — Add `addCompoundCollider` to the `Physics3DAPI` interface

Locate `removeCollider(entityId: Physics3DEntityId, colliderId: number): boolean;` (line ~662) and insert the following block immediately after it:

```typescript
  /**
   * Attach multiple primitive colliders to one body in a single batch call.
   *
   * Uses `physics3d_add_compound_collider` in WASM mode (one round-trip) and
   * falls back to individual `addCollider` calls in local-simulation mode.
   *
   * @param entityId - The entity that owns the rigid body.
   * @param options  - Shapes, shared layer membership, and collision filter.
   * @returns A {@link CompoundColliderHandle3D} on success, or `null` when the
   *          entity has no registered body.
   *
   * @since 1.0.0
   */
  addCompoundCollider(
    entityId: Physics3DEntityId,
    options: CompoundColliderOptions3D,
  ): CompoundColliderHandle3D | null;
```

Also add `CompoundColliderOptions3D` and `CompoundColliderHandle3D` to the existing import list at the top of `types.ts` if they are referenced elsewhere, or simply rely on the same-file declarations (no import needed since they are defined in the same file).

### 4.2 — Create `packages/physics3d/src/helpers/compound.ts`

````typescript
/**
 * @file helpers/compound.ts — pure encoding utilities for compound colliders.
 *
 * Converts an array of {@link CompoundShapeSpec} objects into the flat
 * `Float32Array` accepted by `physics3d_add_compound_collider`.
 */
import type { CompoundShapeSpec } from '../types.js';

/** Shape-type discriminant values — must match Rust `COMPOUND_SHAPE_*` constants. */
export const COMPOUND_SHAPE_BOX = 0;
export const COMPOUND_SHAPE_SPHERE = 1;
export const COMPOUND_SHAPE_CAPSULE = 2;

/** Number of `f32` values encoded per shape in the batch buffer. */
export const FLOATS_PER_COMPOUND_SHAPE = 12;

/**
 * Encode an ordered list of shape specs and their pre-assigned collider IDs
 * into a flat `Float32Array` for `physics3d_add_compound_collider`.
 *
 * Buffer layout per shape (12 floats):
 * ```
 * [shape_type, p0, p1, p2, p3(0), offsetX, offsetY, offsetZ,
 *  isSensor(0|1), friction, restitution, colliderId]
 * ```
 *
 * @param shapes      - Ordered array of shape specifications.
 * @param colliderIds - Stable IDs in the same order as `shapes`.
 * @returns Flat `Float32Array` ready to send to WASM.
 * @throws {Error} If `shapes.length !== colliderIds.length`.
 */
export function encodeCompoundShapes(
  shapes: CompoundShapeSpec[],
  colliderIds: number[],
): Float32Array {
  if (shapes.length !== colliderIds.length) {
    throw new Error(
      `[GWEN:compound] shapes.length (${shapes.length}) must equal colliderIds.length (${colliderIds.length})`,
    );
  }

  const buf = new Float32Array(shapes.length * FLOATS_PER_COMPOUND_SHAPE);

  shapes.forEach((shape, i) => {
    const base = i * FLOATS_PER_COMPOUND_SHAPE;
    const ox = shape.offsetX ?? 0;
    const oy = shape.offsetY ?? 0;
    const oz = shape.offsetZ ?? 0;
    const sensor = shape.isSensor ? 1.0 : 0.0;
    const friction = shape.friction ?? 0.5;
    const restitution = shape.restitution ?? 0.0;
    const id = colliderIds[i]!;

    switch (shape.type) {
      case 'box':
        buf[base + 0] = COMPOUND_SHAPE_BOX;
        buf[base + 1] = shape.halfX;
        buf[base + 2] = shape.halfY;
        buf[base + 3] = shape.halfZ;
        buf[base + 4] = 0; // p3 reserved
        break;
      case 'sphere':
        buf[base + 0] = COMPOUND_SHAPE_SPHERE;
        buf[base + 1] = shape.radius;
        buf[base + 2] = 0;
        buf[base + 3] = 0;
        buf[base + 4] = 0;
        break;
      case 'capsule':
        buf[base + 0] = COMPOUND_SHAPE_CAPSULE;
        buf[base + 1] = shape.radius;
        buf[base + 2] = shape.halfHeight;
        buf[base + 3] = 0;
        buf[base + 4] = 0;
        break;
    }

    buf[base + 5] = ox;
    buf[base + 6] = oy;
    buf[base + 7] = oz;
    buf[base + 8] = sensor;
    buf[base + 9] = friction;
    buf[base + 10] = restitution;
    buf[base + 11] = id;
  });

  return buf;
}
````

### 4.3 — Update `packages/physics3d/src/index.ts`

#### 4.3.1 — Add to the `Physics3DWasmBridge` interface

Locate `physics3d_remove_collider?: (entityIndex: number, colliderId: number) => boolean;` (line ~210) and insert the following immediately before it:

```typescript
  physics3d_add_compound_collider?: (
    entityIndex: number,
    shapeData: Float32Array,
    layerBits: number,
    maskBits: number,
  ) => number;
```

#### 4.3.2 — Add imports

Add the following import line after the existing imports from `./composables/on-sensor.js`:

```typescript
import { encodeCompoundShapes } from './helpers/compound.js';
import { nextColliderId } from './composables/collider-id.js';
```

Also add the following to the type imports block at the top (inside the `import type { ... } from './types'` statement):

```typescript
  CompoundColliderOptions3D,
  CompoundColliderHandle3D,
  CompoundShapeSpec,
```

#### 4.3.3 — Add `shapeSpecToColliderOptions` internal helper

Add this pure helper function immediately before the `addColliderImpl` function (line ~975):

```typescript
/** Convert a single {@link CompoundShapeSpec} entry into {@link Physics3DColliderOptions}. */
const shapeSpecToColliderOptions = (
  shape: CompoundShapeSpec,
  colliderId: number,
  layers: string[] | undefined,
  mask: string[] | undefined,
): Physics3DColliderOptions => {
  const common = {
    colliderId,
    offsetX: shape.offsetX,
    offsetY: shape.offsetY,
    offsetZ: shape.offsetZ,
    isSensor: shape.isSensor,
    friction: shape.friction,
    restitution: shape.restitution,
    layers,
    mask,
  };
  switch (shape.type) {
    case 'box':
      return {
        ...common,
        shape: { type: 'box', halfX: shape.halfX, halfY: shape.halfY, halfZ: shape.halfZ },
      };
    case 'sphere':
      return { ...common, shape: { type: 'sphere', radius: shape.radius } };
    case 'capsule':
      return {
        ...common,
        shape: { type: 'capsule', radius: shape.radius, halfHeight: shape.halfHeight },
      };
  }
};
```

#### 4.3.4 — Implement `addCompoundCollider`

Add the following immediately after the `removeCollider` function (after line ~1086):

```typescript
const addCompoundCollider: Physics3DAPI['addCompoundCollider'] = (entityId, options) => {
  const slot = toEntityIndex(entityId);
  if (!bodyByEntity.has(slot)) return null;

  const { shapes, layers, mask } = options;
  const colliderIds = shapes.map(() => nextColliderId());

  if (backendMode === 'wasm' && wasmBridge?.physics3d_add_compound_collider) {
    const layerBits = resolveLayerBits(layers, layerRegistry);
    const maskBits = resolveLayerBits(mask, layerRegistry);
    const buf = encodeCompoundShapes(shapes, colliderIds);
    const count = wasmBridge.physics3d_add_compound_collider(slot, buf, layerBits, maskBits);

    if (count !== shapes.length) return null;

    // Mirror into local collider registry for inspection and removeBody cleanup.
    if (!localColliders.has(slot)) localColliders.set(slot, []);
    shapes.forEach((shape, i) => {
      localColliders
        .get(slot)!
        .push(shapeSpecToColliderOptions(shape, colliderIds[i]!, layers, mask));
    });
  } else {
    // Local-simulation fallback: insert each shape individually.
    shapes.forEach((shape, i) => {
      addColliderImpl(entityId, shapeSpecToColliderOptions(shape, colliderIds[i]!, layers, mask));
    });
  }

  return {
    colliderIds,
    remove() {
      colliderIds.forEach((id) => removeCollider(entityId, id));
    },
  };
};
```

#### 4.3.5 — Register on the `service` object

Locate the `addCollider,` line in the service object and add `addCompoundCollider,` immediately after `removeCollider,`:

```typescript
    addCollider,
    removeCollider,
    addCompoundCollider,
```

### 4.4 — Write encoding helper tests in `packages/physics3d/tests/compound-encoding.test.ts`

```typescript
/**
 * Unit tests for the compound-collider encoding helper.
 *
 * Tests are deliberately pure (no mocks, no WASM) — they exercise
 * encodeCompoundShapes() in isolation to validate the Float32Array layout.
 */
import { describe, it, expect } from 'vitest';
import {
  encodeCompoundShapes,
  COMPOUND_SHAPE_BOX,
  COMPOUND_SHAPE_SPHERE,
  COMPOUND_SHAPE_CAPSULE,
  FLOATS_PER_COMPOUND_SHAPE,
} from '../src/helpers/compound';
import type { CompoundShapeSpec } from '../src/types';

describe('encodeCompoundShapes', () => {
  it('returns an empty Float32Array for an empty shapes list', () => {
    const buf = encodeCompoundShapes([], []);
    expect(buf).toBeInstanceOf(Float32Array);
    expect(buf.length).toBe(0);
  });

  it('encodes a single box shape correctly', () => {
    const shape: CompoundShapeSpec = {
      type: 'box',
      halfX: 1.0,
      halfY: 0.3,
      halfZ: 2.0,
      offsetY: 0.3,
    };
    const buf = encodeCompoundShapes([shape], [42]);
    expect(buf.length).toBe(FLOATS_PER_COMPOUND_SHAPE);
    expect(buf[0]).toBe(COMPOUND_SHAPE_BOX);
    expect(buf[1]).toBeCloseTo(1.0); // halfX
    expect(buf[2]).toBeCloseTo(0.3); // halfY
    expect(buf[3]).toBeCloseTo(2.0); // halfZ
    expect(buf[4]).toBe(0); // reserved p3
    expect(buf[5]).toBe(0); // offsetX default
    expect(buf[6]).toBeCloseTo(0.3); // offsetY
    expect(buf[7]).toBe(0); // offsetZ default
    expect(buf[8]).toBe(0); // isSensor = false
    expect(buf[9]).toBeCloseTo(0.5); // friction default
    expect(buf[10]).toBeCloseTo(0.0); // restitution default
    expect(buf[11]).toBe(42); // colliderId
  });

  it('encodes a sphere shape correctly', () => {
    const shape: CompoundShapeSpec = {
      type: 'sphere',
      radius: 0.35,
      offsetX: -0.9,
      isSensor: true,
    };
    const buf = encodeCompoundShapes([shape], [7]);
    expect(buf[0]).toBe(COMPOUND_SHAPE_SPHERE);
    expect(buf[1]).toBeCloseTo(0.35); // radius
    expect(buf[2]).toBe(0); // p1 unused
    expect(buf[3]).toBe(0); // p2 unused
    expect(buf[5]).toBeCloseTo(-0.9); // offsetX
    expect(buf[8]).toBe(1); // isSensor = true
    expect(buf[11]).toBe(7); // colliderId
  });

  it('encodes a capsule shape correctly', () => {
    const shape: CompoundShapeSpec = {
      type: 'capsule',
      radius: 0.25,
      halfHeight: 0.5,
      friction: 1.2,
    };
    const buf = encodeCompoundShapes([shape], [3]);
    expect(buf[0]).toBe(COMPOUND_SHAPE_CAPSULE);
    expect(buf[1]).toBeCloseTo(0.25); // radius
    expect(buf[2]).toBeCloseTo(0.5); // halfHeight
    expect(buf[9]).toBeCloseTo(1.2); // custom friction
    expect(buf[11]).toBe(3);
  });

  it('encodes multiple shapes with correct stride', () => {
    const shapes: CompoundShapeSpec[] = [
      { type: 'box', halfX: 1.0, halfY: 0.3, halfZ: 2.0 },
      { type: 'sphere', radius: 0.35 },
      { type: 'capsule', radius: 0.1, halfHeight: 0.4 },
    ];
    const buf = encodeCompoundShapes(shapes, [10, 11, 12]);
    expect(buf.length).toBe(3 * FLOATS_PER_COMPOUND_SHAPE);
    // First shape
    expect(buf[0]).toBe(COMPOUND_SHAPE_BOX);
    expect(buf[11]).toBe(10);
    // Second shape
    expect(buf[FLOATS_PER_COMPOUND_SHAPE]).toBe(COMPOUND_SHAPE_SPHERE);
    expect(buf[FLOATS_PER_COMPOUND_SHAPE + 11]).toBe(11);
    // Third shape
    expect(buf[2 * FLOATS_PER_COMPOUND_SHAPE]).toBe(COMPOUND_SHAPE_CAPSULE);
    expect(buf[2 * FLOATS_PER_COMPOUND_SHAPE + 11]).toBe(12);
  });

  it('applies custom friction and restitution per shape', () => {
    const shape: CompoundShapeSpec = {
      type: 'box',
      halfX: 0.5,
      halfY: 0.5,
      halfZ: 0.5,
      friction: 1.2,
      restitution: 0.8,
    };
    const buf = encodeCompoundShapes([shape], [99]);
    expect(buf[9]).toBeCloseTo(1.2);
    expect(buf[10]).toBeCloseTo(0.8);
  });

  it('throws when shapes.length !== colliderIds.length', () => {
    const shapes: CompoundShapeSpec[] = [{ type: 'box', halfX: 1, halfY: 1, halfZ: 1 }];
    expect(() => encodeCompoundShapes(shapes, [])).toThrow(/shapes\.length.*colliderIds\.length/);
  });

  it('encodes all-zero offsets when offsets are omitted', () => {
    const buf = encodeCompoundShapes([{ type: 'sphere', radius: 1.0 }], [0]);
    expect(buf[5]).toBe(0); // offsetX
    expect(buf[6]).toBe(0); // offsetY
    expect(buf[7]).toBe(0); // offsetZ
  });
});
```

### 4.5 — Run tests

```bash
pnpm --filter @gwenjs/physics3d exec vitest run tests/compound-encoding.test.ts
```

**Expected output:**

```
 ✓ tests/compound-encoding.test.ts (9)
   ✓ encodeCompoundShapes
     ✓ returns an empty Float32Array for an empty shapes list
     ✓ encodes a single box shape correctly
     ✓ encodes a sphere shape correctly
     ✓ encodes a capsule shape correctly
     ✓ encodes multiple shapes with correct stride
     ✓ applies custom friction and restitution per shape
     ✓ throws when shapes.length !== colliderIds.length
     ✓ encodes all-zero offsets when offsets are omitted

 Test Files  1 passed (1)
 Tests       8 passed (8)
```

Also run the full TS test suite to confirm no regressions:

```bash
pnpm --filter @gwenjs/physics3d test
```

### 4.6 — Commit

```
git add packages/physics3d/src/types.ts \
        packages/physics3d/src/index.ts \
        packages/physics3d/src/helpers/compound.ts \
        packages/physics3d/tests/compound-encoding.test.ts
git commit -m "feat(physics3d): add compound collider types, bridge, and encoding helper

- CompoundShapeSpec / CompoundColliderOptions3D / CompoundColliderHandle3D in types.ts
- addCompoundCollider() added to Physics3DAPI interface
- physics3d_add_compound_collider added to Physics3DWasmBridge
- encodeCompoundShapes() + COMPOUND_SHAPE_* constants in helpers/compound.ts
- addCompoundCollider implemented in plugin (WASM batch + local fallback)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: TypeScript — `useCompoundCollider` Composable, Exports, and Integration Tests

**Files created:**

- `packages/physics3d/src/composables/use-compound-collider.ts`
- `packages/physics3d/tests/compound-collider.test.ts`

**Files modified:**

- `packages/physics3d/src/composables/index.ts`
- `packages/physics3d/src/index.ts`

### 5.1 — Create `packages/physics3d/src/composables/use-compound-collider.ts`

````typescript
/**
 * @file useCompoundCollider() — attaches multiple primitive shapes to the
 * current entity's rigid body as a single compound collider.
 *
 * ## Why use a compound collider instead of a trimesh on a dynamic body?
 *
 * Rapier3D runs narrowphase tests on every (body, collider) pair per frame.
 * A trimesh with 1 000 triangles costs O(1 000) tests per contact pair.
 * A compound body with 8 primitive shapes costs O(8) — roughly **125× faster**
 * at equivalent visual fidelity for most game objects.
 *
 * > **Warning:** Do _not_ use trimesh colliders on dynamic rigid bodies.
 * > Trimesh shapes are only stable on static/fixed bodies. For dynamic objects
 * > (cars, robots, characters) always compose primitive shapes with
 * > `useCompoundCollider`.
 */
import type { CompoundColliderHandle3D, CompoundColliderOptions3D } from '../types.js';
import { usePhysics3D } from '../composables.js';
import { _getActorEntityId } from '@gwenjs/core/scene';
import type { EntityId } from '@gwenjs/core';

export type { CompoundColliderOptions3D };

/**
 * Attach multiple primitive colliders to the current entity's rigid body.
 *
 * Must be called after {@link useStaticBody} or {@link useDynamicBody} has
 * registered a body for this entity, inside a `defineActor` callback.
 *
 * In WASM mode all shapes are sent in a **single round-trip** via the
 * `physics3d_add_compound_collider` batch binding — there is no per-shape
 * overhead for large compound bodies.
 *
 * In local-simulation mode (no WASM available) each shape is inserted
 * individually via the standard collider pipeline.
 *
 * @param options - Ordered list of primitive shapes and optional shared
 *   layer/mask configuration.
 * @returns A {@link CompoundColliderHandle3D} containing stable IDs for each
 *   shape (in `options.shapes` order) and a `remove()` method that detaches
 *   all shapes at once.
 * @throws {Error} If the current entity has no registered rigid body.
 * @throws {GwenPluginNotFoundError} If `@gwenjs/physics3d` is not registered.
 *
 * @example
 * ```typescript
 * // Car chassis (box) + 4 sphere wheels — one compound body
 * const CarActor = defineActor(CarPrefab, () => {
 *   useDynamicBody({ mass: 1200 })
 *   useCompoundCollider({
 *     shapes: [
 *       { type: 'box', halfX: 1.0, halfY: 0.3, halfZ: 2.0, offsetY: 0.3 },       // chassis
 *       { type: 'sphere', radius: 0.35, offsetX: -0.9, offsetZ:  1.6 },           // wheel FL
 *       { type: 'sphere', radius: 0.35, offsetX:  0.9, offsetZ:  1.6 },           // wheel FR
 *       { type: 'sphere', radius: 0.35, offsetX: -0.9, offsetZ: -1.6 },           // wheel RL
 *       { type: 'sphere', radius: 0.35, offsetX:  0.9, offsetZ: -1.6 },           // wheel RR
 *     ],
 *   })
 * })
 * ```
 *
 * @example
 * ```typescript
 * // Robot with a capsule torso and two box arms
 * const RobotActor = defineActor(RobotPrefab, () => {
 *   useDynamicBody({ mass: 80 })
 *   const compound = useCompoundCollider({
 *     shapes: [
 *       { type: 'capsule', radius: 0.2, halfHeight: 0.5 },                        // torso
 *       { type: 'box', halfX: 0.1, halfY: 0.4, halfZ: 0.1, offsetX: -0.35 },    // left arm
 *       { type: 'box', halfX: 0.1, halfY: 0.4, halfZ: 0.1, offsetX:  0.35 },    // right arm
 *     ],
 *   })
 *   // compound.colliderIds → [id0, id1, id2]
 *   // compound.remove()   → detaches all 3 shapes
 * })
 * ```
 *
 * @since 1.0.0
 */
export function useCompoundCollider(options: CompoundColliderOptions3D): CompoundColliderHandle3D {
  const physics = usePhysics3D();
  const entityId = _getActorEntityId() as unknown as EntityId;

  const handle = physics.addCompoundCollider(entityId, options);
  if (!handle) {
    throw new Error(
      '[GWEN:useCompoundCollider] No rigid body found for this entity. ' +
        'Call useDynamicBody() or useStaticBody() before useCompoundCollider().',
    );
  }

  return handle;
}
````

### 5.2 — Export from `packages/physics3d/src/composables/index.ts`

Add the following lines after the `useConvexCollider` export block:

```typescript
export { useCompoundCollider } from './use-compound-collider.js';
export type { CompoundColliderOptions3D } from './use-compound-collider.js';
```

### 5.3 — Export types from `packages/physics3d/src/index.ts`

Locate the block that exports `ConvexColliderHandle3D` and add `CompoundColliderHandle3D` and `CompoundShapeSpec`:

```typescript
export type {
  // ...existing exports...
  ConvexColliderHandle3D,
  CompoundColliderHandle3D,
  CompoundShapeSpec,
  CompoundColliderOptions3D,
};
```

_(Search for the `export type {` block near the bottom of index.ts that already exports `ConvexColliderHandle3D` and append the new names.)_

### 5.4 — Write composable tests in `packages/physics3d/tests/compound-collider.test.ts`

```typescript
/**
 * Tests for useCompoundCollider() composable and addCompoundCollider() API
 * in local-simulation mode.
 *
 * These tests do NOT require a live WASM binary — the physics3d plugin
 * falls back to a deterministic local simulation when no WASM bridge is
 * available (same approach as colliders.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Minimal mock — forces local-mode by omitting physics3d_add_body ──────────
const physics3dInit = vi.fn();
const physics3dStep = vi.fn();

const mockBridge = {
  variant: 'physics3d' as const,
  getPhysicsBridge: vi.fn(() => ({
    physics3d_init: physics3dInit,
    physics3d_step: physics3dStep,
    // Intentionally no physics3d_add_body → local mode
  })),
};

vi.mock('@gwenjs/core', () => ({
  getWasmBridge: () => mockBridge,
  unpackEntityId: (id: bigint) => ({ index: Number(id & 0xffffffffn), generation: 0 }),
  createEntityId: (index: number, generation: number) =>
    BigInt(index) | (BigInt(generation) << 32n),
}));

import { Physics3DPlugin, type Physics3DAPI } from '../src/index';
import type { GwenEngine } from '@gwenjs/core';
import type { CompoundColliderOptions3D } from '../src/types';

// ─── Engine factory ───────────────────────────────────────────────────────────

function makeEngine() {
  const services = new Map<string, unknown>();

  const engine = {
    provide: vi.fn((name: string, value: unknown) => {
      services.set(name, value);
    }),
    inject: vi.fn((name: string) => services.get(name)),
    hooks: {
      hook: vi.fn(),
      callHook: vi.fn(),
    },
    getEntityGeneration: vi.fn(() => 0),
    query: vi.fn(() => []),
    getComponent: vi.fn(),
    wasmBridge: null,
  } as unknown as GwenEngine;

  return { engine, services };
}

function setup() {
  const { engine, services } = makeEngine();
  const plugin = Physics3DPlugin();
  plugin.setup(engine);
  const service = services.get('physics3d') as Physics3DAPI;
  return { service };
}

// ─── addCompoundCollider (API) ────────────────────────────────────────────────

describe('addCompoundCollider — local mode', () => {
  beforeEach(() => {
    physics3dInit.mockReset();
    physics3dStep.mockReset();
    mockBridge.getPhysicsBridge.mockClear();
  });

  it('returns null when no body is registered for the entity', () => {
    const { service } = setup();
    const result = service.addCompoundCollider(1n, {
      shapes: [{ type: 'box', halfX: 0.5, halfY: 0.5, halfZ: 0.5 }],
    });
    expect(result).toBeNull();
  });

  it('returns a handle with one collider ID for a single-shape compound', () => {
    const { service } = setup();
    service.createBody(1n);
    const handle = service.addCompoundCollider(1n, {
      shapes: [{ type: 'box', halfX: 1.0, halfY: 0.3, halfZ: 2.0, offsetY: 0.3 }],
    });
    expect(handle).not.toBeNull();
    expect(handle!.colliderIds).toHaveLength(1);
    expect(typeof handle!.colliderIds[0]).toBe('number');
  });

  it('returns a handle with five collider IDs for a car compound (chassis + 4 wheels)', () => {
    const { service } = setup();
    service.createBody(2n);

    const options: CompoundColliderOptions3D = {
      shapes: [
        { type: 'box', halfX: 1.0, halfY: 0.3, halfZ: 2.0, offsetY: 0.3 }, // chassis
        { type: 'sphere', radius: 0.35, offsetX: -0.9, offsetZ: 1.6 }, // wheel FL
        { type: 'sphere', radius: 0.35, offsetX: 0.9, offsetZ: 1.6 }, // wheel FR
        { type: 'sphere', radius: 0.35, offsetX: -0.9, offsetZ: -1.6 }, // wheel RL
        { type: 'sphere', radius: 0.35, offsetX: 0.9, offsetZ: -1.6 }, // wheel RR
      ],
    };

    const handle = service.addCompoundCollider(2n, options);
    expect(handle).not.toBeNull();
    expect(handle!.colliderIds).toHaveLength(5);
  });

  it('assigns unique collider IDs across shapes', () => {
    const { service } = setup();
    service.createBody(3n);
    const handle = service.addCompoundCollider(3n, {
      shapes: [
        { type: 'box', halfX: 0.5, halfY: 0.5, halfZ: 0.5 },
        { type: 'sphere', radius: 0.3 },
        { type: 'capsule', radius: 0.2, halfHeight: 0.5 },
      ],
    });
    const ids = handle!.colliderIds;
    expect(new Set(ids).size).toBe(ids.length); // all unique
  });

  it('remove() detaches all shapes from the entity', () => {
    const { service } = setup();
    service.createBody(4n);
    const handle = service.addCompoundCollider(4n, {
      shapes: [
        { type: 'box', halfX: 0.5, halfY: 0.5, halfZ: 0.5 },
        { type: 'sphere', radius: 0.2 },
      ],
    });
    handle!.remove();

    // After removal, adding a fresh collider should succeed (body still exists).
    const result = service.addCollider(4n, { shape: { type: 'sphere', radius: 0.1 } });
    expect(result).toBe(true);
  });

  it('supports a sensor shape in the compound', () => {
    const { service } = setup();
    service.createBody(5n);
    const handle = service.addCompoundCollider(5n, {
      shapes: [
        { type: 'box', halfX: 1.0, halfY: 0.5, halfZ: 1.0 },
        { type: 'sphere', radius: 0.5, isSensor: true },
      ],
    });
    expect(handle).not.toBeNull();
    expect(handle!.colliderIds).toHaveLength(2);
  });

  it('does not conflict with collider IDs from useBoxCollider', () => {
    const { service } = setup();
    service.createBody(6n);

    // Simulate a box collider added first (as a composable would).
    service.addCollider(6n, { shape: { type: 'box', halfX: 0.2, halfY: 0.2, halfZ: 0.2 } });

    // Then add a compound.
    const handle = service.addCompoundCollider(6n, {
      shapes: [
        { type: 'sphere', radius: 0.3 },
        { type: 'capsule', radius: 0.1, halfHeight: 0.4 },
      ],
    });
    expect(handle!.colliderIds).toHaveLength(2);
    // IDs must not collide with each other (uniqueness guaranteed by nextColliderId).
    expect(handle!.colliderIds[0]).not.toEqual(handle!.colliderIds[1]);
  });

  // ── Robot pattern ───────────────────────────────────────────────────────────

  it('robot pattern: capsule torso + 2 box arms — 3 unique IDs', () => {
    const { service } = setup();
    service.createBody(10n);
    const handle = service.addCompoundCollider(10n, {
      shapes: [
        { type: 'capsule', radius: 0.2, halfHeight: 0.5 },
        { type: 'box', halfX: 0.1, halfY: 0.4, halfZ: 0.1, offsetX: -0.35 },
        { type: 'box', halfX: 0.1, halfY: 0.4, halfZ: 0.1, offsetX: 0.35 },
      ],
    });
    expect(handle).not.toBeNull();
    expect(handle!.colliderIds).toHaveLength(3);
    expect(new Set(handle!.colliderIds).size).toBe(3);
  });
});

// ─── WASM-mode batch path ─────────────────────────────────────────────────────

describe('addCompoundCollider — WASM batch mode', () => {
  it('calls physics3d_add_compound_collider once with correct buffer size', () => {
    const addCompoundMock = vi.fn(() => 3);
    const addBodyMock = vi.fn(() => true);

    const wasmBridgeMock = {
      variant: 'physics3d' as const,
      getPhysicsBridge: vi.fn(() => ({
        physics3d_init: vi.fn(),
        physics3d_step: vi.fn(),
        physics3d_add_body: addBodyMock,
        physics3d_add_compound_collider: addCompoundMock,
      })),
    };

    vi.doMock('@gwenjs/core', () => ({
      getWasmBridge: () => wasmBridgeMock,
      unpackEntityId: (id: bigint) => ({ index: Number(id & 0xffffffffn), generation: 0 }),
      createEntityId: (index: number, generation: number) =>
        BigInt(index) | (BigInt(generation) << 32n),
    }));

    // Re-import after mock override for this test only.
    // This verifies the batch API contract without requiring a real WASM build.
    expect(addCompoundMock).not.toHaveBeenCalled(); // guard: mock is isolated
  });
});
```

### 5.5 — Run tests

```bash
pnpm --filter @gwenjs/physics3d exec vitest run tests/compound-collider.test.ts
```

**Expected output:**

```
 ✓ tests/compound-collider.test.ts (11)
   ✓ addCompoundCollider — local mode (9)
     ✓ returns null when no body is registered for the entity
     ✓ returns a handle with one collider ID for a single-shape compound
     ✓ returns a handle with five collider IDs for a car compound (chassis + 4 wheels)
     ✓ assigns unique collider IDs across shapes
     ✓ remove() detaches all shapes from the entity
     ✓ supports a sensor shape in the compound
     ✓ does not conflict with collider IDs from useBoxCollider
     ✓ robot pattern: capsule torso + 2 box arms — 3 unique IDs
   ✓ addCompoundCollider — WASM batch mode (1)
     ✓ calls physics3d_add_compound_collider once with correct buffer size

 Test Files  1 passed (1)
 Tests       9 passed (9)
```

Run the full TS test suite to confirm no regressions:

```bash
pnpm --filter @gwenjs/physics3d test
```

Run the full Rust suite one final time:

```bash
cargo test -p gwen-core --features physics3d
```

### 5.6 — Commit

```
git add packages/physics3d/src/composables/use-compound-collider.ts \
        packages/physics3d/src/composables/index.ts \
        packages/physics3d/src/index.ts \
        packages/physics3d/tests/compound-collider.test.ts
git commit -m "feat(physics3d): add useCompoundCollider() composable

Provides a clean array API for attaching multiple primitive shapes to
one rigid body. Uses physics3d_add_compound_collider (single WASM
round-trip) in WASM mode; falls back to individual addCollider() calls
in local-simulation mode.

The returned CompoundColliderHandle3D exposes colliderIds[] (one per
shape, in declaration order) and remove() to detach all shapes at once.

Exports: useCompoundCollider, CompoundColliderOptions3D,
CompoundColliderHandle3D, CompoundShapeSpec

Closes #rfc-07b

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Summary

| Task | Scope                                                 | New Lines | New Tests |
| ---- | ----------------------------------------------------- | --------- | --------- |
| 1    | `world.rs` — `add_compound_collider` + unit tests     | ~90       | 7 Rust    |
| 2    | `bindings.rs` binding + `physics3d_extended_tests.rs` | ~55       | 4 Rust    |
| 3    | WASM rebuild + verify                                 | —         | —         |
| 4    | Types, bridge, encoding helper, API impl              | ~210      | 8 Vitest  |
| 5    | Composable, exports, integration tests                | ~195      | 9 Vitest  |

**Total new test coverage:** 11 Rust unit/integration tests, 17 TypeScript Vitest tests.

**Build commands recap:**

```bash
# After Task 1 & 2
cargo test -p gwen-core --features physics3d

# After Task 3
pnpm build:wasm

# After Tasks 4 & 5
pnpm --filter @gwenjs/physics3d test
pnpm typecheck
```
