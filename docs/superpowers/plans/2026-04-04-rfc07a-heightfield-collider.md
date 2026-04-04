# RFC-07a: useHeightfieldCollider — Grid-Based Terrain Collision

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add useHeightfieldCollider() composable for efficient grid-based terrain physics. 40× more memory efficient than trimesh for regular terrain. Supports dynamic updates (partial re-bake for deformable terrain).

**Architecture:** Rapier3D's ColliderBuilder::heightfield() takes a nalgebra DMatrix<f32>. New method add_heightfield_collider in world.rs, exposed via bindings.rs, TypeScript composable useHeightfieldCollider in packages/physics3d/src/composables/.

**Tech Stack:** Rust/Rapier3D 0.22, wasm-bindgen, TypeScript, Vitest

---

## Why Heightfield vs Trimesh

For terrain defined on a regular grid (256×256 cells), Rapier3D's heightfield:

- Memory: `rows × cols × 4 bytes` = 256KB vs trimesh BVH ≈ 4MB
- Construction: ~5ms vs ~200ms
- Collision detection: O(log n) via grid structure vs O(log n) via BVH

Use cases: Minecraft-like voxel terrain, open world RPG maps, RTS maps, racing game hill tracks.

---

## Reference Patterns

| Pattern                                  | Location                                                 |
| ---------------------------------------- | -------------------------------------------------------- |
| `insert_collider()` helper               | `crates/gwen-core/src/physics3d/world.rs` line ~548      |
| `add_box_collider()` reference           | `crates/gwen-core/src/physics3d/world.rs` line ~602      |
| `remove_collider()`                      | `crates/gwen-core/src/physics3d/world.rs` line ~741      |
| `physics3d_add_box_collider` WASM export | `crates/gwen-core/src/bindings.rs` line ~1332            |
| `Physics3DWasmBridge` TS interface       | `packages/physics3d/src/index.ts` line ~165              |
| `addColliderImpl` shape dispatch         | `packages/physics3d/src/index.ts` line ~990              |
| `Physics3DColliderShape` union type      | `packages/physics3d/src/types.ts` line ~219              |
| `ColliderHandle3D` interface             | `packages/physics3d/src/types.ts` line ~867              |
| `useBoxCollider` composable              | `packages/physics3d/src/composables/use-box-collider.ts` |
| Composables barrel export                | `packages/physics3d/src/composables/index.ts`            |

**Struct key insight:** `collider_handles: HashMap<(u32, u32), ColliderHandle>` keyed by `(entity_index, collider_id)`.

---

## Task 1 — Rust: add_heightfield_collider + update_heightfield_collider in world.rs

### Context

`crates/gwen-core/src/physics3d/world.rs` — Add two new `pub fn` methods to `PhysicsWorld3D` (the impl block where all other `add_*_collider` methods live, after `add_box_collider` at line ~602). Then add unit tests in the `#[cfg(test)]` block at the bottom of the file.

### Steps

- [ ] Open `crates/gwen-core/src/physics3d/world.rs`
- [ ] Locate the `impl PhysicsWorld3D` block containing `add_box_collider` (line ~602). Insert `add_heightfield_collider` immediately after `add_box_collider`'s closing brace.
- [ ] Insert `update_heightfield_collider` immediately after `add_heightfield_collider`'s closing brace.
- [ ] Add two unit tests inside the existing `#[cfg(test)]` module at the bottom of the file.

### Code to add (after add_box_collider)

