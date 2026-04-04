# RFC-06b: Fix Mesh/Convex Colliders + Bulk Spawn Static Boxes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the silently broken useMeshCollider/useConvexCollider (vertices never reach Rapier3D) and add physics3d_bulk_spawn_static_boxes for spawning hundreds of static boxes in one WASM call.

**Architecture:** Add add_mesh_collider + add_convex_collider + bulk_add_static_boxes to PhysicsWorld3D in world.rs; expose via #[wasm_bindgen] in bindings.rs; wire mesh/convex shapes in addColliderImpl (index.ts) and add bulkSpawnStaticBoxes to Physics3DAPI.

**Tech Stack:** Rust/Rapier3D 0.22, wasm-bindgen 0.2.87, TypeScript, Vitest

---

## File Map

| File                                                                 | Action | Responsibility                                                                                                       |
| -------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| `crates/gwen-core/src/physics3d/world.rs`                            | MODIFY | Add `add_mesh_collider`, `add_convex_collider`, `bulk_add_static_boxes` + unit tests                                 |
| `crates/gwen-core/src/bindings.rs`                                   | MODIFY | Add `physics3d_add_mesh_collider`, `physics3d_add_convex_collider`, `physics3d_bulk_spawn_static_boxes` WASM exports |
| `packages/physics3d/src/index.ts`                                    | MODIFY | Wire mesh/convex in `addColliderImpl`; add `bulkSpawnStaticBoxes` impl; extend `Physics3DWasmBridge` interface       |
| `packages/physics3d/src/types.ts`                                    | MODIFY | Add `BulkStaticBoxesOptions`, `BulkStaticBoxesResult`; add `bulkSpawnStaticBoxes` to `Physics3DAPI`                  |
| `packages/physics3d/tests/colliders.test.ts`                         | MODIFY | Add local-mode tests for mesh + convex addCollider                                                                   |
| `packages/physics3d/tests/wasm-backend.test.ts`                      | MODIFY | Add WASM-mode tests for mesh, convex, bulk colliders                                                                 |
| `packages/physics3d/tests/bulk-spawn.test.ts`                        | CREATE | Tests for `bulkSpawnStaticBoxes` API (local + WASM modes)                                                            |
| `packages/physics3d/src/composables/use-bulk-static-boxes.ts`        | CREATE | `useBulkStaticBoxes` composable                                                                                      |
| `packages/physics3d/tests/composables/use-bulk-static-boxes.test.ts` | CREATE | Composable unit tests                                                                                                |

---

## Task 1: Rust — add_mesh_collider + add_convex_collider in world.rs

**Files:**

- Modify: `crates/gwen-core/src/physics3d/world.rs`

### What to build

Two new methods on `PhysicsWorld3D` that accept flat float arrays and call through to
`self.insert_collider()` — the same helper used by `add_box_collider`, `add_sphere_collider`,
and `add_capsule_collider`. Both functions:

- Are guarded by `#[allow(clippy::too_many_arguments)]`
- Return `false` early on empty or degenerate input
- Delegate the full attachment (sensor flag, friction, restitution, layer/mask bits, offset,
  user_data packing, `active_events`) to `insert_collider` — do NOT duplicate that logic

The Rust test module sits at the bottom of `world.rs` inside `#[cfg(test)] mod tests`.
Add the new tests **after** the existing `test_physics3d_add_multiple_collider_types_same_body`
test (around line 1390 in the original file).

---

- [ ] **Step 1.1 — Write failing tests first**

  Append to `#[cfg(test)] mod tests` inside `crates/gwen-core/src/physics3d/world.rs`:

  ```rust
  #[test]
  fn test_physics3d_add_mesh_collider_returns_true_for_valid_entity() {
      let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
      world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);
      // A single triangle
      let verts: &[f32] = &[0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0];
      let idxs: &[u32] = &[0, 1, 2];
      let ok = world.add_mesh_collider(
          0, verts, idxs, 0.0, 0.0, 0.0,
          false, 0.5, 0.0, u32::MAX, u32::MAX, 1,
      );
      assert!(ok);
  }

  #[test]
  fn test_physics3d_add_mesh_collider_returns_false_for_unknown_entity() {
      let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
      let verts: &[f32] = &[0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0];
      let idxs: &[u32] = &[0, 1, 2];
      let ok = world.add_mesh_collider(
          99, verts, idxs, 0.0, 0.0, 0.0,
          false, 0.5, 0.0, u32::MAX, u32::MAX, 1,
      );
      assert!(!ok);
  }

  #[test]
  fn test_physics3d_add_mesh_collider_returns_false_for_empty_vertices() {
      let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
      world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);
      let ok = world.add_mesh_collider(
          0, &[], &[0, 1, 2], 0.0, 0.0, 0.0,
          false, 0.5, 0.0, u32::MAX, u32::MAX, 1,
      );
      assert!(!ok);
  }

  #[test]
  fn test_physics3d_add_mesh_collider_returns_false_for_empty_indices() {
      let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
      world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);
      let verts: &[f32] = &[0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0];
      let ok = world.add_mesh_collider(
          0, verts, &[], 0.0, 0.0, 0.0,
          false, 0.5, 0.0, u32::MAX, u32::MAX, 1,
      );
      assert!(!ok);
  }

  #[test]
  fn test_physics3d_add_mesh_collider_registers_in_collider_handles() {
      let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
      world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);
      let verts: &[f32] = &[0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0];
      let idxs: &[u32] = &[0, 1, 2];
      world.add_mesh_collider(
          0, verts, idxs, 0.0, 0.0, 0.0,
          false, 0.5, 0.0, u32::MAX, u32::MAX, 7,
      );
      assert!(world.collider_handles.contains_key(&(0, 7)));
  }

  #[test]
  fn test_physics3d_add_convex_collider_returns_true_for_valid_entity() {
      let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
      world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);
      // Tetrahedron
      let verts: &[f32] = &[
          0.0, 0.0, 0.0,
          1.0, 0.0, 0.0,
          0.0, 1.0, 0.0,
          0.0, 0.0, 1.0,
      ];
      let ok = world.add_convex_collider(
          0, verts, 0.0, 0.0, 0.0,
          false, 0.5, 0.0, 1.0, u32::MAX, u32::MAX, 1,
      );
      assert!(ok);
  }

  #[test]
  fn test_physics3d_add_convex_collider_returns_false_for_unknown_entity() {
      let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
      let verts: &[f32] = &[0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0];
      let ok = world.add_convex_collider(
          42, verts, 0.0, 0.0, 0.0,
          false, 0.5, 0.0, 1.0, u32::MAX, u32::MAX, 1,
      );
      assert!(!ok);
  }

  #[test]
  fn test_physics3d_add_convex_collider_returns_false_for_empty_vertices() {
      let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
      world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);
      let ok = world.add_convex_collider(
          0, &[], 0.0, 0.0, 0.0,
          false, 0.5, 0.0, 1.0, u32::MAX, u32::MAX, 1,
      );
      assert!(!ok);
  }

  #[test]
  fn test_physics3d_add_convex_collider_registers_in_collider_handles() {
      let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
      world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);
      let verts: &[f32] = &[
          0.0, 0.0, 0.0,
          1.0, 0.0, 0.0,
          0.0, 1.0, 0.0,
          0.0, 0.0, 1.0,
      ];
      world.add_convex_collider(
          0, verts, 0.0, 0.0, 0.0,
          false, 0.5, 0.0, 1.0, u32::MAX, u32::MAX, 5,
      );
      assert!(world.collider_handles.contains_key(&(0, 5)));
  }

  #[test]
  fn test_physics3d_add_convex_collider_degenerate_falls_back_to_sphere() {
      // Only 2 non-unique points — convex_hull returns None → fallback ball(0.5)
      let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
      world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);
      let verts: &[f32] = &[0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
      // Should still succeed (ball fallback) rather than panic
      let ok = world.add_convex_collider(
          0, verts, 0.0, 0.0, 0.0,
          false, 0.5, 0.0, 1.0, u32::MAX, u32::MAX, 3,
      );
      assert!(ok);
  }
  ```

  Run — expect compile error (functions not yet defined):

  ```bash
  cargo test -p gwen-core --features physics3d -- test_physics3d_add_mesh test_physics3d_add_convex 2>&1 | head -30
  ```

  Expected: `error[E0599]: no method named 'add_mesh_collider' found`

