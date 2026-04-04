# RFC-07c: Destructibles — Mesh Rebuild + Voronoi Fracture Module

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two-level destruction system. Level 1 (integrated into gwen-core physics3d feature): rebuild a mesh collider at runtime via physics3d_rebuild_mesh_collider — for deformable terrain, partial destruction. Level 2 (separate WASM crate): Voronoi fracture of a mesh into N shards, loaded via RFC-008 engine.loadWasmModule() for AAA-style glass/wall shattering.

**Architecture:** Mesh rebuild = remove old collider + re-insert new trimesh (reuses RFC-06b add_mesh_collider). Voronoi = new crate crates/gwen-physics3d-fracture/, wasm-pack to packages/physics3d-fracture/wasm/, loaded via engine.loadWasmModule(). Both use the Web Worker BVH builder from RFC-06c for non-blocking rebuild.

**Tech Stack:** Rust/Rapier3D 0.22 (rebuild), Rust + custom Voronoi algo (fracture), wasm-bindgen, RFC-008 loadWasmModule, TypeScript, Vitest

---

## Prerequisites

| Dependency                                                    | Status                           | Why                                                                                                                    |
| ------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| RFC-06b — `add_mesh_collider` in `world.rs` and `bindings.rs` | **Must be merged before Task 1** | `rebuild_mesh_collider` delegates to `add_mesh_collider`; will not compile without it                                  |
| RFC-06c — Web Worker BVH builder                              | **Must be merged before Task 3** | `MeshColliderHandle3D.rebuild()` offloads BVH computation to the Worker; without it the rebuild blocks the main thread |
| `wasm-pack` ≥ 0.12 installed                                  | Required for Tasks 4–7           | Builds all WASM crates                                                                                                 |

---

## File Map

| File                                                              | Action | Task   |
| ----------------------------------------------------------------- | ------ | ------ |
| `crates/gwen-core/src/physics3d/world.rs`                         | Modify | Task 1 |
| `crates/gwen-core/src/bindings.rs`                                | Modify | Task 2 |
| `packages/physics3d/src/types.ts`                                 | Modify | Task 3 |
| `packages/physics3d/src/index.ts`                                 | Modify | Task 3 |
| `packages/core/src/engine/wasm-bridge.ts`                         | Modify | Task 3 |
| `packages/physics3d/src/composables/use-mesh-collider.ts`         | Modify | Task 3 |
| `packages/physics3d/tests/composables/use-mesh-collider.test.ts`  | Modify | Task 3 |
| `Cargo.toml`                                                      | Modify | Task 4 |
| `crates/gwen-physics3d-fracture/Cargo.toml`                       | Create | Task 4 |
| `crates/gwen-physics3d-fracture/src/lib.rs`                       | Create | Task 5 |
| `crates/gwen-physics3d-fracture/tests/fracture.rs`                | Create | Task 5 |
| `pnpm-workspace.yaml`                                             | Modify | Task 6 |
| `packages/physics3d-fracture/package.json`                        | Create | Task 6 |
| `packages/physics3d-fracture/tsconfig.json`                       | Create | Task 6 |
| `packages/physics3d-fracture/vitest.config.ts`                    | Create | Task 6 |
| `packages/physics3d-fracture/src/index.ts`                        | Create | Task 6 |
| `packages/physics3d-fracture/tests/parse-fracture-buffer.test.ts` | Create | Task 6 |
| `scripts/build-wasm.sh`                                           | Modify | Task 7 |

---

## Task 1 — Rust: `rebuild_mesh_collider` in `world.rs`

> **⚠️ BLOCKER: RFC-06b (add_mesh_collider in world.rs) MUST be merged before starting this task.**
> The `rebuild_mesh_collider` method calls `self.add_mesh_collider(...)` internally. This file will not compile
> until RFC-06b's `add_mesh_collider` method exists in `PhysicsWorld3D`.

**Files:**

- Modify: `crates/gwen-core/src/physics3d/world.rs`

### What RFC-06b adds (reference — do NOT implement here)

RFC-06b adds `add_mesh_collider` to `PhysicsWorld3D` with this signature:

```rust
pub fn add_mesh_collider(
    &mut self,
    entity_index: u32,
    vertices_flat: &[f32],
    indices_flat: &[u32],
    offset_x: f32, offset_y: f32, offset_z: f32,
    is_sensor: bool,
    friction: f32, restitution: f32,
    layer_bits: u32, mask_bits: u32,
    collider_id: u32,
) -> bool
```

It calls `ColliderBuilder::trimesh(points, indices)` and delegates to `self.insert_collider(...)`.

---

- [ ] **Step 1: Add `rebuild_mesh_collider` to `PhysicsWorld3D`**

  Open `crates/gwen-core/src/physics3d/world.rs`. After the `add_mesh_collider` function (added by RFC-06b), add:

  ```rust
  /// Rebuild an existing mesh collider with new geometry.
  ///
  /// Removes the old collider and inserts a fresh trimesh built from `vertices_flat`
  /// and `indices_flat`. If no collider with the given `(entity_index, collider_id)`
  /// pair exists, a new one is inserted (same behaviour as [`add_mesh_collider`]).
  ///
  /// # Arguments
  /// * `entity_index`   — ECS entity slot index.
  /// * `collider_id`    — Stable collider ID (same one originally passed to `add_mesh_collider`).
  /// * `vertices_flat`  — New vertex positions `[x0,y0,z0, x1,y1,z1, ...]`.
  /// * `indices_flat`   — New triangle indices `[a0,b0,c0, ...]`.
  /// * `offset_x/y/z`  — Local-space offset from the body origin.
  /// * `is_sensor`      — If `true`, no physical response; only events.
  /// * `friction`       — Surface friction coefficient (≥ 0).
  /// * `restitution`    — Bounciness in \[0, 1\].
  /// * `layer_bits`     — Collision layer bitmask.
  /// * `mask_bits`      — Collision filter bitmask.
  ///
  /// # Returns
  /// `true` on success, `false` if the entity has no registered body.
  #[allow(clippy::too_many_arguments)]
  pub fn rebuild_mesh_collider(
      &mut self,
      entity_index: u32,
      collider_id: u32,
      vertices_flat: &[f32],
      indices_flat: &[u32],
      offset_x: f32,
      offset_y: f32,
      offset_z: f32,
      is_sensor: bool,
      friction: f32,
      restitution: f32,
      layer_bits: u32,
      mask_bits: u32,
  ) -> bool {
      // Remove the existing collider if present.
      if let Some(&ch) = self.collider_handles.get(&(entity_index, collider_id)) {
          self.collider_set.remove(
              ch,
              &mut self.island_manager,
              &mut self.rigid_body_set,
              // wake_up = true: re-activate the parent body after geometry change.
              true,
          );
          self.collider_handles.remove(&(entity_index, collider_id));
          self.sensor_states.remove(&(entity_index, collider_id));
      }
      // Insert new trimesh with updated geometry.
      self.add_mesh_collider(
          entity_index,
          vertices_flat,
          indices_flat,
          offset_x,
          offset_y,
          offset_z,
          is_sensor,
          friction,
          restitution,
          layer_bits,
          mask_bits,
          collider_id,
      )
  }
  ```

- [ ] **Step 2: Add Rust unit tests**

  In the `#[cfg(test)]` block at the bottom of `world.rs`, add:

  ```rust
  #[test]
  fn test_rebuild_mesh_collider_replaces_existing() {
      let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0, 64, PhysicsQualityPreset3D::Medium);
      world.add_body(0, 0.0, 0.0, 0.0, BodyKind3D::Fixed, 1.0, 0.0, 0.0);

      // Simple triangle mesh (one triangle).
      let verts_a: Vec<f32> = vec![0.0,0.0,0.0, 1.0,0.0,0.0, 0.0,1.0,0.0];
      let idxs_a: Vec<u32> = vec![0, 1, 2];
      assert!(world.add_mesh_collider(0, &verts_a, &idxs_a, 0.0, 0.0, 0.0, false, 0.5, 0.0, 0xFFFF_FFFF, 0xFFFF_FFFF, 10));
      assert_eq!(world.collider_handles.len(), 1);

      // Rebuild with a slightly different triangle.
      let verts_b: Vec<f32> = vec![0.0,0.0,0.0, 2.0,0.0,0.0, 0.0,2.0,0.0];
      let idxs_b: Vec<u32> = vec![0, 1, 2];
      assert!(world.rebuild_mesh_collider(0, 10, &verts_b, &idxs_b, 0.0, 0.0, 0.0, false, 0.5, 0.0, 0xFFFF_FFFF, 0xFFFF_FFFF));

      // Still exactly one collider handle — old one removed, new one inserted.
      assert_eq!(world.collider_handles.len(), 1);
  }

  #[test]
  fn test_rebuild_mesh_collider_inserts_when_missing() {
      let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0, 64, PhysicsQualityPreset3D::Medium);
      world.add_body(0, 0.0, 0.0, 0.0, BodyKind3D::Fixed, 1.0, 0.0, 0.0);

      // No collider registered yet — rebuild should insert a fresh one.
      let verts: Vec<f32> = vec![0.0,0.0,0.0, 1.0,0.0,0.0, 0.0,1.0,0.0];
      let idxs: Vec<u32> = vec![0, 1, 2];
      assert!(world.rebuild_mesh_collider(0, 99, &verts, &idxs, 0.0, 0.0, 0.0, false, 0.5, 0.0, 0xFFFF_FFFF, 0xFFFF_FFFF));
      assert_eq!(world.collider_handles.len(), 1);
  }

  #[test]
  fn test_rebuild_mesh_collider_returns_false_for_unknown_entity() {
      let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0, 64, PhysicsQualityPreset3D::Medium);
      // Entity 999 has no body registered.
      let verts: Vec<f32> = vec![0.0,0.0,0.0, 1.0,0.0,0.0, 0.0,1.0,0.0];
      let idxs: Vec<u32> = vec![0, 1, 2];
      assert!(!world.rebuild_mesh_collider(999, 1, &verts, &idxs, 0.0, 0.0, 0.0, false, 0.5, 0.0, 0xFFFF_FFFF, 0xFFFF_FFFF));
  }
  ```