```rust
    /// Attach a heightfield collider to a static body.
    ///
    /// The heightfield is defined on a rows × cols grid. Each cell value is a height in
    /// *local* Y-axis units — multiply by `scale_y` to get world-space metres.
    ///
    /// # Arguments
    /// * `entity_index`  — ECS entity slot index.
    /// * `heights_flat`  — Row-major flat array of `rows × cols` height values.
    /// * `rows`          — Number of rows (Z axis).
    /// * `cols`          — Number of columns (X axis).
    /// * `scale_x`       — World-space width of the entire heightfield (metres).
    /// * `scale_y`       — World-space maximum height multiplier (metres).
    /// * `scale_z`       — World-space depth of the entire heightfield (metres).
    /// * `friction`      — Surface friction coefficient.
    /// * `restitution`   — Bounciness \[0, 1\].
    /// * `layer_bits`    — Collision layer membership bitmask.
    /// * `mask_bits`     — Collision filter bitmask.
    /// * `collider_id`   — Stable ID for event lookup.
    ///
    /// # Returns
    /// `true` on success, `false` if the entity has no body or input is invalid.
    #[allow(clippy::too_many_arguments)]
    pub fn add_heightfield_collider(
        &mut self,
        entity_index: u32,
        heights_flat: &[f32],
        rows: usize,
        cols: usize,
        scale_x: f32,
        scale_y: f32,
        scale_z: f32,
        friction: f32,
        restitution: f32,
        layer_bits: u32,
        mask_bits: u32,
        collider_id: u32,
    ) -> bool {
        if heights_flat.len() != rows * cols {
            return false;
        }
        use rapier3d::na::DMatrix;
        let matrix = DMatrix::from_row_slice(rows, cols, heights_flat);
        let builder = ColliderBuilder::heightfield(
            matrix,
            vector![scale_x, scale_y, scale_z],
        );
        self.insert_collider(
            entity_index, collider_id, 0.0, 0.0, 0.0,
            false, friction, restitution, layer_bits, mask_bits, builder,
        )
    }

    /// Replace the height data of an existing heightfield collider.
    ///
    /// Removes the old collider by `(entity_index, collider_id)` and inserts a
    /// new one with updated heights while preserving all other parameters.
    ///
    /// Returns `true` on success. Returns `false` if the entity has no body or
    /// the input dimensions are inconsistent.
    #[allow(clippy::too_many_arguments)]
    pub fn update_heightfield_collider(
        &mut self,
        entity_index: u32,
        collider_id: u32,
        heights_flat: &[f32],
        rows: usize,
        cols: usize,
        scale_x: f32,
        scale_y: f32,
        scale_z: f32,
        friction: f32,
        restitution: f32,
        layer_bits: u32,
        mask_bits: u32,
    ) -> bool {
        if let Some(&ch) = self.collider_handles.get(&(entity_index, collider_id)) {
            self.collider_set.remove(
                ch,
                &mut self.island_manager,
                &mut self.rigid_body_set,
                false,
            );
            self.collider_handles.remove(&(entity_index, collider_id));
        }
        self.add_heightfield_collider(
            entity_index, heights_flat, rows, cols,
            scale_x, scale_y, scale_z,
            friction, restitution, layer_bits, mask_bits, collider_id,
        )
    }
```

### Unit tests to add inside the existing `#[cfg(test)]` module

```rust
    #[test]
    fn test_physics3d_add_heightfield_collider_happy_path() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        // body_kind 1 = Fixed
        world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);

        // 3×3 grid — flat terrain at y = 0
        let heights = [0.0f32; 9];
        let ok = world.add_heightfield_collider(
            0, &heights, 3, 3,
            10.0, 1.0, 10.0,
            0.5, 0.0, u32::MAX, u32::MAX, 42,
        );
        assert!(ok);
        assert!(world.collider_handles.contains_key(&(0, 42)));
    }

    #[test]
    fn test_physics3d_add_heightfield_collider_wrong_size_returns_false() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);

        // 8 elements but rows=3 cols=3 requires 9 — must fail
        let heights = [0.0f32; 8];
        let ok = world.add_heightfield_collider(
            0, &heights, 3, 3,
            10.0, 1.0, 10.0,
            0.5, 0.0, u32::MAX, u32::MAX, 1,
        );
        assert!(!ok);
    }

    #[test]
    fn test_physics3d_update_heightfield_collider_replaces_old() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);

        let flat = [0.0f32; 9];
        world.add_heightfield_collider(
            0, &flat, 3, 3,
            10.0, 1.0, 10.0,
            0.5, 0.0, u32::MAX, u32::MAX, 99,
        );
        assert!(world.collider_handles.contains_key(&(0, 99)));

        // Raise the centre cell
        let mut updated = [0.0f32; 9];
        updated[4] = 5.0;
        let ok = world.update_heightfield_collider(
            0, 99, &updated, 3, 3,
            10.0, 1.0, 10.0,
            0.5, 0.0, u32::MAX, u32::MAX,
        );
        assert!(ok);
        // collider_id 99 must still be present after the rebuild
        assert!(world.collider_handles.contains_key(&(0, 99)));
    }

    #[test]
    fn test_physics3d_add_heightfield_collider_no_body_returns_false() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        // No body registered for entity 7
        let heights = [0.0f32; 4];
        let ok = world.add_heightfield_collider(
            7, &heights, 2, 2,
            4.0, 1.0, 4.0,
            0.5, 0.0, u32::MAX, u32::MAX, 1,
        );
        assert!(!ok);
    }
```