- [ ] **Step 1.2 — Implement `add_mesh_collider` and `add_convex_collider` in world.rs**

  In `crates/gwen-core/src/physics3d/world.rs`, add both methods **after** `add_capsule_collider`
  (after line ~729 in the original file). Insert before the first `remove_*` or `get_*` method.

  ```rust
  /// Attach a triangle-mesh collider to a 3D body.
  ///
  /// `vertices_flat` must be a multiple of 3 floats (`[x0,y0,z0, x1,y1,z1, ...]`).
  /// `indices_flat` must be a multiple of 3 u32s (`[a0,b0,c0, ...]`).
  ///
  /// Returns `false` when the entity has no registered body, or either slice is empty.
  #[allow(clippy::too_many_arguments)]
  pub fn add_mesh_collider(
      &mut self,
      entity_index: u32,
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
      collider_id: u32,
  ) -> bool {
      let verts: Vec<rapier3d::na::Point3<f32>> = vertices_flat
          .chunks_exact(3)
          .map(|c| rapier3d::na::Point3::new(c[0], c[1], c[2]))
          .collect();
      let idxs: Vec<[u32; 3]> = indices_flat
          .chunks_exact(3)
          .map(|c| [c[0], c[1], c[2]])
          .collect();
      if verts.is_empty() || idxs.is_empty() {
          return false;
      }
      let builder = ColliderBuilder::trimesh(verts, idxs);
      self.insert_collider(
          entity_index,
          collider_id,
          offset_x,
          offset_y,
          offset_z,
          is_sensor,
          friction,
          restitution,
          layer_bits,
          mask_bits,
          builder,
      )
  }

  /// Attach a convex-hull collider to a 3D body.
  ///
  /// `vertices_flat` must be a multiple of 3 floats (`[x0,y0,z0, x1,y1,z1, ...]`).
  /// When Rapier cannot compute a convex hull (e.g. degenerate point cloud), the
  /// function falls back to a unit sphere (`ball(0.5)`) rather than failing.
  ///
  /// Returns `false` when the entity has no registered body or the vertex slice is empty.
  #[allow(clippy::too_many_arguments)]
  pub fn add_convex_collider(
      &mut self,
      entity_index: u32,
      vertices_flat: &[f32],
      offset_x: f32,
      offset_y: f32,
      offset_z: f32,
      is_sensor: bool,
      friction: f32,
      restitution: f32,
      density: f32,
      layer_bits: u32,
      mask_bits: u32,
      collider_id: u32,
  ) -> bool {
      let verts: Vec<rapier3d::na::Point3<f32>> = vertices_flat
          .chunks_exact(3)
          .map(|c| rapier3d::na::Point3::new(c[0], c[1], c[2]))
          .collect();
      if verts.is_empty() {
          return false;
      }
      let builder = ColliderBuilder::convex_hull(&verts)
          .unwrap_or_else(|| ColliderBuilder::ball(0.5))
          .density(density);
      self.insert_collider(
          entity_index,
          collider_id,
          offset_x,
          offset_y,
          offset_z,
          is_sensor,
          friction,
          restitution,
          layer_bits,
          mask_bits,
          builder,
      )
  }
  ```

- [ ] **Step 1.3 — Run tests — expect green**

  ```bash
  cargo test -p gwen-core --features physics3d -- test_physics3d_add_mesh test_physics3d_add_convex 2>&1 | tail -20
  ```

  Expected output (all 9 tests pass):

  ```
  test tests::test_physics3d_add_mesh_collider_returns_true_for_valid_entity ... ok
  test tests::test_physics3d_add_mesh_collider_returns_false_for_unknown_entity ... ok
  test tests::test_physics3d_add_mesh_collider_returns_false_for_empty_vertices ... ok
  test tests::test_physics3d_add_mesh_collider_returns_false_for_empty_indices ... ok
  test tests::test_physics3d_add_mesh_collider_registers_in_collider_handles ... ok
  test tests::test_physics3d_add_convex_collider_returns_true_for_valid_entity ... ok
  test tests::test_physics3d_add_convex_collider_returns_false_for_unknown_entity ... ok
  test tests::test_physics3d_add_convex_collider_returns_false_for_empty_vertices ... ok
  test tests::test_physics3d_add_convex_collider_registers_in_collider_handles ... ok
  test tests::test_physics3d_add_convex_collider_degenerate_falls_back_to_sphere ... ok

  test result: ok. 10 passed; 0 failed
  ```

- [ ] **Step 1.4 — Full Rust test suite stays green**

  ```bash
  cargo test -p gwen-core --features physics3d 2>&1 | tail -5
  ```

  Expected: `test result: ok. N passed; 0 failed`

- [ ] **Step 1.5 — Commit**

  ```bash
  git add crates/gwen-core/src/physics3d/world.rs
  git commit -m "feat(physics3d): add add_mesh_collider + add_convex_collider to PhysicsWorld3D

  Implements trimesh and convex-hull collider attachment on PhysicsWorld3D.
  Both methods delegate to the existing insert_collider() helper, keeping
  sensor/friction/restitution/layer logic in one place.
  Convex-hull silently falls back to ball(0.5) on degenerate input.

  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
  ```

---

## Task 2: Rust — bulk_add_static_boxes in world.rs

**Files:**

- Modify: `crates/gwen-core/src/physics3d/world.rs`

### What to build

A single method that creates N fixed rigid bodies + box colliders in one pass.
`entity_indices` are pre-allocated by the TypeScript caller. The function bypasses
the duplicate-check guard in `add_body()` by writing directly into `self.entity_handles`;
callers must ensure the indices are fresh.

The `half_extents_flat` slice may contain either exactly 3 floats (uniform for all N)
or exactly N×3 floats (per-entity). The function returns the number of bodies successfully created.

---