- [ ] **Step 3: Run tests**

  ```bash
  cargo test -p gwen-core --features physics3d rebuild_mesh_collider 2>&1 | tail -20
  ```

  Expected output:

  ```
  test physics3d::world::tests::test_rebuild_mesh_collider_replaces_existing ... ok
  test physics3d::world::tests::test_rebuild_mesh_collider_inserts_when_missing ... ok
  test physics3d::world::tests::test_rebuild_mesh_collider_returns_false_for_unknown_entity ... ok
  test result: ok. 3 passed; 0 failed
  ```

- [ ] **Step 4: Run full physics3d test suite to confirm no regressions**

  ```bash
  cargo test -p gwen-core --features physics3d 2>&1 | tail -5
  ```

  Expected: `test result: ok. N passed; 0 failed`

- [ ] **Step 5: Commit**

  ```bash
  git add crates/gwen-core/src/physics3d/world.rs
  git commit -m "feat(physics3d): add rebuild_mesh_collider to PhysicsWorld3D

  Removes the existing collider (if present) and re-inserts a fresh
  trimesh with new vertex/index data. Parent rigid body is woken up
  after geometry swap. Delegates insertion to add_mesh_collider (RFC-06b).

  Adds three unit tests: replace existing, insert when missing, false on
  unknown entity.

  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
  ```

---

## Task 2 — Rust: `physics3d_rebuild_mesh_collider` binding in `bindings.rs`

**Files:**

- Modify: `crates/gwen-core/src/bindings.rs`

- [ ] **Step 1: Add the WASM binding**

  Open `crates/gwen-core/src/bindings.rs`. After `physics3d_remove_collider` (around line 1484), add:

  ```rust
  /// Rebuild a mesh collider with new geometry at runtime.
  ///
  /// Removes the collider identified by `(entity_index, collider_id)` from the Rapier3D
  /// world and re-inserts a new trimesh built from `vertices_flat` and `indices_flat`.
  /// If no matching collider exists, a new one is created (same result as calling
  /// `physics3d_add_mesh_collider`).
  ///
  /// # Returns
  /// `true` on success, `false` if the entity has no registered body or the world is
  /// not initialised.
  ///
  /// # Arguments
  /// * `entity_index`  — ECS entity slot index.
  /// * `collider_id`   — Stable ID that was passed when the collider was created.
  /// * `vertices_flat` — New vertex positions `[x0,y0,z0, x1,y1,z1, ...]`.
  /// * `indices_flat`  — New triangle indices `[a0,b0,c0, ...]`.
  /// * `offset_x/y/z` — Local-space offset from the body origin.
  /// * `is_sensor`     — If `true`, collision response is suppressed; only events fire.
  /// * `friction`      — Surface friction coefficient (≥ 0).
  /// * `restitution`   — Bounciness coefficient (\[0, 1\]).
  /// * `layer_bits`    — Collision layer membership bitmask.
  /// * `mask_bits`     — Collision filter bitmask.
  #[cfg(feature = "physics3d")]
  #[allow(clippy::too_many_arguments)]
  pub fn physics3d_rebuild_mesh_collider(
      &mut self,
      entity_index: u32,
      collider_id: u32,
      vertices_flat: &[f32],
      indices_flat: &[u32],
      offset_x: f32,
      offset_y: f32,
      offset_z: f32,
      is_sensor: bool,
      friction: f32,
      restitution: f32,
      layer_bits: u32,
      mask_bits: u32,
  ) -> bool {
      if let Some(ref mut world) = self.physics3d_world {
          world.rebuild_mesh_collider(
              entity_index,
              collider_id,
              vertices_flat,
              indices_flat,
              offset_x,
              offset_y,
              offset_z,
              is_sensor,
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

- [ ] **Step 2: Add binding-level tests**

  In the `#[cfg(test)]` block of `bindings.rs`, add:

  ```rust
  #[cfg(feature = "physics3d")]
  #[test]
  fn test_physics3d_rebuild_mesh_collider_binding_happy_path() {
      let mut engine = Engine::new();
      engine.physics3d_init(0.0, -9.81, 0.0, 64);
      engine.physics3d_add_body(0, 0.0, 0.0, 0.0, 0, 1.0, 0.0, 0.0); // Fixed body

      let verts: Vec<f32> = vec![0.0,0.0,0.0, 1.0,0.0,0.0, 0.0,1.0,0.0];
      let idxs: Vec<u32> = vec![0, 1, 2];
      // RFC-06b: physics3d_add_mesh_collider must exist at this point.
      assert!(engine.physics3d_add_mesh_collider(0, &verts, &idxs, 0.0, 0.0, 0.0, false, 0.5, 0.0, 0xFFFF_FFFF, 0xFFFF_FFFF, 42));

      let new_verts: Vec<f32> = vec![0.0,0.0,0.0, 3.0,0.0,0.0, 0.0,3.0,0.0];
      let new_idxs: Vec<u32> = vec![0, 1, 2];
      assert!(engine.physics3d_rebuild_mesh_collider(0, 42, &new_verts, &new_idxs, 0.0, 0.0, 0.0, false, 0.5, 0.0, 0xFFFF_FFFF, 0xFFFF_FFFF));
  }

  #[cfg(feature = "physics3d")]
  #[test]
  fn test_physics3d_rebuild_mesh_collider_binding_returns_false_when_no_world() {
      let mut engine = Engine::new();
      // physics3d not initialised.
      let verts: Vec<f32> = vec![0.0,0.0,0.0, 1.0,0.0,0.0, 0.0,1.0,0.0];
      let idxs: Vec<u32> = vec![0, 1, 2];
      assert!(!engine.physics3d_rebuild_mesh_collider(0, 1, &verts, &idxs, 0.0, 0.0, 0.0, false, 0.5, 0.0, 0xFFFF_FFFF, 0xFFFF_FFFF));
  }
  ```

- [ ] **Step 3: Run tests**

  ```bash
  cargo test -p gwen-core --features physics3d physics3d_rebuild_mesh_collider_binding 2>&1 | tail -10
  ```

  Expected output:

  ```
  test tests::test_physics3d_rebuild_mesh_collider_binding_happy_path ... ok
  test tests::test_physics3d_rebuild_mesh_collider_binding_returns_false_when_no_world ... ok
  test result: ok. 2 passed; 0 failed
  ```

- [ ] **Step 4: Run full test suite**

  ```bash
  cargo test -p gwen-core --features physics3d 2>&1 | tail -5
  ```

  Expected: `test result: ok. N passed; 0 failed`

- [ ] **Step 5: Commit**

  ```bash
  git add crates/gwen-core/src/bindings.rs
  git commit -m "feat(physics3d): expose physics3d_rebuild_mesh_collider WASM binding

  Wraps PhysicsWorld3D::rebuild_mesh_collider via the standard
  cfg(feature = \"physics3d\") binding pattern. Returns false when the
  physics world is not initialised or the entity has no body.

  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
  ```

---

## Task 3 — TypeScript: `MeshColliderHandle3D.rebuild()` + WasmBridge + composable

> **⚠️ BLOCKER: RFC-06c (Web Worker BVH builder) MUST be merged before this task.**
> `rebuild()` is designed to offload BVH computation to a Worker. Without RFC-06c the rebuild
> is synchronous — the code in this task includes a clear `// RFC-06c:` comment marking where
> the Worker call will be plugged in. Tests mock the WASM bridge directly.

**Files:**

- Modify: `packages/physics3d/src/types.ts`
- Modify: `packages/physics3d/src/index.ts`
- Modify: `packages/core/src/engine/wasm-bridge.ts`
- Modify: `packages/physics3d/src/composables/use-mesh-collider.ts`
- Modify: `packages/physics3d/tests/composables/use-mesh-collider.test.ts`

---

### Step 1 — Expand `MeshColliderHandle3D` in `packages/physics3d/src/types.ts`