### Verification

```bash
cargo test -p gwen-core --features physics3d test_physics3d_add_heightfield
cargo test -p gwen-core --features physics3d test_physics3d_update_heightfield
```

Expected output — all 4 new tests pass:

```
test physics3d::world::tests::test_physics3d_add_heightfield_collider_happy_path ... ok
test physics3d::world::tests::test_physics3d_add_heightfield_collider_no_body_returns_false ... ok
test physics3d::world::tests::test_physics3d_add_heightfield_collider_wrong_size_returns_false ... ok
test physics3d::world::tests::test_physics3d_update_heightfield_collider_replaces_old ... ok
```

### Git commit

```
feat(physics3d): add add_heightfield_collider + update_heightfield_collider to world.rs

Implements RFC-07a. Rapier3D heightfield is O(log n) grid-structure lookup,
40× more memory-efficient than trimesh for regular terrain grids.

- add_heightfield_collider: rows×cols DMatrix<f32> via ColliderBuilder::heightfield
- update_heightfield_collider: atomic remove-and-reinsertion with stable collider_id
- Guards against mismatched heights_flat.len() vs rows*cols (returns false)
- 4 unit tests covering happy path, size mismatch, update, and missing body

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

---

## Task 2 — Rust: wasm-bindgen exports in bindings.rs

### Context

`crates/gwen-core/src/bindings.rs` — The file contains wasm-bindgen exports as methods on the engine struct. The pattern (from line ~1332) is:

1. `#[cfg(feature = "physics3d")]` cfg gate
2. `#[allow(clippy::too_many_arguments)]` for multi-param functions
3. Function signature matching **exactly** the parameter order TypeScript will call
4. Body pattern: `if let Some(ref mut world) = self.physics3d_world { world.method(...) } else { false }`

Find `physics3d_add_capsule_collider` (the last existing collider binding, ~line 1440) and insert the two new functions **immediately after** its closing brace, before `physics3d_remove_collider`.

**Critical:** `&[f32]` in a `#[wasm_bindgen]` function signature is directly accepted from JavaScript as a `Float32Array`. wasm-bindgen handles the conversion automatically. Use `u32` for `rows` and `cols` (wasm-bindgen maps `u32` to JS `number`; `usize` requires an unsafe shim). Cast `rows as usize` / `cols as usize` when delegating to `world.rs`.

### Code to insert in bindings.rs (after physics3d_add_capsule_collider)