- [ ] **Step 2.1 — Write failing tests first**

  Append to `#[cfg(test)] mod tests` in `world.rs`:

  ```rust
  #[test]
  fn test_physics3d_bulk_add_static_boxes_returns_n_on_success() {
      let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
      let indices: &[u32] = &[10, 11, 12];
      let positions: &[f32] = &[
          0.0, 0.0, 0.0,
          5.0, 0.0, 0.0,
          10.0, 0.0, 0.0,
      ];
      let half_extents: &[f32] = &[0.5, 0.5, 0.5]; // uniform
      let n = world.bulk_add_static_boxes(
          indices, positions, half_extents,
          0.5, 0.0, u32::MAX, u32::MAX,
      );
      assert_eq!(n, 3);
  }

  #[test]
  fn test_physics3d_bulk_add_static_boxes_registers_entity_handles() {
      let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
      let indices: &[u32] = &[20, 21];
      let positions: &[f32] = &[0.0, 0.0, 0.0, 1.0, 0.0, 0.0];
      let half_extents: &[f32] = &[0.5, 0.5, 0.5];
      world.bulk_add_static_boxes(
          indices, positions, half_extents,
          0.5, 0.0, u32::MAX, u32::MAX,
      );
      assert!(world.entity_handles.contains_key(&20));
      assert!(world.entity_handles.contains_key(&21));
  }

  #[test]
  fn test_physics3d_bulk_add_static_boxes_registers_collider_handles() {
      let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
      let indices: &[u32] = &[30, 31];
      let positions: &[f32] = &[0.0, 0.0, 0.0, 1.0, 0.0, 0.0];
      let half_extents: &[f32] = &[0.5, 0.5, 0.5];
      world.bulk_add_static_boxes(
          indices, positions, half_extents,
          0.5, 0.0, u32::MAX, u32::MAX,
      );
      // collider_id is always 0 for bulk-spawned boxes
      assert!(world.collider_handles.contains_key(&(30, 0)));
      assert!(world.collider_handles.contains_key(&(31, 0)));
  }

  #[test]
  fn test_physics3d_bulk_add_static_boxes_per_entity_half_extents() {
      let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
      let indices: &[u32] = &[40, 41];
      let positions: &[f32] = &[0.0, 0.0, 0.0, 5.0, 0.0, 0.0];
      // Per-entity half extents: entity 40 → 0.5,0.5,0.5; entity 41 → 1.0,2.0,3.0
      let half_extents: &[f32] = &[0.5, 0.5, 0.5, 1.0, 2.0, 3.0];
      let n = world.bulk_add_static_boxes(
          indices, positions, half_extents,
          0.5, 0.0, u32::MAX, u32::MAX,
      );
      assert_eq!(n, 2);
      assert!(world.entity_handles.contains_key(&40));
      assert!(world.entity_handles.contains_key(&41));
  }

  #[test]
  fn test_physics3d_bulk_add_static_boxes_empty_indices_returns_zero() {
      let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
      let n = world.bulk_add_static_boxes(
          &[], &[], &[0.5, 0.5, 0.5],
          0.5, 0.0, u32::MAX, u32::MAX,
      );
      assert_eq!(n, 0);
  }
  ```

  Run — expect compile error:

  ```bash
  cargo test -p gwen-core --features physics3d -- test_physics3d_bulk_add_static 2>&1 | head -15
  ```

  Expected: `error[E0599]: no method named 'bulk_add_static_boxes' found`

- [ ] **Step 2.2 — Implement `bulk_add_static_boxes` in world.rs**

  Add after `add_convex_collider` (after the method from Task 1):

  ```rust
  /// Bulk-create N static rigid bodies with box colliders in a single call.
  ///
  /// # Arguments
  /// * `entity_indices`    — Pre-allocated ECS entity slot indices (one per body).
  /// * `positions_flat`    — Flat `[x0,y0,z0, x1,y1,z1, ...]` — must have `N × 3` elements.
  /// * `half_extents_flat` — Either `3` floats (uniform for all N) or `N × 3` floats
  ///                         (per-entity half-extents).
  /// * `friction`          — Surface friction coefficient (≥ 0).
  /// * `restitution`       — Bounciness coefficient (\[0, 1\]).
  /// * `layer_bits`        — Collision layer membership bitmask.
  /// * `mask_bits`         — Collision filter bitmask.
  ///
  /// Returns the number of bodies created. Each body uses `collider_id = 0`.
  ///
  /// # Panics
  /// Panics in debug builds if `positions_flat.len() < entity_indices.len() * 3`.
  #[allow(clippy::too_many_arguments)]
  pub fn bulk_add_static_boxes(
      &mut self,
      entity_indices: &[u32],
      positions_flat: &[f32],
      half_extents_flat: &[f32],
      friction: f32,
      restitution: f32,
      layer_bits: u32,
      mask_bits: u32,
  ) -> u32 {
      let n = entity_indices.len();
      if n == 0 {
          return 0;
      }
      let uniform_extents = half_extents_flat.len() == 3;
      let groups = Self::make_interaction_groups(layer_bits, mask_bits);
      let mut count = 0u32;

      for i in 0..n {
          let px = positions_flat[i * 3];
          let py = positions_flat[i * 3 + 1];
          let pz = positions_flat[i * 3 + 2];
          let (hx, hy, hz) = if uniform_extents {
              (half_extents_flat[0], half_extents_flat[1], half_extents_flat[2])
          } else {
              (
                  half_extents_flat[i * 3],
                  half_extents_flat[i * 3 + 1],
                  half_extents_flat[i * 3 + 2],
              )
          };
          let entity_index = entity_indices[i];

          let rb = RigidBodyBuilder::fixed()
              .translation(vector![px, py, pz])
              .build();
          let handle = self.rigid_body_set.insert(rb);
          self.entity_handles.insert(entity_index, handle);

          let collider = ColliderBuilder::cuboid(hx, hy, hz)
              .collision_groups(groups)
              .friction(friction)
              .restitution(restitution)
              .user_data(pack_user_data(entity_index, 0))
              .active_events(ActiveEvents::COLLISION_EVENTS)
              .build();
          let ch = self.collider_set.insert_with_parent(
              collider,
              handle,
              &mut self.rigid_body_set,
          );
          self.collider_handles.insert((entity_index, 0), ch);
          count += 1;
      }
      count
  }
  ```

- [ ] **Step 2.3 — Run tests — expect green**

  ```bash
  cargo test -p gwen-core --features physics3d -- test_physics3d_bulk_add_static 2>&1 | tail -15
  ```

  Expected:

  ```
  test tests::test_physics3d_bulk_add_static_boxes_returns_n_on_success ... ok
  test tests::test_physics3d_bulk_add_static_boxes_registers_entity_handles ... ok
  test tests::test_physics3d_bulk_add_static_boxes_registers_collider_handles ... ok
  test tests::test_physics3d_bulk_add_static_boxes_per_entity_half_extents ... ok
  test tests::test_physics3d_bulk_add_static_boxes_empty_indices_returns_zero ... ok

  test result: ok. 5 passed; 0 failed
  ```

- [ ] **Step 2.4 — Full Rust test suite stays green**

  ```bash
  cargo test -p gwen-core --features physics3d 2>&1 | tail -5
  ```

- [ ] **Step 2.5 — Commit**

  ```bash
  git add crates/gwen-core/src/physics3d/world.rs
  git commit -m "feat(physics3d): add bulk_add_static_boxes to PhysicsWorld3D

  Spawns N fixed rigid bodies + box colliders in a single Rust pass.
  Supports both uniform (3 floats) and per-entity (N×3 floats) half-extents.
  Bypasses add_body duplicate check — caller must supply fresh entity indices.
  Each bulk-spawned body uses collider_id=0 in the collider_handles map.

  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
  ```

---

## Task 3: Rust — WASM-bindgen exports in bindings.rs

**Files:**

- Modify: `crates/gwen-core/src/bindings.rs`

### What to build

Three new methods on the `#[wasm_bindgen] impl Engine` block, following the exact
pattern of `physics3d_add_capsule_collider` (lines 1438–1473). Each is guarded by
`#[cfg(feature = "physics3d")]` and `#[allow(clippy::too_many_arguments)]`. No separate
`#[wasm_bindgen]` attribute is needed — the impl block's annotation covers all `pub fn`
methods.

**Critical note on `&[u32]` parameters:** wasm-bindgen 0.2.87 (used in this project)
supports `&[u32]` as a parameter type directly (it maps to `Uint32Array` on the JS side).
Confirm this compiles before pushing to Task 4.

---

- [ ] **Step 3.1 — Add `physics3d_add_mesh_collider` to bindings.rs**

  In `crates/gwen-core/src/bindings.rs`, insert **after** the closing brace of
  `physics3d_add_capsule_collider` (after line ~1473):

  ```rust
  /// Attach a triangle-mesh (trimesh) collider to a 3D body.
  ///
  /// Returns `false` if the entity has no registered body, either slice is empty,
  /// or the world is not initialised.
  ///
  /// # Arguments
  /// * `entity_index`    — ECS entity slot index.
  /// * `vertices`        — Flat vertex buffer `[x0,y0,z0, x1,y1,z1, ...]` (length multiple of 3).
  /// * `indices`         — Flat index buffer `[a0,b0,c0, ...]` (length multiple of 3).
  /// * `offset_x/y/z`   — Local-space offset from the body origin (metres).
  /// * `is_sensor`       — When `true`, collision response is suppressed; only events fire.
  /// * `friction`        — Surface friction coefficient (≥ 0).
  /// * `restitution`     — Bounciness coefficient (\[0, 1\]).
  /// * `layer_bits`      — Collision layer membership bitmask.
  /// * `mask_bits`       — Collision filter bitmask.
  /// * `collider_id`     — Stable application-defined ID stored in collision events.
  #[cfg(feature = "physics3d")]
  #[allow(clippy::too_many_arguments)]
  pub fn physics3d_add_mesh_collider(
      &mut self,
      entity_index: u32,
      vertices: &[f32],
      indices: &[u32],
      offset_x: f32,
      offset_y: f32,
      offset_z: f32,
      is_sensor: bool,
      friction: f32,
      restitution: f32,
      layer_bits: u32,
      mask_bits: u32,
      collider_id: u32,
  ) -> bool {
      if let Some(ref mut world) = self.physics3d_world {
          world.add_mesh_collider(
              entity_index,
              vertices,
              indices,
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
      } else {
          false
      }
  }
  ```