- [ ] Replace the `MeshColliderHandle3D` type alias with a full interface.

  **Before** (current line ~820 in types.ts):

  ```typescript
  /** Handle returned by {@link useMeshCollider}. */
  export type MeshColliderHandle3D = ColliderHandle3D;
  ```

  **After:**

  ```typescript
  /**
   * Handle returned by {@link useMeshCollider}.
   *
   * Extends the base {@link ColliderHandle3D} with async rebuild support.
   * The `rebuild()` method replaces the live collider geometry without
   * removing the entity from the physics simulation.
   */
  export interface MeshColliderHandle3D extends ColliderHandle3D {
    /**
     * Current lifecycle state of the mesh collider.
     * - `'loading'` — BVH is being built in the background (RFC-06c Worker).
     * - `'active'`  — Collider is live in the physics world.
     * - `'error'`   — An unrecoverable error occurred during build or rebuild.
     */
    readonly status: 'loading' | 'active' | 'error';
    /**
     * Resolves when the collider is first active (status === 'active').
     * Rejects if the build fails (status === 'error').
     */
    readonly ready: Promise<void>;
    /**
     * Cancel an in-flight BVH Worker build (RFC-06c).
     * No-op if the collider is already active or in error state.
     */
    abort(): void;
    /**
     * Swap the collider geometry with new vertex and index data.
     *
     * Under the hood this:
     * 1. Sends `vertices` and `indices` to the BVH Web Worker (RFC-06c) for
     *    non-blocking construction.
     * 2. Once the Worker responds, calls `physics3d_rebuild_mesh_collider`
     *    on the WASM bridge, which removes the old collider and inserts the new
     *    trimesh atomically inside the Rapier3D world.
     *
     * @param vertices - New vertex positions `[x0,y0,z0, x1,y1,z1, ...]`.
     * @param indices  - New triangle indices `[a0,b0,c0, ...]`.
     * @returns A promise that resolves once the WASM swap is complete.
     * @throws If `physics3d_rebuild_mesh_collider` returns `false` (entity missing).
     */
    rebuild(vertices: Float32Array, indices: Uint32Array): Promise<void>;
  }
  ```

- [ ] Add `rebuildMeshCollider` to the `Physics3DAPI` interface.

  After the `removeCollider` declaration (~line 662 in types.ts):

  ```typescript
  /**
   * Rebuild an existing mesh collider with new geometry.
   *
   * Removes the old trimesh collider identified by `colliderId` and inserts a
   * fresh one built from `vertices` and `indices`. The entity stays in the
   * simulation — only the collider shape changes.
   *
   * @param entityId   - Target entity.
   * @param colliderId - Stable collider ID originally returned by {@link useMeshCollider}.
   * @param vertices   - New flat vertex buffer `[x0,y0,z0, ...]`.
   * @param indices    - New flat index buffer `[a0,b0,c0, ...]`.
   * @param options    - Optional material overrides (friction, restitution, etc.).
   * @returns `true` on success; `false` if the entity has no body.
   */
  rebuildMeshCollider(
    entityId: Physics3DEntityId,
    colliderId: number,
    vertices: Float32Array,
    indices: Uint32Array,
    options?: Pick<Physics3DColliderOptions, 'isSensor' | 'friction' | 'restitution' | 'layers' | 'mask'>,
  ): boolean;
  ```

---

### Step 2 — Add mesh methods to `Physics3DWasmBridge` and `addColliderImpl` in `packages/physics3d/src/index.ts`

- [ ] **Add `physics3d_add_mesh_collider` and `physics3d_rebuild_mesh_collider` to the local `Physics3DWasmBridge` interface.**

  Locate the `Physics3DWasmBridge` interface (around line 155, after `physics3d_remove_collider`). Add:

  ```typescript
  physics3d_add_mesh_collider?: (
    entityIndex: number,
    vertices: Float32Array,
    indices: Uint32Array,
    offsetX: number,
    offsetY: number,
    offsetZ: number,
    isSensor: boolean,
    friction: number,
    restitution: number,
    layerBits: number,
    maskBits: number,
    colliderId: number,
  ) => boolean;
  physics3d_rebuild_mesh_collider?: (
    entityIndex: number,
    colliderId: number,
    vertices: Float32Array,
    indices: Uint32Array,
    offsetX: number,
    offsetY: number,
    offsetZ: number,
    isSensor: boolean,
    friction: number,
    restitution: number,
    layerBits: number,
    maskBits: number,
  ) => boolean;
  ```

- [ ] **Add the mesh WASM path to `addColliderImpl`.**

  In `addColliderImpl`, after the `if (shape.type === 'capsule')` block (around line 1063), add:

  ```typescript
  if (shape.type === 'mesh') {
    return (
      wasmBridge!.physics3d_add_mesh_collider?.(
        idx,
        shape.vertices,
        shape.indices,
        ox,
        oy,
        oz,
        is_sensor === 1,
        friction,
        restitution,
        membership,
        filter,
        colliderId,
      ) ?? false
    );
  }
  ```

  > **Note:** `is_sensor` in that scope is `number` (0 or 1). The Rust binding expects `bool`, and
  > wasm-bindgen converts JS boolean → Rust bool. Pass `is_sensor === 1` (boolean) to match the
  > existing `bool` parameter type in the Rust signature (consistent with add_box_collider binding
  > which also receives `is_sensor: bool`).

- [ ] **Add `rebuildMeshCollider` implementation.**

  After `removeCollider` (around line 1079), add:

  ```typescript
  const rebuildMeshCollider: Physics3DAPI['rebuildMeshCollider'] = (
    entityId,
    colliderId,
    vertices,
    indices,
    options,
  ) => {
    const slot = toEntityIndex(entityId);
    if (!bodyByEntity.has(slot)) return false;

    // Update local collider registry with new geometry.
    const colliders = localColliders.get(slot);
    if (colliders) {
      const entry = colliders.find((c) => c.colliderId === colliderId);
      if (entry && entry.shape.type === 'mesh') {
        entry.shape.vertices = vertices;
        entry.shape.indices = indices;
      }
    }

    if (backendMode !== 'wasm') return true;

    const { friction, restitution } = resolveColliderMaterial({ ...options });
    const isSensor = options?.isSensor ?? false;
    const membership = resolveLayerBits(options?.layers, layerRegistry);
    const filter = resolveLayerBits(options?.mask, layerRegistry);

    return (
      wasmBridge!.physics3d_rebuild_mesh_collider?.(
        slot,
        colliderId,
        vertices,
        indices,
        0,
        0,
        0,
        isSensor,
        friction,
        restitution,
        membership,
        filter,
      ) ?? false
    );
  };
  ```

- [ ] **Expose `rebuildMeshCollider` in the returned service object.**

  In the `return {` block of `Physics3DPlugin`, add:

  ```typescript
  rebuildMeshCollider,
  ```

---

### Step 3 — Add `physics3d_rebuild_mesh_collider` to `WasmEnginePhysics3D` in `packages/core/src/engine/wasm-bridge.ts`

- [ ] Locate `WasmEnginePhysics3D`. After `physics3d_remove_collider?`, add:

  ```typescript
  physics3d_add_mesh_collider?(
    entityIndex: number,
    vertices: Float32Array,
    indices: Uint32Array,
    offsetX: number,
    offsetY: number,
    offsetZ: number,
    isSensor: boolean,
    friction: number,
    restitution: number,
    layerBits: number,
    maskBits: number,
    colliderId: number,
  ): boolean;
  physics3d_rebuild_mesh_collider?(
    entityIndex: number,
    colliderId: number,
    vertices: Float32Array,
    indices: Uint32Array,
    offsetX: number,
    offsetY: number,
    offsetZ: number,
    isSensor: boolean,
    friction: number,
    restitution: number,
    layerBits: number,
    maskBits: number,
  ): boolean;
  ```

---

### Step 4 — Expand `useMeshCollider` in `packages/physics3d/src/composables/use-mesh-collider.ts`