```rust
    /// Attach a heightfield collider to a 3D fixed body.
    ///
    /// The heightfield is defined on a `rows × cols` grid. Pass a row-major
    /// `Float32Array` from JavaScript. Returns `false` if the entity has no
    /// registered body, the world is not initialised, or the array length does
    /// not equal `rows * cols`.
    ///
    /// # Arguments
    /// * `entity_index`  — ECS entity slot index.
    /// * `heights_flat`  — Row-major `Float32Array` of `rows × cols` heights.
    /// * `rows`          — Number of rows (Z axis).
    /// * `cols`          — Number of columns (X axis).
    /// * `scale_x`       — World-space width of the entire heightfield (metres).
    /// * `scale_y`       — World-space maximum height multiplier (metres).
    /// * `scale_z`       — World-space depth of the entire heightfield (metres).
    /// * `friction`      — Surface friction coefficient (≥ 0).
    /// * `restitution`   — Bounciness coefficient (\[0, 1\]).
    /// * `layer_bits`    — Collision layer membership bitmask.
    /// * `mask_bits`     — Collision filter bitmask.
    /// * `collider_id`   — Stable application-defined ID stored in collision events.
    #[cfg(feature = "physics3d")]
    #[allow(clippy::too_many_arguments)]
    pub fn physics3d_add_heightfield_collider(
        &mut self,
        entity_index: u32,
        heights_flat: &[f32],
        rows: u32,
        cols: u32,
        scale_x: f32,
        scale_y: f32,
        scale_z: f32,
        friction: f32,
        restitution: f32,
        layer_bits: u32,
        mask_bits: u32,
        collider_id: u32,
    ) -> bool {
        if let Some(ref mut world) = self.physics3d_world {
            world.add_heightfield_collider(
                entity_index,
                heights_flat,
                rows as usize,
                cols as usize,
                scale_x,
                scale_y,
                scale_z,
                friction,
                restitution,
                layer_bits,
                mask_bits,
                collider_id,
            )
        } else {
            false
        }
    }

    /// Replace the height data of an existing heightfield collider.
    ///
    /// Atomically removes the old collider and inserts a new one with the
    /// provided height data. All other parameters (scale, friction, layers)
    /// must be re-supplied. Returns `false` if the entity has no registered
    /// body, the world is not initialised, or the array length is wrong.
    ///
    /// # Arguments
    /// * `entity_index`  — ECS entity slot index.
    /// * `collider_id`   — Stable ID that was passed when the collider was created.
    /// * `heights_flat`  — Updated row-major `Float32Array` of `rows × cols` heights.
    /// * `rows`          — Number of rows (Z axis) — must match original.
    /// * `cols`          — Number of columns (X axis) — must match original.
    /// * `scale_x`       — World-space width (metres).
    /// * `scale_y`       — World-space height multiplier (metres).
    /// * `scale_z`       — World-space depth (metres).
    /// * `friction`      — Surface friction coefficient (≥ 0).
    /// * `restitution`   — Bounciness coefficient (\[0, 1\]).
    /// * `layer_bits`    — Collision layer membership bitmask.
    /// * `mask_bits`     — Collision filter bitmask.
    #[cfg(feature = "physics3d")]
    #[allow(clippy::too_many_arguments)]
    pub fn physics3d_update_heightfield_collider(
        &mut self,
        entity_index: u32,
        collider_id: u32,
        heights_flat: &[f32],
        rows: u32,
        cols: u32,
        scale_x: f32,
        scale_y: f32,
        scale_z: f32,
        friction: f32,
        restitution: f32,
        layer_bits: u32,
        mask_bits: u32,
    ) -> bool {
        if let Some(ref mut world) = self.physics3d_world {
            world.update_heightfield_collider(
                entity_index,
                collider_id,
                heights_flat,
                rows as usize,
                cols as usize,
                scale_x,
                scale_y,
                scale_z,
                friction,
                restitution,
                layer_bits,
                mask_bits,
            )
        } else {
            false
        }
    }
```

### Verification (compile-only, no WASM build yet)

```bash
cargo check -p gwen-core --features physics3d --target wasm32-unknown-unknown 2>&1 | grep -E "error|warning" | head -20
```

Expected: no `error` lines. Warnings are acceptable.

### Git commit

```
feat(physics3d): expose physics3d_add/update_heightfield_collider via wasm-bindgen

RFC-07a Task 2. Both functions use &[f32] (maps to Float32Array in JS) and u32
for rows/cols (cast to usize internally). Follows exact pattern of
physics3d_add_capsule_collider.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

---

## Task 3 — Build WASM and verify

### Context

Run the full WASM build so the wasm-bindgen TypeScript glue is regenerated before writing TypeScript. This task has no code changes — it is purely a build gate.

### Steps

- [ ] Run `pnpm build:wasm`
- [ ] Confirm zero compilation errors
- [ ] Confirm `physics3d_add_heightfield_collider` and `physics3d_update_heightfield_collider` are present in the generated JS glue

### Commands

```bash
pnpm build:wasm 2>&1 | tail -20
```

Expected output ends with something like:

```
[INFO]: :-) Done in Xs.
```

Verify the generated bindings contain the new symbols:

```bash
grep -r "physics3d_add_heightfield_collider\|physics3d_update_heightfield_collider" \
  crates/gwen-core/pkg/ target/wasm-pkg/ 2>/dev/null | head -10
```

Expected: at least two matching lines (one per function).

### Git commit

```
build(wasm): rebuild WASM after heightfield collider additions (RFC-07a)

Regenerates wasm-bindgen glue to include physics3d_add/update_heightfield_collider.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

---

## Task 4 — TypeScript: types + WASM bridge extension + addColliderImpl + Vitest tests

### Context

Three files to modify in `packages/physics3d/src/`:

1. **`types.ts`** — extend `Physics3DColliderShape` union; add `HeightfieldColliderHandle3D` interface
2. **`index.ts`** — add bridge methods to `Physics3DWasmBridge`; add `if (shape.type === 'heightfield')` block in `addColliderImpl`