- [ ] **Step 3.2 — Add `physics3d_add_convex_collider` to bindings.rs**

  Insert after the closing brace of `physics3d_add_mesh_collider`:

  ```rust
  /// Attach a convex-hull collider to a 3D body.
  ///
  /// Falls back to a unit sphere when Rapier cannot construct a valid convex hull
  /// (degenerate point cloud). Returns `false` if the entity has no registered body,
  /// the vertex slice is empty, or the world is not initialised.
  ///
  /// # Arguments
  /// * `entity_index`    — ECS entity slot index.
  /// * `vertices`        — Flat vertex buffer `[x0,y0,z0, x1,y1,z1, ...]` (length multiple of 3).
  /// * `offset_x/y/z`   — Local-space offset from the body origin (metres).
  /// * `is_sensor`       — When `true`, collision response is suppressed; only events fire.
  /// * `friction`        — Surface friction coefficient (≥ 0).
  /// * `restitution`     — Bounciness coefficient (\[0, 1\]).
  /// * `density`         — Collider density (kg/m³). Applied to dynamic bodies.
  /// * `layer_bits`      — Collision layer membership bitmask.
  /// * `mask_bits`       — Collision filter bitmask.
  /// * `collider_id`     — Stable application-defined ID stored in collision events.
  #[cfg(feature = "physics3d")]
  #[allow(clippy::too_many_arguments)]
  pub fn physics3d_add_convex_collider(
      &mut self,
      entity_index: u32,
      vertices: &[f32],
      offset_x: f32,
      offset_y: f32,
      offset_z: f32,
      is_sensor: bool,
      friction: f32,
      restitution: f32,
      density: f32,
      layer_bits: u32,
      mask_bits: u32,
      collider_id: u32,
  ) -> bool {
      if let Some(ref mut world) = self.physics3d_world {
          world.add_convex_collider(
              entity_index,
              vertices,
              offset_x,
              offset_y,
              offset_z,
              is_sensor,
              friction,
              restitution,
              density,
              layer_bits,
              mask_bits,
              collider_id,
          )
      } else {
          false
      }
  }
  ```

- [ ] **Step 3.3 — Add `physics3d_bulk_spawn_static_boxes` to bindings.rs**

  Insert after the closing brace of `physics3d_add_convex_collider`:

  ```rust
  /// Bulk-spawn N static box bodies in one call.
  ///
  /// Entity indices must be pre-allocated by the TypeScript caller via
  /// `engine.createEntity()`. This function creates the Rapier bodies and
  /// attaches box colliders in one Rust pass.
  ///
  /// Returns the number of bodies successfully created.
  ///
  /// # Arguments
  /// * `entity_indices`    — Pre-allocated ECS entity slot indices (one per body).
  /// * `positions_flat`    — Flat `[x0,y0,z0, x1,y1,z1, ...]` — `N × 3` f32 elements.
  /// * `half_extents_flat` — Either 3 floats (uniform) or `N × 3` floats (per-entity).
  /// * `friction`          — Surface friction coefficient (≥ 0).
  /// * `restitution`       — Bounciness coefficient (\[0, 1\]).
  /// * `layer_bits`        — Collision layer membership bitmask.
  /// * `mask_bits`         — Collision filter bitmask.
  #[cfg(feature = "physics3d")]
  #[allow(clippy::too_many_arguments)]
  pub fn physics3d_bulk_spawn_static_boxes(
      &mut self,
      entity_indices: &[u32],
      positions_flat: &[f32],
      half_extents_flat: &[f32],
      friction: f32,
      restitution: f32,
      layer_bits: u32,
      mask_bits: u32,
  ) -> u32 {
      if let Some(ref mut world) = self.physics3d_world {
          world.bulk_add_static_boxes(
              entity_indices,
              positions_flat,
              half_extents_flat,
              friction,
              restitution,
              layer_bits,
              mask_bits,
          )
      } else {
          0
      }
  }
  ```

- [ ] **Step 3.4 — Verify Rust compilation with WASM target**

  ```bash
  cargo check -p gwen-core --features physics3d --target wasm32-unknown-unknown 2>&1 | tail -10
  ```

  Expected: `Finished dev [unoptimized + debuginfo] target(s) in Xs`

  > **If `&[u32]` fails to compile for WASM target**, change both `&[u32]` parameters
  > (`indices` and `entity_indices`) to accept the data differently:
  >
  > ```rust
  > // Alternative: accept indices as Float32Array-reinterpreted bytes
  > // This is a workaround if wasm-bindgen 0.2.87 rejects &[u32] in wasm32 target
  > // Instead, keep &[u32] — it IS supported since wasm-bindgen 0.2.87.
  > // If the compiler still rejects it, use Vec<u32> as the parameter type.
  > ```

- [ ] **Step 3.5 — Commit**

  ```bash
  git add crates/gwen-core/src/bindings.rs
  git commit -m "feat(physics3d): expose mesh/convex/bulk_spawn bindings via wasm-bindgen

  Adds three new #[wasm_bindgen] exported methods to the Engine impl block:
  - physics3d_add_mesh_collider (trimesh via &[f32] vertices + &[u32] indices)
  - physics3d_add_convex_collider (convex hull via &[f32] vertices + density)
  - physics3d_bulk_spawn_static_boxes (bulk fixed-body creation in one WASM call)

  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
  ```

---

## Task 4: Build WASM + verify

**Files:** None — build step only.

### What to build

Rebuild the Rust → WASM output so the new exports are visible to the TypeScript packages.

---

- [ ] **Step 4.1 — Build WASM**

  ```bash
  pnpm build:wasm 2>&1 | tail -20
  ```

  Expected — no errors, a fresh `.wasm` file and generated JS bindings:

  ```
  Compiling gwen-core v0.1.0
  Finished release [optimized] target(s) in Xs
  [wasm-pack] Done in Xs
  ```

- [ ] **Step 4.2 — Verify new symbols appear in the generated bindings**

  ```bash
  grep -l "physics3d_add_mesh_collider\|physics3d_add_convex_collider\|physics3d_bulk_spawn_static_boxes" \
    packages/physics3d/pkg/*.js packages/physics3d/pkg/*.d.ts 2>/dev/null \
    || grep -rl "physics3d_add_mesh_collider" target/wasm-pack 2>/dev/null | head -5
  ```

  > Adjust the glob to wherever `wasm-pack` places the generated JS glue in your project.
  > The key check is that the symbol name appears in the generated `.d.ts` file.

- [ ] **Step 4.3 — Commit (if generated files are tracked)**

  ```bash
  git add -A packages/physics3d/pkg/ 2>/dev/null || true
  git commit -m "build: rebuild physics3d WASM with mesh/convex/bulk exports

  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
    2>/dev/null || echo "Nothing to commit — generated files may be gitignored"
  ```

---

## Task 5: TypeScript — wire mesh/convex in addColliderImpl + WasmBridge interface

**Files:**