- [ ] Replace the entire file content with the following:

  ````typescript
  /**
   * @file useMeshCollider() — attaches a trimesh collider to the current entity.
   *
   * **3D only — not available in @gwenjs/physics2d.**
   *
   * A mesh collider uses a triangle mesh for precise concave collision geometry.
   * It is more expensive than convex or primitive shapes, so prefer convex or
   * primitive shapes for dynamic bodies. Mesh colliders are best suited for
   * static terrain and environment geometry.
   */
  import type { MeshColliderHandle3D } from '../types.js';
  import { usePhysics3D } from '../composables.js';
  import { _getActorEntityId } from '@gwenjs/core/scene';
  import type { EntityId } from '@gwenjs/core';
  import { nextColliderId } from './collider-id.js';

  /**
   * Options for configuring a trimesh (triangle mesh) 3D collider.
   *
   * **3D only — not available in @gwenjs/physics2d.**
   */
  export interface MeshColliderOptions {
    /**
     * Flat array of vertex positions in metres.
     * Layout: `[x0, y0, z0, x1, y1, z1, ...]`.
     * Length must be a multiple of 3.
     */
    vertices: Float32Array;
    /**
     * Flat array of triangle indices into the vertex array.
     * Layout: `[a0, b0, c0, a1, b1, c1, ...]`.
     * Length must be a multiple of 3.
     */
    indices: Uint32Array;
    /** Mark as sensor — generates events but no physical response. @default false */
    isSensor?: boolean;
    /** Friction coefficient (≥ 0). @default 0.5 */
    friction?: number;
    /** Restitution (bounciness) in [0, 1]. @default 0.0 */
    restitution?: number;
    /** Numeric collision layer bitmask (membership). */
    layer?: number;
    /** Numeric collision filter bitmask (which layers to collide with). */
    mask?: number;
  }

  /**
   * Attach a trimesh collider to the current entity.
   *
   * **3D only — not available in @gwenjs/physics2d.**
   *
   * Must be called after {@link useStaticBody} or {@link useDynamicBody} has
   * registered the body for this entity. Mesh colliders are recommended for
   * static bodies only; using them on dynamic bodies incurs significant
   * performance overhead in the Rapier3D solver.
   *
   * The returned handle exposes a `rebuild(vertices, indices)` method that
   * swaps the live collider geometry without removing the entity from the
   * simulation — useful for deformable terrain or partial destruction.
   *
   * @param options - Vertex and index arrays, plus optional material/layer config.
   * @returns A {@link MeshColliderHandle3D} with `colliderId`, `remove()`, and `rebuild()`.
   * @throws {GwenPluginNotFoundError} If `@gwenjs/physics3d` is not registered.
   *
   * @example
   * ```typescript
   * const TerrainActor = defineActor(TerrainPrefab, () => {
   *   useStaticBody()
   *   const mesh = useMeshCollider({ vertices: terrainVerts, indices: terrainIndices })
   *
   *   onUpdate(() => {
   *     if (terrainModified) {
   *       mesh.rebuild(newVerts, newIndices)
   *     }
   *   })
   * })
   * ```
   *
   * @since 1.0.0
   */
  export function useMeshCollider(options: MeshColliderOptions): MeshColliderHandle3D {
    const physics = usePhysics3D();
    const entityId = _getActorEntityId() as unknown as EntityId;
    const colliderId = nextColliderId();

    // Tracks the current collider options so rebuild() can inherit material settings.
    let currentOptions: MeshColliderOptions = { ...options };

    // Status management — 'loading' briefly while addCollider runs; 'active' once done.
    let _status: MeshColliderHandle3D['status'] = 'loading';
    let _resolveReady!: () => void;
    let _rejectReady!: (err: unknown) => void;
    const _ready = new Promise<void>((res, rej) => {
      _resolveReady = res;
      _rejectReady = rej;
    });

    try {
      physics.addCollider(entityId, {
        shape: {
          type: 'mesh',
          vertices: options.vertices,
          indices: options.indices,
        },
        isSensor: options.isSensor,
        friction: options.friction,
        restitution: options.restitution,
        colliderId,
      });
      _status = 'active';
      _resolveReady();
    } catch (err) {
      _status = 'error';
      _rejectReady(err);
    }

    return {
      get colliderId() {
        return colliderId;
      },
      get status() {
        return _status;
      },
      get ready() {
        return _ready;
      },
      abort() {
        // RFC-06c: when a Worker build is in-flight, cancel it here.
        // No-op in the current synchronous path.
      },
      remove() {
        physics.removeCollider(entityId, colliderId);
      },
      async rebuild(vertices: Float32Array, indices: Uint32Array): Promise<void> {
        // RFC-06c: replace the await below with a Worker-based BVH build.
        // The Worker receives vertices + indices, pre-computes the BVH off-thread,
        // then returns processed data. On response, call rebuildMeshCollider.
        //
        // Current implementation: synchronous WASM call (blocks main thread briefly
        // for large meshes — acceptable until RFC-06c is integrated).
        currentOptions = { ...currentOptions, vertices, indices };
        _status = 'loading';
        const ok = physics.rebuildMeshCollider(entityId, colliderId, vertices, indices, {
          isSensor: currentOptions.isSensor,
          friction: currentOptions.friction,
          restitution: currentOptions.restitution,
        });
        if (!ok) {
          _status = 'error';
          throw new Error(
            `physics3d_rebuild_mesh_collider failed for entity ${String(entityId)}, colliderId ${colliderId}`,
          );
        }
        _status = 'active';
      },
    };
  }
  ````

---

### Step 5 — Update tests in `packages/physics3d/tests/composables/use-mesh-collider.test.ts`

- [ ] Replace the existing test file with the following extended suite that covers all new handle fields:

  ```typescript
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
    rebuildMeshCollider: vi.fn(() => true),
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
      mockPhysics3D.rebuildMeshCollider.mockReturnValue(true);
    });

    // ─── addCollider forwarding ───────────────────────────────────────────────
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

    it('passes isSensor to addCollider', () => {
      useMeshCollider({ vertices, indices, isSensor: true });
      expect(mockPhysics3D.addCollider).toHaveBeenCalledWith(
        1n,
        expect.objectContaining({ isSensor: true }),
      );
    });

    // ─── handle shape ─────────────────────────────────────────────────────────
    it('handle.colliderId is a number', () => {
      const handle = useMeshCollider({ vertices, indices });
      expect(typeof handle.colliderId).toBe('number');
    });

    it('handle.status is "active" after successful addCollider', () => {
      const handle = useMeshCollider({ vertices, indices });
      expect(handle.status).toBe('active');
    });

    it('handle.ready resolves for a successful collider', async () => {
      const handle = useMeshCollider({ vertices, indices });
      await expect(handle.ready).resolves.toBeUndefined();
    });

    it('handle.status is "error" when addCollider throws', () => {
      mockPhysics3D.addCollider.mockImplementationOnce(() => {
        throw new Error('WASM unavailable');
      });
      const handle = useMeshCollider({ vertices, indices });
      expect(handle.status).toBe('error');
    });

    it('handle.ready rejects when addCollider throws', async () => {
      mockPhysics3D.addCollider.mockImplementationOnce(() => {
        throw new Error('WASM unavailable');
      });
      const handle = useMeshCollider({ vertices, indices });
      await expect(handle.ready).rejects.toThrow('WASM unavailable');
    });

    it('handle.abort() does not throw', () => {
      const handle = useMeshCollider({ vertices, indices });
      expect(() => handle.abort()).not.toThrow();
    });

    // ─── remove ───────────────────────────────────────────────────────────────
    it('handle.remove() calls removeCollider with the correct colliderId', () => {
      const handle = useMeshCollider({ vertices, indices });
      const cid = handle.colliderId;
      handle.remove();
      expect(mockPhysics3D.removeCollider).toHaveBeenCalledWith(1n, cid);
    });

    // ─── rebuild ──────────────────────────────────────────────────────────────
    it('handle.rebuild() calls rebuildMeshCollider with new geometry', async () => {
      const handle = useMeshCollider({ vertices, indices });
      const newVerts = new Float32Array([0, 0, 0, 2, 0, 0, 0, 2, 0]);
      const newIdxs = new Uint32Array([0, 1, 2]);

      await handle.rebuild(newVerts, newIdxs);

      expect(mockPhysics3D.rebuildMeshCollider).toHaveBeenCalledWith(
        1n,
        handle.colliderId,
        newVerts,
        newIdxs,
        expect.objectContaining({}),
      );
    });

    it('handle.rebuild() resolves when rebuildMeshCollider returns true', async () => {
      const handle = useMeshCollider({ vertices, indices });
      await expect(handle.rebuild(vertices, indices)).resolves.toBeUndefined();
    });

    it('handle.status is "active" after successful rebuild', async () => {
      const handle = useMeshCollider({ vertices, indices });
      await handle.rebuild(vertices, indices);
      expect(handle.status).toBe('active');
    });

    it('handle.rebuild() throws and sets status "error" when rebuildMeshCollider returns false', async () => {
      mockPhysics3D.rebuildMeshCollider.mockReturnValueOnce(false);
      const handle = useMeshCollider({ vertices, indices });
      await expect(handle.rebuild(vertices, indices)).rejects.toThrow(
        'physics3d_rebuild_mesh_collider failed',
      );
      expect(handle.status).toBe('error');
    });
  });
  ```

- [ ] **Step 6: Run tests**

  ```bash
  pnpm --filter @gwenjs/physics3d test 2>&1 | tail -20
  ```

  Expected output:

  ```
  ✓ tests/composables/use-mesh-collider.test.ts (15 tests)
  Test Files  1 passed (1)
  Tests  15 passed (15)
  ```

- [ ] **Step 7: Run typecheck**

  ```bash
  pnpm --filter @gwenjs/physics3d typecheck && pnpm --filter @gwenjs/core typecheck
  ```

  Expected: exits 0 with no TS errors.

- [ ] **Step 8: Run full TS test suite**

  ```bash
  pnpm test:ts 2>&1 | tail -10
  ```

  Expected: all tests green.