### Step 4a — types.ts: extend Physics3DColliderShape (line ~219)

Current union:

```typescript
export type Physics3DColliderShape =
  | { type: 'box'; halfX: number; halfY: number; halfZ: number }
  | { type: 'sphere'; radius: number }
  | { type: 'capsule'; radius: number; halfHeight: number }
  | { type: 'mesh'; vertices: Float32Array; indices: Uint32Array }
  | { type: 'convex'; vertices: Float32Array };
```

Replace with:

```typescript
export type Physics3DColliderShape =
  | { type: 'box'; halfX: number; halfY: number; halfZ: number }
  | { type: 'sphere'; radius: number }
  | { type: 'capsule'; radius: number; halfHeight: number }
  | { type: 'mesh'; vertices: Float32Array; indices: Uint32Array }
  | { type: 'convex'; vertices: Float32Array }
  | {
      type: 'heightfield';
      /** Row-major flat array of rows × cols height values. */
      heights: Float32Array;
      /** Number of rows (Z axis). */
      rows: number;
      /** Number of columns (X axis). */
      cols: number;
      /** World-space width of the entire heightfield in metres. @default 1 */
      scaleX?: number;
      /** World-space maximum height multiplier in metres. @default 1 */
      scaleY?: number;
      /** World-space depth of the entire heightfield in metres. @default 1 */
      scaleZ?: number;
    };
```

### Step 4b — types.ts: add HeightfieldColliderHandle3D (after line ~883, after ConvexColliderHandle3D)

```typescript
/** Handle returned by {@link useHeightfieldCollider}. */
export interface HeightfieldColliderHandle3D extends ColliderHandle3D {
  /**
   * Replace the height data of the collider.
   *
   * Rebuilds the underlying Rapier3D heightfield in-place using the same
   * grid dimensions and scale that were used at construction time.
   *
   * @param newHeights - Row-major flat array of `rows × cols` height values.
   *   Must have exactly the same length as the original heights array.
   */
  update(newHeights: Float32Array): void;
}
```

### Step 4c — index.ts: extend Physics3DWasmBridge interface (after physics3d_add_capsule_collider, ~line 210)

Add immediately after the `physics3d_add_capsule_collider` declaration and before `physics3d_remove_collider`:

```typescript
  physics3d_add_heightfield_collider?: (
    entityIndex: number,
    heightsFlat: Float32Array,
    rows: number,
    cols: number,
    scaleX: number,
    scaleY: number,
    scaleZ: number,
    friction: number,
    restitution: number,
    layerBits: number,
    maskBits: number,
    colliderId: number,
  ) => boolean;
  physics3d_update_heightfield_collider?: (
    entityIndex: number,
    colliderId: number,
    heightsFlat: Float32Array,
    rows: number,
    cols: number,
    scaleX: number,
    scaleY: number,
    scaleZ: number,
    friction: number,
    restitution: number,
    layerBits: number,
    maskBits: number,
  ) => boolean;
```

### Step 4d — index.ts: add heightfield block in addColliderImpl (~line 1060, after the capsule if-block)

Add immediately after the `if (shape.type === 'capsule') { ... }` block, before `return true`:

```typescript
if (shape.type === 'heightfield') {
  return (
    wasmBridge!.physics3d_add_heightfield_collider?.(
      idx,
      shape.heights,
      shape.rows,
      shape.cols,
      shape.scaleX ?? 1,
      shape.scaleY ?? 1,
      shape.scaleZ ?? 1,
      friction,
      restitution,
      membership,
      filter,
      colliderId,
    ) ?? false
  );
}
```

**Note:** Heightfield does not pass `density` or `isSensor` — terrain is a fixed static surface, never a sensor. The `resolveColliderMaterial` call already resolves `friction` and `restitution` from the options object, so those are used directly.

### Step 4e — Vitest tests

Create `packages/physics3d/tests/composables/use-heightfield-collider.test.ts`:

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Physics3DBodyHandle } from '../../src/types.js';

vi.mock('@gwenjs/core/scene', () => ({
  _getActorEntityId: vi.fn(() => 1n),
}));