- Modify: `packages/physics3d/src/index.ts`
- Modify: `packages/physics3d/tests/colliders.test.ts` (local-mode mesh/convex tests)
- Modify: `packages/physics3d/tests/wasm-backend.test.ts` (WASM-mode mesh/convex tests)

### What to build

1. Extend the `Physics3DWasmBridge` interface (lines ~83–228 in `index.ts`) with three new
   optional methods whose parameter order **matches the Rust bindings exactly**.
2. Add two branches in `addColliderImpl` (inside the `if (backendMode === 'wasm')` block)
   for `shape.type === 'mesh'` and `shape.type === 'convex'`.
3. Add `density` to the existing `physics3d_add_box_collider` and related call-sites is NOT
   required here — that is a pre-existing discrepancy and out of scope.

Note on parameter ordering: the NEW functions use offset-before-material order (matching
the Rust signature), unlike the existing box/sphere/capsule entries in the TypeScript interface
which use a legacy ordering. The new declarations are self-consistent with the Rust exports.

---

- [ ] **Step 5.1 — Write failing tests first**

  In `packages/physics3d/tests/colliders.test.ts`, add after the existing
  `'adds a capsule collider to a registered entity'` test:

  ```typescript
  it('adds a mesh collider to a registered entity (local mode)', () => {
    const { service } = setup();
    service.createBody(5n);
    const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const indices = new Uint32Array([0, 1, 2]);
    const result = service.addCollider(5n, {
      shape: { type: 'mesh', vertices, indices },
      colliderId: 0,
    });
    expect(result).toBe(true);
  });

  it('adds a convex collider to a registered entity (local mode)', () => {
    const { service } = setup();
    service.createBody(6n);
    const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const result = service.addCollider(6n, {
      shape: { type: 'convex', vertices },
      colliderId: 0,
    });
    expect(result).toBe(true);
  });
  ```

  In `packages/physics3d/tests/wasm-backend.test.ts`, add near the top of the file
  (alongside the other mock function declarations) and then add a describe block:

  At the top (with the other `const` mocks):

  ```typescript
  const physics3dAddBoxCollider = vi.fn().mockReturnValue(true);
  const physics3dAddMeshCollider = vi.fn().mockReturnValue(true);
  const physics3dAddConvexCollider = vi.fn().mockReturnValue(true);
  ```

  Add `physics3d_add_box_collider`, `physics3d_add_mesh_collider`, and
  `physics3d_add_convex_collider` to the `getPhysicsBridge()` return in `mockBridge`:

  ```typescript
  physics3d_add_box_collider: physics3dAddBoxCollider,
  physics3d_add_mesh_collider: physics3dAddMeshCollider,
  physics3d_add_convex_collider: physics3dAddConvexCollider,
  ```

  Then add a new describe block at the end of the file:

  ```typescript
  describe('Physics3D WASM backend — mesh and convex colliders', () => {
    beforeEach(() => {
      physics3dInit.mockReset();
      physics3dAddBody.mockReset().mockReturnValue(true);
      physics3dAddMeshCollider.mockReset().mockReturnValue(true);
      physics3dAddConvexCollider.mockReset().mockReturnValue(true);
    });

    function setupWithBody(entityId = 1n) {
      const { engine, services } = makeEngine();
      const plugin = Physics3DPlugin();
      plugin.setup(engine);
      const service = services.get('physics3d') as Physics3DAPI;
      service.createBody(entityId);
      return { service };
    }

    it('delegates mesh collider to physics3d_add_mesh_collider in wasm mode', () => {
      const { service } = setupWithBody(1n);
      const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
      const indices = new Uint32Array([0, 1, 2]);
      const ok = service.addCollider(1n, {
        shape: { type: 'mesh', vertices, indices },
        colliderId: 1,
      });
      expect(ok).toBe(true);
      expect(physics3dAddMeshCollider).toHaveBeenCalledOnce();
      const args = physics3dAddMeshCollider.mock.calls[0];
      // args[0] = entityIndex, args[1] = vertices, args[2] = indices
      expect(args[0]).toBe(1); // entityIndex
      expect(args[1]).toBe(vertices);
      expect(args[2]).toBe(indices);
    });

    it('delegates convex collider to physics3d_add_convex_collider in wasm mode', () => {
      const { service } = setupWithBody(2n);
      const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
      const ok = service.addCollider(2n, {
        shape: { type: 'convex', vertices },
        colliderId: 1,
        density: 2.5,
      });
      expect(ok).toBe(true);
      expect(physics3dAddConvexCollider).toHaveBeenCalledOnce();
      const args = physics3dAddConvexCollider.mock.calls[0];
      // args[0] = entityIndex, args[1] = vertices
      expect(args[0]).toBe(2);
      expect(args[1]).toBe(vertices);
    });

    it('returns false when physics3d_add_mesh_collider is absent from bridge', () => {
      // Simulate older WASM that lacks the new export
      physics3dAddMeshCollider.mockReturnValue(undefined);
      const { service } = setupWithBody(3n);
      const ok = service.addCollider(3n, {
        shape: {
          type: 'mesh',
          vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
          indices: new Uint32Array([0, 1, 2]),
        },
        colliderId: 1,
      });
      // Optional chaining (?.) returns undefined → false
      expect(ok).toBe(false);
    });
  });
  ```

  Run tests — expect failures:

  ```bash
  pnpm --filter @gwenjs/physics3d exec vitest run tests/colliders.test.ts tests/wasm-backend.test.ts 2>&1 | tail -20
  ```

  Expected: tests for mesh/convex fail.

- [ ] **Step 5.2 — Extend `Physics3DWasmBridge` interface in index.ts**

  In `packages/physics3d/src/index.ts`, add the three new methods to the
  `Physics3DWasmBridge` interface (after `physics3d_remove_collider` on line ~210):

  ```typescript
  /**
   * Attach a triangle-mesh collider to a 3D body.
   * Parameter order matches the Rust WASM export exactly.
   */
  physics3d_add_mesh_collider?: (
    entityIndex: number,
    vertices: Float32Array,
    indices: Uint32Array,
    offsetX: number,
    offsetY: number,
    offsetZ: number,
    isSensor: number,
    friction: number,
    restitution: number,
    layerBits: number,
    maskBits: number,
    colliderId: number,
  ) => boolean;
  /**
   * Attach a convex-hull collider to a 3D body.
   * Falls back to a unit sphere on degenerate input (Rapier-side).
   * Parameter order matches the Rust WASM export exactly.
   */
  physics3d_add_convex_collider?: (
    entityIndex: number,
    vertices: Float32Array,
    offsetX: number,
    offsetY: number,
    offsetZ: number,
    isSensor: number,
    friction: number,
    restitution: number,
    density: number,
    layerBits: number,
    maskBits: number,
    colliderId: number,
  ) => boolean;
  /**
   * Bulk-spawn N static box bodies in one WASM call.
   * `entityIndices` must be pre-allocated by the TypeScript caller.
   */
  physics3d_bulk_spawn_static_boxes?: (
    entityIndices: Uint32Array,
    positionsFlat: Float32Array,
    halfExtentsFlat: Float32Array,
    friction: number,
    restitution: number,
    layerBits: number,
    maskBits: number,
  ) => number;
  ```