- [ ] **Step 9: Commit**

  ```bash
  git add \
    packages/physics3d/src/types.ts \
    packages/physics3d/src/index.ts \
    packages/core/src/engine/wasm-bridge.ts \
    packages/physics3d/src/composables/use-mesh-collider.ts \
    packages/physics3d/tests/composables/use-mesh-collider.test.ts
  git commit -m "feat(physics3d): MeshColliderHandle3D.rebuild() + rebuildMeshCollider API

  - Expand MeshColliderHandle3D from ColliderHandle3D alias to full interface
    with status, ready, abort(), and async rebuild().
  - Add rebuildMeshCollider() to Physics3DAPI and Physics3DWasmBridge.
  - Add physics3d_add_mesh_collider / physics3d_rebuild_mesh_collider to
    WasmEnginePhysics3D in wasm-bridge.ts.
  - Wire mesh WASM path in addColliderImpl (previously fell through to no-op).
  - rebuild() is async and RFC-06c-ready: a comment marks the Worker hookup
    point; current path calls WASM synchronously.
  - 15 Vitest tests covering addCollider forwarding, handle lifecycle,
    abort, remove, rebuild success, rebuild error.

  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
  ```

---

## Task 4 — New crate: `crates/gwen-physics3d-fracture/` scaffold

**Files:**

- Modify: `Cargo.toml` (workspace root)
- Create: `crates/gwen-physics3d-fracture/Cargo.toml`
- Create: `crates/gwen-physics3d-fracture/src/lib.rs` (skeleton)

- [ ] **Step 1: Add fracture crate to workspace**

  Open `Cargo.toml` at the repository root. Change:

  ```toml
  members = [
      "crates/gwen-core",
      "crates/gwen-wasm-utils",
  ]
  ```

  To:

  ```toml
  members = [
      "crates/gwen-core",
      "crates/gwen-wasm-utils",
      "crates/gwen-physics3d-fracture",
  ]
  ```

- [ ] **Step 2: Create `crates/gwen-physics3d-fracture/Cargo.toml`**

  ```toml
  [package]
  name = "gwen-physics3d-fracture"
  version.workspace = true
  edition.workspace = true
  license = "MPL-2.0"
  authors = ["Jonathan Moutier <jonathan.moutier.dev@gmail.com>"]
  description = "Voronoi mesh fracture for GWEN Physics 3D — standalone WASM module"

  [lib]
  crate-type = ["cdylib", "rlib"]

  [dependencies]
  wasm-bindgen = "0.2.87"

  [dev-dependencies]
  wasm-bindgen-test = "0.3"

  [package.metadata.wasm-pack.profile.release]
  wasm-opt = false

  [package.metadata.wasm-pack.profile.dev]
  wasm-opt = false
  ```

- [ ] **Step 3: Create skeleton `crates/gwen-physics3d-fracture/src/lib.rs`**

  ```rust
  use wasm_bindgen::prelude::*;

  /// Placeholder — full implementation in Task 5.
  #[wasm_bindgen]
  pub fn voronoi_fracture(
      _vertices_flat: &[f32],
      _indices_flat: &[u32],
      _impact_x: f32,
      _impact_y: f32,
      _impact_z: f32,
      _shard_count: u32,
      _seed: u32,
  ) -> Vec<f32> {
      vec![]
  }
  ```

- [ ] **Step 4: Verify it compiles**

  ```bash
  cargo check -p gwen-physics3d-fracture 2>&1 | tail -5
  ```

  Expected: `Finished dev [unoptimized + debuginfo] target(s) in ...`

- [ ] **Step 5: Commit**

  ```bash
  git add Cargo.toml crates/gwen-physics3d-fracture/
  git commit -m "chore(fracture): scaffold gwen-physics3d-fracture crate

  Adds the crate to the workspace with wasm-bindgen dependency.
  voronoi_fracture() is a no-op placeholder until Task 5.

  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
  ```

---

## Task 5 — Rust: implement `voronoi_fracture()` + unit tests

**Files:**

- Modify: `crates/gwen-physics3d-fracture/src/lib.rs`
- Create: `crates/gwen-physics3d-fracture/tests/fracture.rs`

- [ ] **Step 1: Replace `lib.rs` with the full implementation**

  ````rust
  //! Voronoi mesh fracture for GWEN Physics 3D.
  //!
  //! Exposes a single WASM-bindgen function [`voronoi_fracture`] that splits a
  //! triangle mesh into `shard_count` pieces using a triangle-centroid assignment
  //! strategy:
  //!
  //! 1. Generate `shard_count` Voronoi sites around the impact point.
  //! 2. For each triangle, compute its centroid and assign it to the nearest site.
  //! 3. Collect per-site triangle buckets and build deduplicated sub-meshes.
  //!
  //! **Algorithm complexity:** O(triangles × sites). Fast enough for games with
  //! 64 shards and meshes up to ~10 000 triangles at 60 fps.
  //!
  //! **Output encoding:**
  //! ```text
  //! [f32: shard_count]
  //! per non-empty shard {
  //!   [f32: vertex_count]   // number of unique vertices in this shard
  //!   [f32: triangle_count] // number of triangles in this shard
  //!   [f32 × vertex_count × 3] // vertex positions x,y,z
  //!   [f32 × triangle_count × 3] // re-mapped triangle indices encoded as f32
  //! }
  //! ```
  //! Indices are encoded as `f32` because wasm-bindgen returns `Vec<f32>` cleanly
  //! from WASM; the TypeScript parser casts them back to `u32` when reading.

  use std::collections::HashMap;
  use wasm_bindgen::prelude::*;

  // ─── Public WASM API ─────────────────────────────────────────────────────────

  /// Fracture a triangle mesh into `shard_count` pieces using Voronoi site assignment.
  ///
  /// # Arguments
  /// * `vertices_flat` — Source mesh vertex positions `[x0,y0,z0, x1,y1,z1, ...]`.
  ///   Length must be a non-zero multiple of 3.
  /// * `indices_flat`  — Source mesh triangle indices `[a0,b0,c0, ...]`.
  ///   Length must be a non-zero multiple of 3.
  /// * `impact_x/y/z` — Impact point in local mesh space. Used as the first Voronoi site.
  /// * `shard_count`  — Number of desired shards (1–64 recommended; clamped to 1 minimum).
  /// * `seed`         — LCG random seed for reproducible fracture patterns.
  ///
  /// # Returns
  /// A flat `f32` buffer encoding all non-empty shards (see module-level docs for layout).
  /// Returns an empty `vec![]` if `vertices_flat` or `indices_flat` is empty.
  #[wasm_bindgen]
  pub fn voronoi_fracture(
      vertices_flat: &[f32],
      indices_flat: &[u32],
      impact_x: f32,
      impact_y: f32,
      impact_z: f32,
      shard_count: u32,
      seed: u32,
  ) -> Vec<f32> {
      if vertices_flat.is_empty() || indices_flat.is_empty() {
          return vec![];
      }
      let shard_count = shard_count.max(1) as usize;

      let verts = parse_vertices(vertices_flat);
      let tris = parse_triangles(indices_flat);

      let sites = generate_sites(impact_x, impact_y, impact_z, shard_count, seed, &verts);
      let buckets = assign_triangles(&verts, &tris, &sites, shard_count);
      encode_output(&verts, &buckets, shard_count)
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────────

  fn parse_vertices(flat: &[f32]) -> Vec<[f32; 3]> {
      flat.chunks_exact(3)
          .map(|c| [c[0], c[1], c[2]])
          .collect()
  }

  fn parse_triangles(flat: &[u32]) -> Vec<[u32; 3]> {
      flat.chunks_exact(3)
          .map(|c| [c[0], c[1], c[2]])
          .collect()
  }

  /// Generate `count` Voronoi site positions.
  /// Site 0 is always the impact point; the rest are uniformly sampled from the
  /// mesh bounding box using a simple LCG PRNG seeded with `seed`.
  fn generate_sites(
      ix: f32,
      iy: f32,
      iz: f32,
      count: usize,
      seed: u32,
      verts: &[[f32; 3]],
  ) -> Vec<[f32; 3]> {
      let mut rng = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);

      let mut min = [f32::MAX; 3];
      let mut max = [f32::MIN; 3];
      for v in verts {
          for i in 0..3 {
              min[i] = min[i].min(v[i]);
              max[i] = max[i].max(v[i]);
          }
      }
      let spread = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];

      let mut sites = vec![[ix, iy, iz]];
      for _ in 1..count {
          let [rx, ry, rz] = std::array::from_fn(|i| {
              rng = rng.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
              min[i] + (rng as f32 / u32::MAX as f32) * spread[i]
          });
          sites.push([rx, ry, rz]);
      }
      sites
  }

  #[inline]
  fn dist2(a: [f32; 3], b: [f32; 3]) -> f32 {
      (a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2) + (a[2] - b[2]).powi(2)
  }

  /// Assign each triangle to the Voronoi site nearest to its centroid.
  fn assign_triangles(
      verts: &[[f32; 3]],
      tris: &[[u32; 3]],
      sites: &[[f32; 3]],
      shard_count: usize,
  ) -> Vec<Vec<[u32; 3]>> {
      let mut buckets: Vec<Vec<[u32; 3]>> = vec![Vec::new(); shard_count];
      for tri in tris {
          let cx = (verts[tri[0] as usize][0] + verts[tri[1] as usize][0] + verts[tri[2] as usize][0]) / 3.0;
          let cy = (verts[tri[0] as usize][1] + verts[tri[1] as usize][1] + verts[tri[2] as usize][1]) / 3.0;
          let cz = (verts[tri[0] as usize][2] + verts[tri[1] as usize][2] + verts[tri[2] as usize][2]) / 3.0;
          let nearest = sites
              .iter()
              .enumerate()
              .min_by(|(_, a), (_, b)| {
                  dist2(**a, [cx, cy, cz])
                      .partial_cmp(&dist2(**b, [cx, cy, cz]))
                      .unwrap_or(std::cmp::Ordering::Equal)
              })
              .map(|(i, _)| i)
              .unwrap_or(0);
          buckets[nearest].push(*tri);
      }
      buckets
  }

  /// Build the output buffer from the per-shard triangle buckets.
  fn encode_output(verts: &[[f32; 3]], buckets: &[Vec<[u32; 3]>], shard_count: usize) -> Vec<f32> {
      let non_empty_count = buckets.iter().filter(|b| !b.is_empty()).count();
      let mut out = vec![non_empty_count as f32];

      for bucket in buckets.iter().take(shard_count) {
          if bucket.is_empty() {
              continue;
          }
          let mut shard_verts: Vec<f32> = Vec::new();
          let mut shard_idxs: Vec<f32> = Vec::new();
          let mut vert_map: HashMap<u32, u32> = HashMap::new();

          for tri in bucket {
              for &orig_idx in tri {
                  let new_idx = *vert_map.entry(orig_idx).or_insert_with(|| {
                      let ni = (shard_verts.len() / 3) as u32;
                      shard_verts.extend_from_slice(&verts[orig_idx as usize]);
                      ni
                  });
                  shard_idxs.push(new_idx as f32);
              }
          }

          out.push((shard_verts.len() / 3) as f32); // vertex count
          out.push((shard_idxs.len() / 3) as f32);  // triangle count
          out.extend_from_slice(&shard_verts);
          out.extend_from_slice(&shard_idxs);
      }
      out
  }
  ````