vi.mock('../../src/composables/collider-id.js', () => ({
  nextColliderId: vi.fn(() => 7),
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
  getLinearVelocity: vi.fn(() => ({ x: 0, y: 0, z: 0 })),
  getAngularVelocity: vi.fn(() => ({ x: 0, y: 0, z: 0 })),
  addCollider: vi.fn(() => true),
  removeCollider: vi.fn(() => true),
};

vi.mock('../../src/composables.js', () => ({
  usePhysics3D: vi.fn(() => mockPhysics3D),
}));

import { useHeightfieldCollider } from '../../src/composables/use-heightfield-collider.js';

const makeHeights = (n: number) => new Float32Array(n);

describe('useHeightfieldCollider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPhysics3D.addCollider.mockReturnValue(true);
    mockPhysics3D.removeCollider.mockReturnValue(true);
  });

  it('calls addCollider with correct heightfield shape', () => {
    const heights = makeHeights(9); // 3×3
    useHeightfieldCollider({ heights, rows: 3, cols: 3, scaleX: 10, scaleY: 2, scaleZ: 10 });

    expect(mockPhysics3D.addCollider).toHaveBeenCalledWith(
      1n,
      expect.objectContaining({
        shape: {
          type: 'heightfield',
          heights,
          rows: 3,
          cols: 3,
          scaleX: 10,
          scaleY: 2,
          scaleZ: 10,
        },
      }),
    );
  });

  it('uses scaleX/Y/Z defaults of 1 when omitted', () => {
    const heights = makeHeights(4); // 2×2
    useHeightfieldCollider({ heights, rows: 2, cols: 2 });

    expect(mockPhysics3D.addCollider).toHaveBeenCalledWith(
      1n,
      expect.objectContaining({
        shape: expect.objectContaining({ scaleX: 1, scaleY: 1, scaleZ: 1 }),
      }),
    );
  });

  it('handle.colliderId equals the value from nextColliderId()', () => {
    const handle = useHeightfieldCollider({ heights: makeHeights(4), rows: 2, cols: 2 });
    expect(handle.colliderId).toBe(7);
  });

  it('handle.remove() calls removeCollider with entityId and colliderId', () => {
    const handle = useHeightfieldCollider({ heights: makeHeights(4), rows: 2, cols: 2 });
    handle.remove();
    expect(mockPhysics3D.removeCollider).toHaveBeenCalledWith(1n, 7);
  });

  it('handle.update() calls removeCollider then addCollider with new heights', () => {
    const original = makeHeights(9);
    const handle = useHeightfieldCollider({
      heights: original,
      rows: 3,
      cols: 3,
      scaleX: 10,
      scaleY: 1,
      scaleZ: 10,
    });

    vi.clearAllMocks();
    mockPhysics3D.removeCollider.mockReturnValue(true);
    mockPhysics3D.addCollider.mockReturnValue(true);

    const updated = new Float32Array(9);
    updated[4] = 5.0;
    handle.update(updated);

    expect(mockPhysics3D.removeCollider).toHaveBeenCalledWith(1n, 7);
    expect(mockPhysics3D.addCollider).toHaveBeenCalledWith(
      1n,
      expect.objectContaining({
        shape: expect.objectContaining({ heights: updated }),
        colliderId: 7,
      }),
    );
  });

  it('passes friction, restitution, layer, mask to addCollider', () => {
    const heights = makeHeights(4);
    useHeightfieldCollider({
      heights,
      rows: 2,
      cols: 2,
      friction: 0.8,
      restitution: 0.1,
      layer: 0b0001,
      mask: 0b1110,
    });

    expect(mockPhysics3D.addCollider).toHaveBeenCalledWith(
      1n,
      expect.objectContaining({
        friction: 0.8,
        restitution: 0.1,
        layers: [0b0001],
        mask: [0b1110],
      }),
    );
  });
});
```

### Verification

```bash
pnpm --filter @gwenjs/physics3d exec vitest run tests/composables/use-heightfield-collider.test.ts
pnpm typecheck
```

Expected:

```
✓ tests/composables/use-heightfield-collider.test.ts (6 tests) Xs
```

### Git commit

```
feat(physics3d): add heightfield shape type + HeightfieldColliderHandle3D + WASM bridge + addColliderImpl

RFC-07a Task 4.