- [ ] **Step 5.3 — Wire mesh and convex in `addColliderImpl`**

  In `packages/physics3d/src/index.ts`, inside `addColliderImpl` after the
  `if (shape.type === 'capsule')` block (around line 1059), add:

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
        isSensor,
        friction,
        restitution,
        membership,
        filter,
        colliderId,
      ) ?? false
    );
  }
  if (shape.type === 'convex') {
    return (
      wasmBridge!.physics3d_add_convex_collider?.(
        idx,
        shape.vertices,
        ox,
        oy,
        oz,
        isSensor,
        friction,
        restitution,
        density,
        membership,
        filter,
        colliderId,
      ) ?? false
    );
  }
  ```

  Both blocks sit **inside** the `if (backendMode === 'wasm')` block, immediately before
  the closing `}` and the `return true;` fallback.

- [ ] **Step 5.4 — Run tests — expect green**

  ```bash
  pnpm --filter @gwenjs/physics3d exec vitest run tests/colliders.test.ts tests/wasm-backend.test.ts 2>&1 | tail -20
  ```

  Expected: all tests pass including the new mesh/convex tests.

- [ ] **Step 5.5 — Run full physics3d test suite**

  ```bash
  pnpm --filter @gwenjs/physics3d test 2>&1 | tail -10
  ```

  Expected: `Test Files N passed | N tests passed`

- [ ] **Step 5.6 — Commit**

  ```bash
  git add packages/physics3d/src/index.ts \
          packages/physics3d/tests/colliders.test.ts \
          packages/physics3d/tests/wasm-backend.test.ts
  git commit -m "fix(physics3d): wire mesh and convex colliders through to WASM in addColliderImpl

  Previously mesh/convex shapes fell through the if-chain silently, returning true
  from the local registry without making a WASM call. Rapier3D received no geometry.

  This commit:
  - Adds physics3d_add_mesh_collider and physics3d_add_convex_collider to
    Physics3DWasmBridge (matching Rust parameter order: offsets before material)
  - Adds physics3d_bulk_spawn_static_boxes declaration to Physics3DWasmBridge
  - Adds mesh + convex branches in addColliderImpl that delegate to the new WASM calls
  - Tests both local fallback (returns true) and WASM delegation paths

  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
  ```

---

## Task 6: TypeScript — bulkSpawnStaticBoxes API + useBulkStaticBoxes composable

**Files:**

- Modify: `packages/physics3d/src/types.ts`
- Modify: `packages/physics3d/src/index.ts`
- Create: `packages/physics3d/src/composables/use-bulk-static-boxes.ts`
- Create: `packages/physics3d/tests/bulk-spawn.test.ts`
- Create: `packages/physics3d/tests/composables/use-bulk-static-boxes.test.ts`

### What to build

A high-level `bulkSpawnStaticBoxes` API on `Physics3DAPI` that:

1. Accepts a `BulkStaticBoxesOptions` with flat position/half-extent arrays and optional
   material/layer settings.
2. Creates N ECS entities by calling `_engine!.createEntity()` N times (the engine is
   stored as `_engine` in the plugin closure).
3. In **WASM mode**: calls `physics3d_bulk_spawn_static_boxes` once with all entity indices
   and registers all N handles in `bodyByEntity`.
4. In **local mode**: falls back to N sequential `createBodyLocal()` calls (same integration
   result, slightly slower).
5. Returns `{ entityIds: EntityId[], count: number }`.

A `useBulkStaticBoxes` composable wraps this for use inside actor/system `setup()`.

---

- [ ] **Step 6.1 — Write failing tests first**

  Create `packages/physics3d/tests/bulk-spawn.test.ts`:

  ```typescript
  /**
   * Tests for Physics3DAPI.bulkSpawnStaticBoxes — local and WASM modes.
   */
  import { describe, it, expect, vi, beforeEach } from 'vitest';

  // ── WASM bridge mock (physics3d variant, with bulk spawn) ─────────────────────

  const physics3dInit = vi.fn();
  const physics3dStep = vi.fn();
  const physics3dAddBody = vi.fn().mockReturnValue(true);
  const physics3dBulkSpawnStaticBoxes = vi.fn().mockReturnValue(0);

  // Track how many entities have been created so we can return stable indices
  let entityCounter = 0;

  const mockBridge = {
    variant: 'physics3d' as const,
    getPhysicsBridge: vi.fn(() => ({
      physics3d_init: physics3dInit,
      physics3d_step: physics3dStep,
      physics3d_add_body: physics3dAddBody,
      physics3d_bulk_spawn_static_boxes: physics3dBulkSpawnStaticBoxes,
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
  import type { EntityId } from '@gwenjs/core';

  function makeEngine() {
    const services = new Map<string, unknown>();
    entityCounter = 0;

    const engine = {
      provide: vi.fn((name: string, value: unknown) => {
        services.set(name, value);
      }),
      inject: vi.fn((name: string) => services.get(name)),
      hooks: {
        hook: vi.fn((_name: string, _callback: (...args: unknown[]) => unknown) => vi.fn()),
        callHook: vi.fn(),
      },
      getEntityGeneration: vi.fn(() => 0),
      query: vi.fn(() => []),
      getComponent: vi.fn(),
      wasmBridge: null,
      // createEntity returns stable bigint IDs
      createEntity: vi.fn(() => {
        const idx = entityCounter++;
        return BigInt(idx) as EntityId;
      }),
    } as unknown as GwenEngine;

    return { engine, services };
  }

  // ── Tests ─────────────────────────────────────────────────────────────────────

  describe('bulkSpawnStaticBoxes — local mode (no bulk WASM call)', () => {
    function setup() {
      const { engine, services } = makeEngine();
      const plugin = Physics3DPlugin();
      // Remove bulk spawn from bridge to force local mode behaviour
      mockBridge.getPhysicsBridge.mockReturnValue({
        physics3d_init: physics3dInit,
        physics3d_step: physics3dStep,
        // NO physics3d_add_body → local mode
      });
      plugin.setup(engine);
      const service = services.get('physics3d') as Physics3DAPI;
      return { service, engine };
    }

    beforeEach(() => {
      physics3dInit.mockReset();
      physics3dBulkSpawnStaticBoxes.mockReset().mockReturnValue(0);
      mockBridge.getPhysicsBridge.mockReset();
    });

    it('returns count equal to positions.length / 3', () => {
      const { service } = setup();
      const positions = new Float32Array([0, 0, 0, 5, 0, 0, 10, 0, 0]);
      const { count } = service.bulkSpawnStaticBoxes({
        positions,
        halfExtents: new Float32Array([0.5, 0.5, 0.5]),
      });
      expect(count).toBe(3);
    });

    it('returns entityIds array of length N', () => {
      const { service } = setup();
      const positions = new Float32Array([0, 0, 0, 1, 0, 0]);
      const { entityIds } = service.bulkSpawnStaticBoxes({
        positions,
        halfExtents: new Float32Array([0.5, 0.5, 0.5]),
      });
      expect(entityIds).toHaveLength(2);
    });

    it('creates entity IDs by calling engine.createEntity() N times', () => {
      const { service, engine } = setup();
      const positions = new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0]);
      service.bulkSpawnStaticBoxes({
        positions,
        halfExtents: new Float32Array([0.5, 0.5, 0.5]),
      });
      expect(
        (engine as unknown as { createEntity: ReturnType<typeof vi.fn> }).createEntity,
      ).toHaveBeenCalledTimes(3);
    });

    it('spawned entities are tracked by hasBody', () => {
      const { service } = setup();
      const positions = new Float32Array([0, 0, 0, 5, 0, 0]);
      const { entityIds } = service.bulkSpawnStaticBoxes({
        positions,
        halfExtents: new Float32Array([0.5, 0.5, 0.5]),
      });
      for (const id of entityIds) {
        expect(service.hasBody(id)).toBe(true);
      }
    });
  });

  describe('bulkSpawnStaticBoxes — WASM mode', () => {
    function setup() {
      const { engine, services } = makeEngine();
      // Restore full bridge with bulk spawn
      mockBridge.getPhysicsBridge.mockReturnValue({
        physics3d_init: physics3dInit,
        physics3d_step: physics3dStep,
        physics3d_add_body: physics3dAddBody,
        physics3d_bulk_spawn_static_boxes: physics3dBulkSpawnStaticBoxes,
      });
      const plugin = Physics3DPlugin();
      plugin.setup(engine);
      const service = services.get('physics3d') as Physics3DAPI;
      return { service, engine };
    }

    beforeEach(() => {
      physics3dInit.mockReset();
      physics3dAddBody.mockReset().mockReturnValue(true);
      physics3dBulkSpawnStaticBoxes
        .mockReset()
        .mockImplementation((indices: Uint32Array) => indices.length);
      mockBridge.getPhysicsBridge.mockReset();
    });

    it('calls physics3d_bulk_spawn_static_boxes once for N entities', () => {
      const { service } = setup();
      const positions = new Float32Array([0, 0, 0, 5, 0, 0, 10, 0, 0]);
      service.bulkSpawnStaticBoxes({
        positions,
        halfExtents: new Float32Array([0.5, 0.5, 0.5]),
      });
      expect(physics3dBulkSpawnStaticBoxes).toHaveBeenCalledOnce();
    });

    it('passes a Uint32Array of entity indices as first argument', () => {
      const { service } = setup();
      const positions = new Float32Array([0, 0, 0, 5, 0, 0]);
      service.bulkSpawnStaticBoxes({
        positions,
        halfExtents: new Float32Array([0.5, 0.5, 0.5]),
      });
      const [entityIndices] = physics3dBulkSpawnStaticBoxes.mock.calls[0];
      expect(entityIndices).toBeInstanceOf(Uint32Array);
      expect(entityIndices).toHaveLength(2);
    });

    it('passes friction and restitution to bulk call', () => {
      const { service } = setup();
      service.bulkSpawnStaticBoxes({
        positions: new Float32Array([0, 0, 0]),
        halfExtents: new Float32Array([0.5, 0.5, 0.5]),
        friction: 0.8,
        restitution: 0.1,
      });
      const args = physics3dBulkSpawnStaticBoxes.mock.calls[0];
      // args: [entityIndices, positions, halfExtents, friction, restitution, layerBits, maskBits]
      expect(args[3]).toBeCloseTo(0.8);
      expect(args[4]).toBeCloseTo(0.1);
    });

    it('returns count matching WASM return value', () => {
      const { service } = setup();
      physics3dBulkSpawnStaticBoxes.mockReturnValue(5);
      const positions = new Float32Array(new Array(15).fill(0)); // 5 entities × 3
      const { count } = service.bulkSpawnStaticBoxes({
        positions,
        halfExtents: new Float32Array([0.5, 0.5, 0.5]),
      });
      expect(count).toBe(5);
    });

    it('marks all spawned entities as hasBody', () => {
      const { service } = setup();
      const positions = new Float32Array([0, 0, 0, 5, 0, 0, 10, 0, 0]);
      const { entityIds } = service.bulkSpawnStaticBoxes({
        positions,
        halfExtents: new Float32Array([0.5, 0.5, 0.5]),
      });
      for (const id of entityIds) {
        expect(service.hasBody(id)).toBe(true);
      }
    });
  });
  ```

  Create `packages/physics3d/tests/composables/use-bulk-static-boxes.test.ts`:

  ```typescript
  import { vi, describe, it, expect, beforeEach } from 'vitest';
  import type { EntityId } from '@gwenjs/core';
  import type { BulkStaticBoxesResult } from '../../src/types.js';

  vi.mock('@gwenjs/core/scene', () => ({
    _getActorEntityId: vi.fn(() => 0n),
  }));

  const mockResult: BulkStaticBoxesResult = {
    entityIds: [0n as EntityId, 1n as EntityId],
    count: 2,
  };

  const mockPhysics3D = {
    bulkSpawnStaticBoxes: vi.fn(() => mockResult),
  };

  vi.mock('../../src/composables.js', () => ({
    usePhysics3D: vi.fn(() => mockPhysics3D),
  }));

  import { useBulkStaticBoxes } from '../../src/composables/use-bulk-static-boxes.js';

  describe('useBulkStaticBoxes', () => {
    const positions = new Float32Array([0, 0, 0, 5, 0, 0]);
    const halfExtents = new Float32Array([0.5, 0.5, 0.5]);

    beforeEach(() => {
      vi.clearAllMocks();
      mockPhysics3D.bulkSpawnStaticBoxes.mockReturnValue(mockResult);
    });

    it('calls physics3d.bulkSpawnStaticBoxes with correct options', () => {
      useBulkStaticBoxes({ positions, halfExtents });
      expect(mockPhysics3D.bulkSpawnStaticBoxes).toHaveBeenCalledWith(
        expect.objectContaining({ positions, halfExtents }),
      );
    });

    it('returns the BulkStaticBoxesResult from the service', () => {
      const result = useBulkStaticBoxes({ positions, halfExtents });
      expect(result.count).toBe(2);
      expect(result.entityIds).toHaveLength(2);
    });

    it('forwards friction and restitution to the service', () => {
      useBulkStaticBoxes({ positions, halfExtents, friction: 0.9, restitution: 0.2 });
      expect(mockPhysics3D.bulkSpawnStaticBoxes).toHaveBeenCalledWith(
        expect.objectContaining({ friction: 0.9, restitution: 0.2 }),
      );
    });

    it('forwards layers and mask to the service', () => {
      useBulkStaticBoxes({
        positions,
        halfExtents,
        layers: ['ground'],
        mask: ['player', 'enemy'],
      });
      expect(mockPhysics3D.bulkSpawnStaticBoxes).toHaveBeenCalledWith(
        expect.objectContaining({ layers: ['ground'], mask: ['player', 'enemy'] }),
      );
    });
  });
  ```

  Run — expect failures:

  ```bash
  pnpm --filter @gwenjs/physics3d exec vitest run tests/bulk-spawn.test.ts \
    tests/composables/use-bulk-static-boxes.test.ts 2>&1 | tail -20
  ```

- [ ] **Step 6.2 — Add types to types.ts**

  In `packages/physics3d/src/types.ts`, add after the `Physics3DColliderOptions` interface
  (around line 311, after the closing brace of `Physics3DColliderOptions`):

  ```typescript
  // ─── Bulk spawn ───────────────────────────────────────────────────────────────

  /**
   * Options accepted by {@link Physics3DAPI.bulkSpawnStaticBoxes}.
   */
  export interface BulkStaticBoxesOptions {
    /**
     * Flat position buffer `[x0,y0,z0, x1,y1,z1, ...]`.
     * Length must be a multiple of 3. `N = positions.length / 3`.
     */
    positions: Float32Array;
    /**
     * Flat half-extents buffer.
     * Either 3 floats (uniform for all N boxes) or `N × 3` floats (per-box).
     */
    halfExtents: Float32Array;
    /** Surface friction coefficient ≥ 0. @default 0.5 */
    friction?: number;
    /** Bounciness coefficient in [0, 1]. @default 0.0 */
    restitution?: number;
    /** Named collision layers each box belongs to. Resolved to bitmask. */
    layers?: string[];
    /** Named layers each box collides with. Resolved to bitmask. */
    mask?: string[];
  }

  /**
   * Result returned by {@link Physics3DAPI.bulkSpawnStaticBoxes}.
   */
  export interface BulkStaticBoxesResult {
    /** Packed EntityIds for all successfully created bodies, in spawn order. */
    entityIds: EntityId[];
    /** Number of bodies actually created (may be less than N on failure). */
    count: number;
  }
  ```

  Also add `bulkSpawnStaticBoxes` to the `Physics3DAPI` interface. Find the `addCollider`
  method entry (around line 655) and add the new method after `removeCollider`:

  ````typescript
  /**
   * Spawn N static box rigid bodies in a single operation.
   *
   * In **WASM mode** this makes a single Rust call via `physics3d_bulk_spawn_static_boxes`,
   * amortising the per-body overhead for large static geometry (e.g. level platforms).
   * In **fallback mode** this loops and calls `createBody` N times.
   *
   * Entity IDs are allocated internally via `engine.createEntity()`.
   *
   * @param options - Position buffer, half-extents, and optional material/layer overrides.
   * @returns Packed entity IDs and count of created bodies.
   *
   * @example
   * ```ts
   * const { entityIds } = physics3d.bulkSpawnStaticBoxes({
   *   positions: new Float32Array([0,0,0, 5,0,0, 10,0,0]),
   *   halfExtents: new Float32Array([0.5, 0.5, 0.5]),
   * });
   * ```
   *
   * @since 1.1.0
   */
  bulkSpawnStaticBoxes(options: BulkStaticBoxesOptions): BulkStaticBoxesResult;
  ````

  Add the new types to the exports at the top of `types.ts` (or make sure they are
  exported — they should be, since the interface is top-level).

- [ ] **Step 6.3 — Implement `bulkSpawnStaticBoxes` in index.ts**

  In `packages/physics3d/src/index.ts`:

  a) Add `BulkStaticBoxesOptions` and `BulkStaticBoxesResult` to the imports from `./types.js`
  (find the existing named import for `Physics3DColliderOptions` and add the new names):

  ```typescript
  // In the existing types import line, add:
  import type {
    // ... existing imports ...
    BulkStaticBoxesOptions,
    BulkStaticBoxesResult,
  } from './types.js';
  ```

  b) Add the implementation function (place it after `addCollider` and `removeCollider`,
  before the `// ─── Sensor state ───` section):

  ```typescript
  const bulkSpawnStaticBoxes = (options: BulkStaticBoxesOptions): BulkStaticBoxesResult => {
    const n = options.positions.length / 3;
    const friction = options.friction ?? 0.5;
    const restitution = options.restitution ?? 0.0;
    const membership = resolveLayerBits(options.layers, layerRegistry);
    const filter = resolveLayerBits(options.mask, layerRegistry);

    // Create N ECS entities
    const entityIds: EntityId[] = [];
    const entityIndices = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      const eid = _engine!.createEntity() as unknown as EntityId;
      entityIds.push(eid);
      entityIndices[i] = toEntityIndex(eid);
    }

    if (backendMode === 'wasm' && wasmBridge!.physics3d_bulk_spawn_static_boxes) {
      const spawned = wasmBridge!.physics3d_bulk_spawn_static_boxes(
        entityIndices,
        options.positions,
        options.halfExtents,
        friction,
        restitution,
        membership,
        filter,
      );
      // Register all entity handles in bodyByEntity so hasBody() works
      for (let i = 0; i < n; i++) {
        const handle: Physics3DBodyHandle = {
          bodyId: nextBodyId++,
          entityId: entityIds[i],
          kind: 'fixed',
          mass: 0,
          linearDamping: 0,
          angularDamping: 0,
        };
        bodyByEntity.set(entityIndices[i], handle);
      }
      return { entityIds, count: spawned };
    }

    // Local fallback — create bodies one by one
    for (let i = 0; i < n; i++) {
      const px = options.positions[i * 3];
      const py = options.positions[i * 3 + 1];
      const pz = options.positions[i * 3 + 2];
      const uniform = options.halfExtents.length === 3;
      const hx = uniform ? options.halfExtents[0] : options.halfExtents[i * 3];
      const hy = uniform ? options.halfExtents[1] : options.halfExtents[i * 3 + 1];
      const hz = uniform ? options.halfExtents[2] : options.halfExtents[i * 3 + 2];

      createBodyLocal(entityIds[i], {
        kind: 'fixed',
        initialPosition: { x: px, y: py, z: pz },
        colliders: [
          {
            shape: { type: 'box', halfX: hx, halfY: hy, halfZ: hz },
            friction,
            restitution,
            layers: options.layers,
            mask: options.mask,
          },
        ],
      });
    }
    return { entityIds, count: n };
  };
  ```

  c) Add `bulkSpawnStaticBoxes` to the `service` object (in the `const service: Physics3DAPI` block
  after `updateSensorState`):

  ```typescript
  bulkSpawnStaticBoxes,
  ```

- [ ] **Step 6.4 — Create `use-bulk-static-boxes.ts` composable**

  Create `packages/physics3d/src/composables/use-bulk-static-boxes.ts`:

  ````typescript
  import { usePhysics3D } from '../composables.js';
  import type { BulkStaticBoxesOptions, BulkStaticBoxesResult } from '../types.js';

  /**
   * Spawn N static box bodies in one call from inside an actor or system setup().
   *
   * Internally delegates to {@link Physics3DAPI.bulkSpawnStaticBoxes}. Prefer this
   * composable over looping `useStaticBody` when placing large amounts of static
   * geometry (platforms, walls, terrain tiles) — the WASM backend processes all N
   * boxes in a single Rust call.
   *
   * @param options - Position buffer, half-extents, and optional material overrides.
   * @returns The result containing all spawned entity IDs and count.
   *
   * @example
   * ```ts
   * const { entityIds } = useBulkStaticBoxes({
   *   positions: new Float32Array([0,0,0, 5,0,0, 10,0,0]),
   *   halfExtents: new Float32Array([0.5, 0.5, 0.5]),
   *   friction: 0.6,
   * });
   * ```
   */
  export function useBulkStaticBoxes(options: BulkStaticBoxesOptions): BulkStaticBoxesResult {
    const physics = usePhysics3D();
    return physics.bulkSpawnStaticBoxes(options);
  }
  ````

- [ ] **Step 6.5 — Export new composable from the composables barrel**

  In `packages/physics3d/src/composables/index.ts`, add:

  ```typescript
  export { useBulkStaticBoxes } from './use-bulk-static-boxes.js';
  ```

  Also make sure `BulkStaticBoxesOptions` and `BulkStaticBoxesResult` are re-exported
  from `packages/physics3d/src/index.ts` if they are not already (check the existing
  public exports section and add if missing):

  ```typescript
  export type { BulkStaticBoxesOptions, BulkStaticBoxesResult } from './types.js';
  ```

- [ ] **Step 6.6 — Run tests — expect green**

  ```bash
  pnpm --filter @gwenjs/physics3d exec vitest run \
    tests/bulk-spawn.test.ts \
    tests/composables/use-bulk-static-boxes.test.ts 2>&1 | tail -20
  ```

  Expected: all tests pass.

- [ ] **Step 6.7 — Full test suite passes**

  ```bash
  pnpm --filter @gwenjs/physics3d test 2>&1 | tail -10
  ```

  Expected: `Test Files N passed | N tests passed`

- [ ] **Step 6.8 — Typecheck**

  ```bash
  pnpm --filter @gwenjs/physics3d typecheck 2>&1 | tail -10
  ```

  Expected: no errors.

- [ ] **Step 6.9 — Commit**

  ```bash
  git add packages/physics3d/src/types.ts \
          packages/physics3d/src/index.ts \
          packages/physics3d/src/composables/use-bulk-static-boxes.ts \
          packages/physics3d/src/composables/index.ts \
          packages/physics3d/tests/bulk-spawn.test.ts \
          packages/physics3d/tests/composables/use-bulk-static-boxes.test.ts
  git commit -m "feat(physics3d): add bulkSpawnStaticBoxes API + useBulkStaticBoxes composable

  Adds Physics3DAPI.bulkSpawnStaticBoxes() that creates N static box bodies in
  one operation. In WASM mode this issues a single physics3d_bulk_spawn_static_boxes
  call; in local mode it loops createBodyLocal() N times.

  New types: BulkStaticBoxesOptions, BulkStaticBoxesResult (exported from index.ts).
  New composable: useBulkStaticBoxes for use inside actor/system setup().

  Entity IDs are allocated via engine.createEntity() and registered in bodyByEntity
  so hasBody() / removeBody() work correctly after bulk spawn.

  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
  ```

---

## Final verification

- [ ] **All Rust tests**

  ```bash
  cargo test -p gwen-core --features physics3d 2>&1 | tail -5
  ```

- [ ] **All TS tests**

  ```bash
  pnpm --filter @gwenjs/physics3d test 2>&1 | tail -10
  ```

- [ ] **Lint**

  ```bash
  pnpm lint 2>&1 | tail -10
  ```

- [ ] **Typecheck**

  ```bash
  pnpm typecheck 2>&1 | tail -10
  ```