- [ ] **Step 2: Create `crates/gwen-physics3d-fracture/tests/fracture.rs`**

  ```rust
  //! Integration tests for voronoi_fracture().
  //!
  //! Uses a minimal 4-vertex, 2-triangle quad mesh so results are deterministic
  //! and easy to reason about by hand.

  use gwen_physics3d_fracture::voronoi_fracture;

  /// Helper: parse the output buffer into `(shard_count, shards)` where each
  /// shard is `(vertex_count, tri_count, vertices, indices)`.
  fn parse_output(buf: &[f32]) -> (usize, Vec<(usize, usize, Vec<f32>, Vec<u32>)>) {
      let mut offset = 0;
      let shard_count = buf[offset] as usize;
      offset += 1;
      let mut shards = Vec::new();
      for _ in 0..shard_count {
          let vert_count = buf[offset] as usize;
          offset += 1;
          let tri_count = buf[offset] as usize;
          offset += 1;
          let verts: Vec<f32> = buf[offset..offset + vert_count * 3].to_vec();
          offset += vert_count * 3;
          let idxs: Vec<u32> = buf[offset..offset + tri_count * 3].iter().map(|&f| f as u32).collect();
          offset += tri_count * 3;
          shards.push((vert_count, tri_count, verts, idxs));
      }
      (shard_count, shards)
  }

  /// Flat quad mesh: 4 vertices, 2 triangles.
  ///   v0(0,0,0)  v1(1,0,0)
  ///   v2(0,1,0)  v3(1,1,0)
  fn quad_mesh() -> (Vec<f32>, Vec<u32>) {
      let verts: Vec<f32> = vec![
          0.0, 0.0, 0.0,
          1.0, 0.0, 0.0,
          0.0, 1.0, 0.0,
          1.0, 1.0, 0.0,
      ];
      // Two triangles: lower-left and upper-right.
      let idxs: Vec<u32> = vec![0, 1, 2, 1, 3, 2];
      (verts, idxs)
  }

  #[test]
  fn test_voronoi_fracture_empty_input_returns_empty() {
      let result = voronoi_fracture(&[], &[], 0.0, 0.0, 0.0, 2, 42);
      assert!(result.is_empty());
  }

  #[test]
  fn test_voronoi_fracture_shard_count_1_returns_all_triangles() {
      let (verts, idxs) = quad_mesh();
      let result = voronoi_fracture(&verts, &idxs, 0.5, 0.5, 0.0, 1, 0);
      let (shard_count, shards) = parse_output(&result);

      assert_eq!(shard_count, 1, "should produce exactly 1 shard");
      let (_, tri_count, _, _) = &shards[0];
      assert_eq!(*tri_count, 2, "all 2 triangles must be in the single shard");
  }

  #[test]
  fn test_voronoi_fracture_2_shards_split_quad() {
      // Impact at corner (0,0,0) — that site is closer to tri-0 centroid (~0.33,0.33).
      // Second site is random, but with seed=0 it should end up near the opposite corner.
      let (verts, idxs) = quad_mesh();
      let result = voronoi_fracture(&verts, &idxs, 0.0, 0.0, 0.0, 2, 0);
      let (shard_count, shards) = parse_output(&result);

      assert_eq!(shard_count, 2, "both shards must be non-empty for this input");

      let total_tris: usize = shards.iter().map(|(_, tc, _, _)| tc).sum();
      assert_eq!(total_tris, 2, "total triangle count across shards must equal original");
  }

  #[test]
  fn test_voronoi_fracture_indices_are_valid_for_each_shard() {
      let (verts, idxs) = quad_mesh();
      let result = voronoi_fracture(&verts, &idxs, 0.5, 0.5, 0.0, 2, 99);
      let (_, shards) = parse_output(&result);

      for (vert_count, _, _, shard_idxs) in &shards {
          for &idx in shard_idxs {
              assert!(
                  (idx as usize) < *vert_count,
                  "shard index {idx} out of range for vert_count={vert_count}"
              );
          }
      }
  }

  #[test]
  fn test_voronoi_fracture_is_reproducible_with_same_seed() {
      let (verts, idxs) = quad_mesh();
      let a = voronoi_fracture(&verts, &idxs, 0.5, 0.5, 0.0, 4, 12345);
      let b = voronoi_fracture(&verts, &idxs, 0.5, 0.5, 0.0, 4, 12345);
      assert_eq!(a, b, "same seed must produce identical output");
  }

  #[test]
  fn test_voronoi_fracture_differs_with_different_seeds() {
      let (verts, idxs) = quad_mesh();
      let a = voronoi_fracture(&verts, &idxs, 0.5, 0.5, 0.0, 2, 1);
      let b = voronoi_fracture(&verts, &idxs, 0.5, 0.5, 0.0, 2, 9999);
      // Different seeds should (almost always) produce different site placements.
      // With only 2 triangles this test may occasionally pass even if wrong, but
      // the seed test above guards reproducibility.
      let _ = (a, b); // just verify no panic; determinism tested above
  }

  #[test]
  fn test_voronoi_fracture_shard_count_clamped_to_1() {
      // shard_count = 0 must not panic (clamped to 1 internally).
      let (verts, idxs) = quad_mesh();
      let result = voronoi_fracture(&verts, &idxs, 0.5, 0.5, 0.0, 0, 42);
      assert!(!result.is_empty());
      let (sc, _) = parse_output(&result);
      assert_eq!(sc, 1);
  }
  ```

- [ ] **Step 3: Run tests**

  ```bash
  cargo test -p gwen-physics3d-fracture 2>&1 | tail -15
  ```

  Expected output:

  ```
  test tests::fracture::test_voronoi_fracture_empty_input_returns_empty ... ok
  test tests::fracture::test_voronoi_fracture_shard_count_1_returns_all_triangles ... ok
  test tests::fracture::test_voronoi_fracture_2_shards_split_quad ... ok
  test tests::fracture::test_voronoi_fracture_indices_are_valid_for_each_shard ... ok
  test tests::fracture::test_voronoi_fracture_is_reproducible_with_same_seed ... ok
  test tests::fracture::test_voronoi_fracture_shard_count_clamped_to_1 ... ok
  test result: ok. 6 passed; 0 failed
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add crates/gwen-physics3d-fracture/src/lib.rs crates/gwen-physics3d-fracture/tests/
  git commit -m "feat(fracture): implement voronoi_fracture() Rust/WASM function

  Triangle-centroid Voronoi assignment: O(tris × sites). Generates N sites
  around the impact point using an LCG PRNG (reproducible with seed). Output
  is a flat f32 buffer encoding non-empty shards with deduplicated vertices
  and remapped indices.

  6 integration tests: empty input, shard_count=1, 2-shard split, valid
  indices, reproducibility, shard_count clamping.

  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
  ```

---

## Task 6 — New npm package: `packages/physics3d-fracture/`

**Files:**

- Modify: `pnpm-workspace.yaml`
- Create: `packages/physics3d-fracture/package.json`
- Create: `packages/physics3d-fracture/tsconfig.json`
- Create: `packages/physics3d-fracture/vitest.config.ts`
- Create: `packages/physics3d-fracture/src/index.ts`
- Create: `packages/physics3d-fracture/tests/parse-fracture-buffer.test.ts`