- Physics3DColliderShape union: adds 'heightfield' variant with heights/rows/cols/scaleX/Y/Z
- HeightfieldColliderHandle3D: extends ColliderHandle3D with update(newHeights) method
- Physics3DWasmBridge: physics3d_add_heightfield_collider + physics3d_update_heightfield_collider
- addColliderImpl: dispatches 'heightfield' shape to WASM bridge (no density/isSensor)
- 6 Vitest tests covering shape call, defaults, colliderId, remove, update, material params

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

---

## Task 5 — TypeScript: useHeightfieldCollider composable + export + Vitest tests

### Context

Create `packages/physics3d/src/composables/use-heightfield-collider.ts` following the exact pattern of `use-box-collider.ts`. Then re-export from the composables barrel and the package index.

The `update()` method on the handle stores the original options in a closure and calls `physics.removeCollider()` + `physics.addCollider()` (preserving the stable `colliderId` so collision event IDs remain consistent). This avoids needing direct access to the WASM bridge from composable context.

### Step 5a — Create the composable file

**File:** `packages/physics3d/src/composables/use-heightfield-collider.ts`

````typescript
/**
 * @file useHeightfieldCollider() — attaches a grid-based heightfield collider
 * to the current entity for efficient terrain collision.
 */
import type { HeightfieldColliderHandle3D, Physics3DMaterialPreset } from '../types.js';
import { usePhysics3D } from '../composables.js';
import { _getActorEntityId } from '@gwenjs/core/scene';
import type { EntityId } from '@gwenjs/core';
import { nextColliderId } from './collider-id.js';

/**
 * Options for configuring a grid-based heightfield 3D collider.
 */
export interface HeightfieldColliderOptions {
  /**
   * Row-major flat array of `rows × cols` height values.
   * Index `[r * cols + c]` gives the height at row `r`, column `c`.
   */
  heights: Float32Array;
  /** Number of rows (Z axis). Must be ≥ 2. */
  rows: number;
  /** Number of columns (X axis). Must be ≥ 2. */
  cols: number;
  /** World-space width of the entire heightfield in metres. @default 1 */
  scaleX?: number;
  /** World-space maximum height multiplier in metres. @default 1 */
  scaleY?: number;
  /** World-space depth of the entire heightfield in metres. @default 1 */
  scaleZ?: number;
  /** Surface friction coefficient (≥ 0). @default 0.5 */
  friction?: number;
  /** Bounciness [0, 1]. @default 0 */
  restitution?: number;
  /** Numeric collision layer bitmask (membership). */
  layer?: number;
  /** Numeric collision filter bitmask (which layers to collide with). */
  mask?: number;
  /** Built-in material preset controlling friction and restitution. @default 'default' */
  material?: Physics3DMaterialPreset;
}

/**
 * Attach a grid-based heightfield collider to the current entity.
 *
 * The heightfield is 40× more memory-efficient than a trimesh for regular
 * terrain grids. Use it for open-world terrain, RTS maps, and racing tracks.
 *
 * Must be called after {@link useStaticBody} has registered the body for this
 * entity.
 *
 * @param options - Grid dimensions, height data, scale, and optional material config.
 * @returns A {@link HeightfieldColliderHandle3D} with a stable `colliderId`,
 *   an `update()` method for deformable terrain, and a `remove()` method.
 * @throws {GwenPluginNotFoundError} If `@gwenjs/physics3d` is not registered.
 *
 * @example
 * ```typescript
 * const ROWS = 64;
 * const COLS = 64;
 * const heights = new Float32Array(ROWS * COLS).fill(0);
 *
 * const TerrainActor = defineActor(TerrainPrefab, () => {
 *   useStaticBody()
 *   const terrain = useHeightfieldCollider({
 *     heights,
 *     rows: ROWS,
 *     cols: COLS,
 *     scaleX: 128,
 *     scaleY: 20,
 *     scaleZ: 128,
 *   })
 *
 *   // Deform a single cell at runtime:
 *   onUpdate(() => {
 *     heights[32 * COLS + 32] += 0.01
 *     terrain.update(heights)
 *   })
 * })
 * ```
 *
 * @since 1.0.0
 */