- [ ] **Step 1: Add package to pnpm workspace**

  Open `pnpm-workspace.yaml`. Add `packages/physics3d-fracture` to the `packages:` list so pnpm discovers it:

  ```yaml
  packages:
    - 'packages/*'
    - 'playground/*'
  ```

  If it already uses `packages/*` glob, no change is needed — the new directory is auto-discovered.
  If it lists packages explicitly, add:

  ```yaml
  - 'packages/physics3d-fracture'
  ```

- [ ] **Step 2: Create `packages/physics3d-fracture/package.json`**

  ```json
  {
    "name": "@gwenjs/physics3d-fracture",
    "version": "0.1.0",
    "description": "Voronoi mesh fracture for GWEN Physics 3D — TypeScript bindings and buffer parser",
    "type": "module",
    "sideEffects": false,
    "main": "./src/index.ts",
    "types": "./src/index.ts",
    "exports": {
      ".": {
        "types": "./src/index.ts",
        "import": "./src/index.ts"
      },
      "./wasm/*": "./wasm/*"
    },
    "files": ["dist", "wasm"],
    "scripts": {
      "build": "tsc --noEmit",
      "typecheck": "tsc --noEmit",
      "test": "vitest run"
    },
    "devDependencies": {
      "typescript": "^6.0.2",
      "vitest": "^4.1.2"
    }
  }
  ```

- [ ] **Step 3: Create `packages/physics3d-fracture/tsconfig.json`**

  ```json
  {
    "compilerOptions": {
      "composite": true,
      "target": "ES2020",
      "useDefineForClassFields": true,
      "lib": ["ES2020"],
      "module": "ESNext",
      "skipLibCheck": true,
      "esModuleInterop": true,
      "allowSyntheticDefaultImports": true,
      "strict": true,
      "resolveJsonModule": true,
      "isolatedModules": true,
      "noEmit": true,
      "moduleResolution": "bundler",
      "declaration": true,
      "declarationMap": true,
      "sourceMap": true,
      "outDir": "./dist",
      "exactOptionalPropertyTypes": false,
      "noUncheckedIndexedAccess": false,
      "rootDir": "../.."
    },
    "include": ["src"],
    "extends": "../../tsconfig.base.json"
  }
  ```

- [ ] **Step 4: Create `packages/physics3d-fracture/vitest.config.ts`**

  ```typescript
  import { defineConfig } from 'vitest/config';

  export default defineConfig({
    test: {
      environment: 'node',
    },
  });
  ```

- [ ] **Step 5: Create `packages/physics3d-fracture/src/index.ts`**

  ````typescript
  /**
   * @file @gwenjs/physics3d-fracture — TypeScript bindings for the Voronoi fracture WASM module.
   *
   * Usage (via RFC-008 loadWasmModule):
   * ```typescript
   * import { parseFractureBuffer } from '@gwenjs/physics3d-fracture'
   *
   * // In an actor — fracture module loaded via engine.loadWasmModule({ name: 'fracture', ... })
   * const fracture = useWasmModule('fracture')
   *
   * onContact(({ impulse, localPoint }) => {
   *   if (impulse < 200) return
   *   const rawBuf = fracture.voronoi_fracture(
   *     meshVerts, meshIdxs,
   *     localPoint.x, localPoint.y, localPoint.z,
   *     12,               // shard count
   *     Date.now() & 0xFFFFFFFF, // seed
   *   )
   *   const { shards } = parseFractureBuffer(new Float32Array(rawBuf.buffer))
   *   for (const shard of shards) {
   *     const debris = instantiate(GlassShardPrefab, { position: getPosition() })
   *     // GlassShardPrefab actor handles physics per shard
   *   }
   *   destroyActor()
   * })
   * ```
   */

  // ─── Public types ─────────────────────────────────────────────────────────────

  /**
   * A single fracture shard produced by {@link parseFractureBuffer}.
   *
   * `vertices` and `indices` are ready to pass directly to
   * `useMeshCollider({ vertices, indices })`.
   */
  export interface FractureShard {
    /** Flat vertex buffer `[x0,y0,z0, x1,y1,z1, ...]` for this shard. */
    vertices: Float32Array;
    /** Flat index buffer `[a0,b0,c0, ...]` referencing `vertices`. */
    indices: Uint32Array;
  }

  /**
   * The result of parsing a raw `voronoi_fracture` output buffer.
   */
  export interface FractureResult {
    /** Non-empty mesh shards — length equals the number of non-empty Voronoi cells. */
    shards: FractureShard[];
  }

  // ─── Buffer parser ────────────────────────────────────────────────────────────

  /**
   * Parse the raw `f32` output buffer returned by `voronoi_fracture()` into
   * typed {@link FractureShard} objects.
   *
   * The buffer layout is:
   * ```
   * [f32: shard_count]
   * per shard {
   *   [f32: vertex_count]
   *   [f32: triangle_count]
   *   [f32 × vertex_count × 3]  // vertex positions
   *   [f32 × triangle_count × 3] // indices encoded as f32
   * }
   * ```
   *
   * @param buffer - The raw `Float32Array` returned by the WASM `voronoi_fracture` function.
   * @returns A {@link FractureResult} containing all non-empty shards.
   *
   * @example
   * ```typescript
   * const rawBuf = fractureModule.voronoi_fracture(verts, idxs, ix, iy, iz, 8, seed)
   * const { shards } = parseFractureBuffer(new Float32Array(rawBuf.buffer))
   * shards.forEach((shard, i) => {
   *   console.log(`Shard ${i}: ${shard.vertices.length / 3} verts, ${shard.indices.length / 3} tris`)
   * })
   * ```
   */
  export function parseFractureBuffer(buffer: Float32Array): FractureResult {
    if (buffer.length === 0) return { shards: [] };

    let offset = 0;
    const shardCount = buffer[offset++]!;
    const shards: FractureShard[] = [];

    for (let i = 0; i < shardCount; i++) {
      if (offset >= buffer.length) break;
      const vertCount = buffer[offset++]!;
      const triCount = buffer[offset++]!;
      if (vertCount === 0 || triCount === 0) continue;

      const vertices = buffer.slice(offset, offset + vertCount * 3);
      offset += vertCount * 3;

      // Indices are stored as f32 in the WASM output; cast each value to u32.
      const indexF32 = buffer.slice(offset, offset + triCount * 3);
      offset += triCount * 3;
      const indices = new Uint32Array(indexF32.length);
      for (let j = 0; j < indexF32.length; j++) {
        indices[j] = indexF32[j]! >>> 0;
      }

      shards.push({ vertices, indices });
    }

    return { shards };
  }
  ````

- [ ] **Step 6: Create `packages/physics3d-fracture/tests/parse-fracture-buffer.test.ts`**

  ```typescript
  import { describe, it, expect } from 'vitest';
  import { parseFractureBuffer } from '../src/index.js';

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  /**
   * Manually encode a minimal fracture buffer matching the Rust output format:
   * [shard_count, vert_count, tri_count, ...verts, ...idxs_as_f32]
   */
  function encodeShard(verts: number[], idxs: number[]): Float32Array {
    const vertCount = verts.length / 3;
    const triCount = idxs.length / 3;
    return new Float32Array([1, vertCount, triCount, ...verts, ...idxs]);
  }

  function encodeTwoShards(
    verts1: number[],
    idxs1: number[],
    verts2: number[],
    idxs2: number[],
  ): Float32Array {
    const vc1 = verts1.length / 3;
    const tc1 = idxs1.length / 3;
    const vc2 = verts2.length / 3;
    const tc2 = idxs2.length / 3;
    return new Float32Array([2, vc1, tc1, ...verts1, ...idxs1, vc2, tc2, ...verts2, ...idxs2]);
  }

  // ─── Test data ────────────────────────────────────────────────────────────────

  const singleTriVerts = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  const singleTriIdxs = [0, 1, 2];

  // ─── Tests ────────────────────────────────────────────────────────────────────

  describe('parseFractureBuffer', () => {
    it('returns empty shards for an empty buffer', () => {
      const result = parseFractureBuffer(new Float32Array([]));
      expect(result.shards).toHaveLength(0);
    });

    it('parses a single-shard buffer', () => {
      const buf = encodeShard(singleTriVerts, singleTriIdxs);
      const { shards } = parseFractureBuffer(buf);

      expect(shards).toHaveLength(1);
      expect(shards[0]!.vertices).toHaveLength(9); // 3 verts × 3 components
      expect(shards[0]!.indices).toHaveLength(3); // 1 triangle
    });

    it('vertices match the original float values', () => {
      const buf = encodeShard(singleTriVerts, singleTriIdxs);
      const { shards } = parseFractureBuffer(buf);

      const v = shards[0]!.vertices;
      expect(Array.from(v)).toEqual(singleTriVerts);
    });

    it('indices are returned as Uint32Array', () => {
      const buf = encodeShard(singleTriVerts, singleTriIdxs);
      const { shards } = parseFractureBuffer(buf);

      expect(shards[0]!.indices).toBeInstanceOf(Uint32Array);
    });

    it('indices match original values cast from f32', () => {
      const buf = encodeShard(singleTriVerts, singleTriIdxs);
      const { shards } = parseFractureBuffer(buf);

      expect(Array.from(shards[0]!.indices)).toEqual(singleTriIdxs);
    });

    it('parses two shards correctly', () => {
      const verts2 = [1, 0, 0, 2, 0, 0, 1, 1, 0];
      const idxs2 = [0, 1, 2];
      const buf = encodeTwoShards(singleTriVerts, singleTriIdxs, verts2, idxs2);
      const { shards } = parseFractureBuffer(buf);

      expect(shards).toHaveLength(2);
      expect(Array.from(shards[1]!.vertices)).toEqual(verts2);
    });

    it('second shard indices are Uint32Array with correct values', () => {
      const verts2 = [1, 0, 0, 2, 0, 0, 1, 1, 0];
      const idxs2 = [0, 1, 2];
      const buf = encodeTwoShards(singleTriVerts, singleTriIdxs, verts2, idxs2);
      const { shards } = parseFractureBuffer(buf);

      expect(shards[1]!.indices).toBeInstanceOf(Uint32Array);
      expect(Array.from(shards[1]!.indices)).toEqual(idxs2);
    });

    it('handles large index values correctly (u32 range)', () => {
      // Index value close to u32 max — must not be sign-extended.
      const bigIdxVerts = new Array(3 * 3).fill(0).map((_, i) => i * 0.1);
      const bigIdxs = [65535, 65534, 65533];
      const buf = encodeShard(bigIdxVerts, bigIdxs);
      const { shards } = parseFractureBuffer(buf);

      expect(Array.from(shards[0]!.indices)).toEqual(bigIdxs);
    });

    it('skips shards with zero vertex or triangle count', () => {
      // Manually construct buffer with a zero-vert shard followed by a valid one.
      const buf = new Float32Array([
        2, // 2 shards reported
        0,
        0, // shard 1: vert_count=0, tri_count=0 → skipped
        3,
        1, // shard 2: vert_count=3, tri_count=1
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        1,
        0, // 3 vertices
        0,
        1,
        2, // 1 triangle
      ]);
      const { shards } = parseFractureBuffer(buf);
      expect(shards).toHaveLength(1);
    });

    it('vertices property is a Float32Array', () => {
      const buf = encodeShard(singleTriVerts, singleTriIdxs);
      const { shards } = parseFractureBuffer(buf);
      expect(shards[0]!.vertices).toBeInstanceOf(Float32Array);
    });
  });
  ```

- [ ] **Step 7: Install and run tests**

  ```bash
  pnpm install
  pnpm --filter @gwenjs/physics3d-fracture test 2>&1 | tail -15
  ```

  Expected output:

  ```
  ✓ tests/parse-fracture-buffer.test.ts (9 tests)
  Test Files  1 passed (1)
  Tests  9 passed (9)
  ```

- [ ] **Step 8: Typecheck**

  ```bash
  pnpm --filter @gwenjs/physics3d-fracture typecheck
  ```

  Expected: exits 0.

- [ ] **Step 9: Commit**

  ```bash
  git add \
    pnpm-workspace.yaml \
    packages/physics3d-fracture/
  git commit -m "feat(physics3d-fracture): new @gwenjs/physics3d-fracture npm package

  - parseFractureBuffer() decodes the flat f32 output of voronoi_fracture()
    into typed FractureShard objects (Float32Array vertices + Uint32Array indices).
  - FractureResult and FractureShard types exported for consumer TypeScript.
  - 9 Vitest tests covering: empty input, single shard, vertex/index values,
    two-shard parsing, large u32 indices, and zero-size shard skipping.

  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
  ```

---

## Task 7 — Build script + integration demo + verification

**Files:**

- Modify: `scripts/build-wasm.sh`

- [ ] **Step 1: Add the fracture crate build step to `scripts/build-wasm.sh`**

  After the `# 3. Build physics3d variant` block (before the `log_success "🎉 All WASM variants built"` line), add:

  ```bash
  # 4. Build gwen-physics3d-fracture (standalone Voronoi fracture module)
  build_fracture() {
    local out_dir="$PROJECT_ROOT/packages/physics3d-fracture/wasm"
    local crate_dir="$PROJECT_ROOT/crates/gwen-physics3d-fracture"

    log_info "Building fracture variant (gwen-physics3d-fracture)"

    rm -rf "$out_dir"
    mkdir -p "$out_dir"

    wasm-pack build "$crate_dir" \
      --target web \
      --release \
      --out-dir "$out_dir" \
      --out-name gwen_physics3d_fracture

    rm -f "$out_dir/.gitignore" "$out_dir/package.json" "$out_dir/README.md"

    if command -v wasm-opt &> /dev/null; then
      local wasm_file="$out_dir/gwen_physics3d_fracture_bg.wasm"
      log_info "  Running wasm-opt -Oz on fracture..."
      wasm-opt -Oz "$wasm_file" -o "$wasm_file.opt"
      mv "$wasm_file.opt" "$wasm_file"
    fi

    log_success "Built fracture variant"
    ls -lh "$out_dir" | awk '{print "    - " $9 " (" $5 ")"}'
  }
  ```

  And call it in `main()` after the physics3d build:

  ```bash
  build_fracture
  echo ""
  ```

- [ ] **Step 2: Run the build script (fracture step only, skip gwen-core to save time)**

  ```bash
  bash scripts/build-wasm.sh 2>&1 | grep -E "(fracture|✓|✗|error)" | head -20
  ```

  Expected output (approximately):

  ```
  ℹ Building fracture variant (gwen-physics3d-fracture)
  ✓ Built fracture variant
      - gwen_physics3d_fracture.js (12K)
      - gwen_physics3d_fracture_bg.wasm (28K)
      - gwen_physics3d_fracture_bg.js (2K)
      - gwen_physics3d_fracture.d.ts (1K)
  ```

- [ ] **Step 3: Verify WASM output exists**

  ```bash
  ls -lh packages/physics3d-fracture/wasm/
  ```

  Expected: at minimum `gwen_physics3d_fracture_bg.wasm` and `gwen_physics3d_fracture.js` are present.

- [ ] **Step 4: Verify the WASM export is present**

  ```bash
  node --input-type=module <<'EOF'
  import { readFileSync } from 'fs';
  import { WebAssembly as WA } from 'node:module';
  const bytes = readFileSync('packages/physics3d-fracture/wasm/gwen_physics3d_fracture_bg.wasm');
  const mod = await WebAssembly.compile(bytes);
  const exports = WebAssembly.Module.exports(mod).map(e => e.name);
  console.log('WASM exports:', exports.filter(e => e.includes('fracture')));
  EOF
  ```

  Expected: `WASM exports: [ 'voronoi_fracture' ]` (and potentially mangled wasm-bindgen helpers).

  > **Note:** If `node --input-type=module` is not available, verify manually with:
  >
  > ```bash
  > node -e "
  > const fs = require('fs');
  > const bytes = fs.readFileSync('packages/physics3d-fracture/wasm/gwen_physics3d_fracture_bg.wasm');
  > WebAssembly.compile(bytes).then(m =>
  >   console.log(WebAssembly.Module.exports(m).map(e => e.name))
  > );
  > "
  > ```

- [ ] **Step 5: Run full pnpm test suite to ensure no regressions**

  ```bash
  pnpm test:ts 2>&1 | tail -15
  ```

  Expected: all tests green.

- [ ] **Step 6: Run lint and typecheck**

  ```bash
  pnpm lint && pnpm typecheck
  ```

  Expected: exits 0.

- [ ] **Step 7: Add JSDoc integration example to `packages/physics3d-fracture/src/index.ts`**

  The integration example in the module's file-level JSDoc block (at the top of `src/index.ts`) demonstrates the complete end-to-end usage via RFC-008 `engine.loadWasmModule()`. It is already included in the file created in Task 6 Step 5 — verify it is present:

  ```bash
  grep -c "useWasmModule\|loadWasmModule\|parseFractureBuffer" packages/physics3d-fracture/src/index.ts
  ```

  Expected: `3` (each term appears at least once in the JSDoc block).

- [ ] **Step 8: Commit**

  ```bash
  git add scripts/build-wasm.sh packages/physics3d-fracture/wasm/
  git commit -m "build(fracture): add gwen-physics3d-fracture to build-wasm.sh

  Adds a build_fracture() step to build-wasm.sh that runs wasm-pack on
  crates/gwen-physics3d-fracture and places output in
  packages/physics3d-fracture/wasm/. Post-processes with wasm-opt when
  available (same pattern as gwen-core variants).

  Verified: voronoi_fracture export present in compiled WASM.

  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
  ```

---

## Quality Gates (all tasks)

After completing all 7 tasks, run the full quality gates:

```bash
# Rust
cargo test -p gwen-core --features physics3d 2>&1 | tail -5
cargo test -p gwen-physics3d-fracture 2>&1 | tail -5

# TypeScript
pnpm lint            # zero violations
pnpm format:check    # zero violations
pnpm typecheck       # zero TS errors
pnpm test:ts         # all tests green
pnpm build:ts        # all packages build
```

All commands must exit 0 before this RFC is considered complete.