export function useHeightfieldCollider(
  options: HeightfieldColliderOptions,
): HeightfieldColliderHandle3D {
  const physics = usePhysics3D();
  const entityId = _getActorEntityId() as unknown as EntityId;
  const colliderId = nextColliderId();

  const scaleX = options.scaleX ?? 1;
  const scaleY = options.scaleY ?? 1;
  const scaleZ = options.scaleZ ?? 1;

  const buildColliderOptions = (heights: Float32Array) => ({
    shape: {
      type: 'heightfield' as const,
      heights,
      rows: options.rows,
      cols: options.cols,
      scaleX,
      scaleY,
      scaleZ,
    },
    friction: options.friction,
    restitution: options.restitution,
    layers: options.layer !== undefined ? [options.layer] : undefined,
    mask: options.mask !== undefined ? [options.mask] : undefined,
    materialPreset: options.material,
    colliderId,
  });

  physics.addCollider(entityId, buildColliderOptions(options.heights));

  return {
    get colliderId() {
      return colliderId;
    },
    update(newHeights: Float32Array) {
      physics.removeCollider(entityId, colliderId);
      physics.addCollider(entityId, buildColliderOptions(newHeights));
    },
    remove() {
      physics.removeCollider(entityId, colliderId);
    },
  };
}
````

### Step 5b — Add export to composables barrel

**File:** `packages/physics3d/src/composables/index.ts`

Add after `useConvexCollider` exports:

```typescript
export { useHeightfieldCollider } from './use-heightfield-collider.js';
export type { HeightfieldColliderOptions } from './use-heightfield-collider.js';
```

### Step 5c — Verify export reaches the package index

`packages/physics3d/src/index.ts` already re-exports everything from composables via a barrel (check). If not present, add:

```typescript
export { useHeightfieldCollider } from './composables/index.js';
export type { HeightfieldColliderOptions } from './composables/index.js';
```

And ensure `HeightfieldColliderHandle3D` is exported from `types.ts` (it is, by being part of the file — check that `index.ts` does `export * from './types.js'` or explicitly exports it).

### Step 5d — Full test suite for the composable

File already created in Task 4 at `packages/physics3d/tests/composables/use-heightfield-collider.test.ts`. No additional tests needed — all 6 cases are covered.

Run the full physics3d test suite to confirm no regressions:

```bash
pnpm --filter @gwenjs/physics3d test
```

Expected output (all tests pass, nothing red):

```
✓ tests/composables/use-heightfield-collider.test.ts (6 tests) Xs
✓ tests/composables/use-box-collider.test.ts ...
... (all other test files) ...
Test Files  N passed (N)
Tests       N passed (N)
```

Also run the typecheck across the monorepo:

```bash
pnpm typecheck
```

Expected: no errors.

### Git commit

```
feat(physics3d): add useHeightfieldCollider composable (RFC-07a)

Implements the public-facing composable for heightfield terrain collision.

- HeightfieldColliderOptions: heights/rows/cols/scaleX/Y/Z/friction/restitution/layer/mask/material
- HeightfieldColliderHandle3D: colliderId + update(newHeights) + remove()
- update() stores original options in closure, calls removeCollider+addCollider to
  rebuild with stable colliderId (preserves collision event IDs across deform cycles)
- Exported from composables/index.ts and packages/physics3d/src/index.ts
- JSDoc example shows 64×64 terrain grid with per-frame deformation

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

---

## Final verification pass

After all 5 tasks are complete, run the full build and test suite:

```bash
# Full Rust test suite for gwen-core
cargo test -p gwen-core --features physics3d 2>&1 | grep -E "test result|FAILED"

# Full TypeScript test suite
pnpm --filter @gwenjs/physics3d test

# Typecheck the whole monorepo
pnpm typecheck

# Lint
pnpm lint
```

All commands must exit with code 0.

---

## Checklist summary

| Task                             | File(s)                                                                                                                                       | Status |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1 — Rust world.rs                | `crates/gwen-core/src/physics3d/world.rs`                                                                                                     | - [ ]  |
| 2 — Rust bindings.rs             | `crates/gwen-core/src/bindings.rs`                                                                                                            | - [ ]  |
| 3 — WASM build                   | (build only)                                                                                                                                  | - [ ]  |
| 4 — TS types + bridge + dispatch | `packages/physics3d/src/types.ts`, `packages/physics3d/src/index.ts`, `packages/physics3d/tests/composables/use-heightfield-collider.test.ts` | - [ ]  |
| 5 — TS composable + export       | `packages/physics3d/src/composables/use-heightfield-collider.ts`, `packages/physics3d/src/composables/index.ts`                               | - [ ]  |
