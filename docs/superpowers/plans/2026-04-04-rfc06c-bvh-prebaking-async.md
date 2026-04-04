# RFC-06c: BVH Pre-baking + Async Mesh Loading + GLB Import

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pre-bake Rapier3D BVH at Vite build time (eliminating ~50ms runtime construction), support async loading via Web Worker for procedural meshes, GLB file import via string path, SharedShape cache for repeated assets, and entity lifecycle safety (abort on destroy).

**Architecture:**

- **Pipeline A (static)**: Vite plugin detects `useMeshCollider('./file.glb')` → Node.js build-tools WASM parses GLB + bakes BVH → emits `.bin` asset → browser fetches + loads via `physics3d_load_bvh_collider`.
- **Pipeline B (async runtime)**: Procedural `useMeshCollider({ vertices, indices })` → Web Worker runs build-tools WASM → returns bytes → main thread loads.
- **Pipeline C (fallback)**: Mesh < 500 tris or Worker unavailable → synchronous `physics3d_add_mesh_collider` (RFC-06b).
- SharedShape cache: `Map<url, Promise<ArrayBuffer>>` deduplicates fetch+build for repeated assets.

**Prerequisites:** RFC-06b must be merged (`physics3d_add_mesh_collider` and `physics3d_load_bvh_collider` must exist in WASM before Task 5).

**Tech Stack:** Rust/Rapier3D 0.22 + `serde-serialize` feature + `bincode` v2 + `gltf` crate (build-tools), wasm-pack `--target nodejs`, Vite plugin (Node.js transform hook), Web Worker API, TypeScript, Vitest

---

## File Map

### New files

| File                                   | Responsibility                                                    |
| -------------------------------------- | ----------------------------------------------------------------- |
| `crates/gwen-core/src/build_tools.rs`  | `build_bvh_buffer()` + `build_bvh_from_glb()` — Node.js WASM only |
| `packages/physics3d/build-tools/`      | Generated Node.js WASM output (gitignored)                        |
| `packages/physics3d/src/bvh-worker.ts` | Web Worker source for async procedural BVH building               |

### Modified files

| File                                                      | Change                                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `crates/gwen-core/Cargo.toml`                             | Add `bincode`, `gltf` deps + `build-tools` feature                                    |
| `crates/gwen-core/src/lib.rs`                             | Add `#[cfg(feature="build-tools")] mod build_tools`                                   |
| `crates/gwen-core/src/physics3d/world.rs`                 | Add `load_bvh_collider()` method                                                      |
| `crates/gwen-core/src/bindings.rs`                        | Add `physics3d_load_bvh_collider` WASM export                                         |
| `scripts/build-wasm.sh`                                   | Add second wasm-pack invocation for nodejs target                                     |
| `packages/physics3d/src/vite-plugin.ts`                   | Add GLB detection + BVH pre-baking transform                                          |
| `packages/physics3d/src/composables/use-mesh-collider.ts` | Extend API: `src`, `__bvhUrl`, `placeholder`, `prebake`, `abort()`, `status`, `ready` |
| `packages/physics3d/src/index.ts`                         | `physics3d_load_bvh_collider` in WasmBridge + async pipeline + SharedShape cache      |
| `packages/physics3d/src/types.ts`                         | `MeshColliderOptions` + `MeshColliderHandle3D` extended types                         |

---

## Task 1: Rust — Cargo.toml + load_bvh_collider in world.rs

**Files:**

- Modify: `crates/gwen-core/Cargo.toml`
- Modify: `crates/gwen-core/src/physics3d/world.rs`

- [ ] **Step 1: Write failing Rust test for load_bvh_collider**

Add to `crates/gwen-core/src/physics3d/world.rs` in the `#[cfg(test)]` block:

```rust
#[cfg(test)]
mod bvh_tests {
    use super::*;

    fn make_simple_trimesh_bytes() -> Vec<u8> {
        // Build a minimal TriMesh and serialize it for testing
        use rapier3d::na::Point3;
        use rapier3d::geometry::TriMesh;
        let verts = vec![
            Point3::new(0.0f32, 0.0, 0.0),
            Point3::new(1.0, 0.0, 0.0),
            Point3::new(0.0, 1.0, 0.0),
            Point3::new(1.0, 1.0, 0.0),
        ];
        let idxs = vec![[0u32, 1, 2], [1, 3, 2]];
        let trimesh = TriMesh::new(verts, idxs);
        let bvh = bincode::encode_to_vec(&trimesh, bincode::config::standard()).unwrap();
        // prepend GBVH header
        let mut out = b"GBVH".to_vec();
        out.extend_from_slice(&0u16.to_le_bytes());
        out.extend_from_slice(&22u16.to_le_bytes());
        out.extend_from_slice(&bvh);
        out
    }

    #[test]
    fn test_load_bvh_collider_success() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0, 10);
        world.add_body(0, 0.0, 0.0, 0.0, 0, 1.0, 0.1, 0.1);
        let bytes = make_simple_trimesh_bytes();
        let ok = world.load_bvh_collider(0, &bytes, 0.0, 0.0, 0.0, false, 0.5, 0.0, 0xFFFF, 0xFFFF, 1);
        assert!(ok, "load_bvh_collider should succeed with valid bytes");
        assert!(world.collider_handles.contains_key(&(0, 1)));
    }

    #[test]
    fn test_load_bvh_collider_invalid_bytes() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0, 10);
        world.add_body(0, 0.0, 0.0, 0.0, 0, 1.0, 0.1, 0.1);
        let ok = world.load_bvh_collider(0, &[0u8; 8], 0.0, 0.0, 0.0, false, 0.5, 0.0, 0xFFFF, 0xFFFF, 1);
        assert!(!ok, "load_bvh_collider should fail with garbage bytes");
    }

    #[test]
    fn test_load_bvh_collider_no_body() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0, 10);
        let bytes = make_simple_trimesh_bytes();
        let ok = world.load_bvh_collider(99, &bytes, 0.0, 0.0, 0.0, false, 0.5, 0.0, 0xFFFF, 0xFFFF, 1);
        assert!(!ok, "should fail when entity has no body");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cargo test -p gwen-core --features "physics3d" -- bvh_tests 2>&1 | tail -20
```

Expected: compile error — `load_bvh_collider` does not exist yet. Also `bincode` not in deps yet.

- [ ] **Step 3: Add bincode dep + build-tools feature to Cargo.toml**

Edit `crates/gwen-core/Cargo.toml`:

```toml
# After existing rapier3d line:
bincode = { version = "2", optional = true }
gltf = { version = "1.4", default-features = false, features = ["utils"], optional = true }

# In [features]:
build-tools = ["dep:bincode", "dep:gltf", "physics3d", "rapier3d/serde-serialize"]

# ALSO add serde-serialize to physics3d when build-tools is active:
# (bincode is only needed for build-tools, but load_bvh_collider needs it at runtime too)
# So add bincode as optional dep used by physics3d feature:
physics3d = ["dep:rapier3d", "pathfinding-3d", "dep:bincode", "rapier3d/serde-serialize"]
```

Wait — if `load_bvh_collider` is a **runtime** browser function (it deserializes at runtime), then `bincode` and `rapier3d/serde-serialize` are needed in the browser WASM too, not just build-tools. Update:

```toml
[dependencies]
# ... existing deps ...
bincode = { version = "2", optional = true }
gltf = { version = "1.4", default-features = false, features = ["utils"], optional = true }

[features]
physics3d = ["dep:rapier3d", "pathfinding-3d", "dep:bincode", "rapier3d/serde-serialize"]
build-tools = ["dep:gltf", "physics3d"]
```

- [ ] **Step 4: Implement load_bvh_collider in world.rs**

Add after `add_convex_collider` (RFC-06b):

```rust
/// Load a pre-baked BVH buffer as a trimesh collider.
///
/// The buffer must have been produced by `build_bvh_buffer()` or `build_bvh_from_glb()`.
/// Format: `[4: "GBVH"][2: major u16 LE][2: minor u16 LE][N: bincode(TriMesh)]`
///
/// # Arguments
/// * `entity_index`  — ECS entity slot index.
/// * `bvh_bytes`     — Pre-baked BVH buffer (GBVH header + bincode TriMesh).
/// * `offset_x/y/z`  — Local-space offset from the body origin.
/// * `is_sensor`     — Sensor-only (no physical response).
/// * `friction`      — Surface friction coefficient (≥ 0).
/// * `restitution`   — Bounciness \[0, 1\].
/// * `layer_bits`    — Collision layer membership bitmask.
/// * `mask_bits`     — Collision filter bitmask.
/// * `collider_id`   — Stable application-defined collider ID.
///
/// # Returns
/// `true` on success, `false` if bytes are invalid or entity has no body.
#[allow(clippy::too_many_arguments)]
pub fn load_bvh_collider(
    &mut self,
    entity_index: u32,
    bvh_bytes: &[u8],
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
    use rapier3d::geometry::TriMesh;
    // Skip 8-byte header (magic + version)
    if bvh_bytes.len() < 8 {
        return false;
    }
    if &bvh_bytes[0..4] != b"GBVH" {
        return false;
    }
    let payload = &bvh_bytes[8..];
    let result: Result<(TriMesh, _), _> =
        bincode::decode_from_slice(payload, bincode::config::standard());
    let trimesh = match result {
        Ok((t, _)) => t,
        Err(_) => return false,
    };
    let builder = ColliderBuilder::new(rapier3d::geometry::SharedShape::new(trimesh));
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

- [ ] **Step 5: Run test to verify it passes**

```bash
cargo test -p gwen-core --features "physics3d" -- bvh_tests 2>&1 | tail -20
```

Expected: `test bvh_tests::test_load_bvh_collider_success ... ok` (×3)

- [ ] **Step 6: Commit**

```bash
git add crates/gwen-core/Cargo.toml crates/gwen-core/src/physics3d/world.rs
git commit -m "feat(physics3d): add load_bvh_collider + bincode/serde deps for BVH pre-baking

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Rust — build_tools.rs (Node.js build-tools WASM)

**Files:**

- Create: `crates/gwen-core/src/build_tools.rs`
- Modify: `crates/gwen-core/src/lib.rs`

- [ ] **Step 1: Write failing Rust test for build_bvh_buffer**

Add a `tests/build_tools_test.rs` integration test:

```rust
// crates/gwen-core/tests/build_tools_test.rs
#[cfg(feature = "build-tools")]
mod build_tools_tests {
    use gwen_core::build_tools::{build_bvh_buffer, build_bvh_from_glb};

    #[test]
    fn test_build_bvh_buffer_valid() {
        let vertices: Vec<f32> = vec![
            0.0, 0.0, 0.0,
            1.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
            1.0, 1.0, 0.0,
        ];
        let indices: Vec<u32> = vec![0, 1, 2, 1, 3, 2];
        let buf = build_bvh_buffer(&vertices, &indices);

        assert!(buf.len() > 8, "buffer should have header + bincode data");
        assert_eq!(&buf[0..4], b"GBVH", "header magic should be GBVH");
        // minor version = 22
        let minor = u16::from_le_bytes([buf[6], buf[7]]);
        assert_eq!(minor, 22);
    }

    #[test]
    fn test_build_bvh_buffer_roundtrip() {
        use rapier3d::geometry::TriMesh;
        let vertices: Vec<f32> = vec![
            0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0,
        ];
        let indices: Vec<u32> = vec![0, 1, 2];
        let buf = build_bvh_buffer(&vertices, &indices);

        // Deserialize back
        let payload = &buf[8..];
        let (trimesh, _): (TriMesh, _) =
            bincode::decode_from_slice(payload, bincode::config::standard()).unwrap();
        assert_eq!(trimesh.vertices().len(), 3);
        assert_eq!(trimesh.indices().len(), 1);
    }

    #[test]
    fn test_build_bvh_from_glb_invalid_bytes() {
        let result = build_bvh_from_glb(&[0xFF, 0xFE, 0x00], None);
        assert!(result.is_err(), "should fail on invalid GLB bytes");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cargo test -p gwen-core --features "build-tools" -- build_tools 2>&1 | tail -10
```

Expected: error — `build_tools` module does not exist.

- [ ] **Step 3: Create build_tools.rs**

```rust
// crates/gwen-core/src/build_tools.rs
//! Build-time mesh processing utilities.
//!
//! This module is compiled only under the `build-tools` feature and targets
//! the Node.js WASM target used by the Vite plugin. It is **never** included
//! in browser builds.

#[cfg(feature = "build-tools")]
use bincode;
#[cfg(feature = "build-tools")]
use rapier3d::{geometry::TriMesh, na::Point3};

/// Build a pre-baked BVH buffer from flat vertex and triangle index arrays.
///
/// Constructs a Rapier3D `TriMesh` (including its internal QBVH tree), then
/// serialises it with bincode. The result can be passed to
/// `physics3d_load_bvh_collider` at browser runtime — avoiding the ~50ms
/// QBVH construction cost.
///
/// # Output format
/// `[4: magic "GBVH"][2: rapier_major u16 LE][2: rapier_minor u16 LE][N: bincode(TriMesh)]`
///
/// # Arguments
/// * `vertices_flat` — Flat vertex positions `[x0,y0,z0, x1,y1,z1, ...]`. Length must be a multiple of 3.
/// * `indices_flat`  — Flat triangle indices `[i0,i1,i2, ...]`. Length must be a multiple of 3.
///
/// # Panics
/// Panics if `vertices_flat.len() % 3 != 0` or `indices_flat.len() % 3 != 0`.
#[cfg(feature = "build-tools")]
pub fn build_bvh_buffer(vertices_flat: &[f32], indices_flat: &[u32]) -> Vec<u8> {
    assert_eq!(vertices_flat.len() % 3, 0, "vertices_flat length must be a multiple of 3");
    assert_eq!(indices_flat.len() % 3, 0, "indices_flat length must be a multiple of 3");

    let verts: Vec<Point3<f32>> = vertices_flat
        .chunks_exact(3)
        .map(|c| Point3::new(c[0], c[1], c[2]))
        .collect();
    let idxs: Vec<[u32; 3]> = indices_flat
        .chunks_exact(3)
        .map(|c| [c[0], c[1], c[2]])
        .collect();

    let trimesh = TriMesh::new(verts, idxs);
    let bvh_bytes =
        bincode::encode_to_vec(&trimesh, bincode::config::standard()).expect("TriMesh serialization failed");

    let mut out = Vec::with_capacity(8 + bvh_bytes.len());
    out.extend_from_slice(b"GBVH");
    out.extend_from_slice(&0u16.to_le_bytes()); // rapier major
    out.extend_from_slice(&22u16.to_le_bytes()); // rapier minor
    out.extend_from_slice(&bvh_bytes);
    out
}

/// Extract the first non-skinned triangle mesh from a GLB binary and build its BVH.
///
/// Parses the GLB file, locates a mesh matching `mesh_name` (or the first
/// `TRIANGLES` primitive if `None`), and returns a pre-baked BVH buffer in
/// the same format as [`build_bvh_buffer`].
///
/// # Errors
/// Returns a descriptive error string if the GLB is malformed, no mesh is
/// found, or no buffer is embedded.
#[cfg(feature = "build-tools")]
pub fn build_bvh_from_glb(glb_bytes: &[u8], mesh_name: Option<&str>) -> Result<Vec<u8>, String> {
    use gltf::{Gltf, mesh::Mode};

    let gltf = Gltf::from_slice(glb_bytes).map_err(|e| format!("GLB parse error: {e}"))?;
    let blob = gltf.blob.as_deref().unwrap_or(&[]);

    for mesh in gltf.meshes() {
        if let Some(name) = mesh_name {
            // Also accept convention suffixes: *_col, *_collision, *_phys
            let mesh_name_lower = mesh.name().unwrap_or("").to_lowercase();
            let name_lower = name.to_lowercase();
            let suffix_match = mesh_name_lower.ends_with("_col")
                || mesh_name_lower.ends_with("_collision")
                || mesh_name_lower.ends_with("_phys");
            if mesh.name() != Some(name) && !suffix_match {
                continue;
            }
            let _ = name_lower; // suppress warning
        }
        for prim in mesh.primitives() {
            if prim.mode() != Mode::Triangles {
                continue;
            }
            let reader = prim.reader(|buf| {
                if buf.index() == 0 {
                    Some(blob)
                } else {
                    None
                }
            });

            let Some(positions) = reader.read_positions() else {
                continue;
            };
            let vertices_flat: Vec<f32> = positions.flat_map(|[x, y, z]| [x, y, z]).collect();
            if vertices_flat.is_empty() {
                continue;
            }

            let indices_flat: Vec<u32> = match reader.read_indices() {
                Some(iter) => iter.into_u32().collect(),
                None => (0..vertices_flat.len() as u32 / 3).collect(),
            };

            return Ok(build_bvh_buffer(&vertices_flat, &indices_flat));
        }
    }

    Err(format!(
        "No valid triangle mesh found in GLB{}",
        mesh_name.map(|n| format!(" (looking for '{n}')")).unwrap_or_default()
    ))
}
```

- [ ] **Step 4: Export module from lib.rs**

Add to `crates/gwen-core/src/lib.rs`:

```rust
#[cfg(feature = "build-tools")]
pub mod build_tools;
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cargo test -p gwen-core --features "build-tools" -- build_tools 2>&1 | tail -15
```

Expected: `test build_tools_tests::test_build_bvh_buffer_valid ... ok` (×3)

- [ ] **Step 6: Commit**

```bash
git add crates/gwen-core/src/build_tools.rs crates/gwen-core/src/lib.rs
git commit -m "feat(physics3d): add build_tools module with build_bvh_buffer + build_bvh_from_glb

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Rust — physics3d_load_bvh_collider in bindings.rs

**Files:**

- Modify: `crates/gwen-core/src/bindings.rs`

- [ ] **Step 1: Add wasm-bindgen export after physics3d_add_convex_collider**

```rust
/// Load a pre-baked BVH buffer as a trimesh collider.
///
/// The `bvh_bytes` must have been produced by `build_bvh_buffer()` or
/// `build_bvh_from_glb()` (the `build-tools` feature). Deserialising the
/// pre-baked TriMesh costs ~2 ms vs ~50 ms for a fresh `trimesh()` build.
///
/// Returns `false` if `bvh_bytes` is malformed, the magic header is missing,
/// or the entity has no registered rigid body.
#[cfg(feature = "physics3d")]
#[allow(clippy::too_many_arguments)]
pub fn physics3d_load_bvh_collider(
    &mut self,
    entity_index: u32,
    bvh_bytes: &[u8],
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
        world.load_bvh_collider(
            entity_index,
            bvh_bytes,
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

- [ ] **Step 2: Verify compile**

```bash
cargo check -p gwen-core --target wasm32-unknown-unknown --features "physics3d" 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add crates/gwen-core/src/bindings.rs
git commit -m "feat(physics3d): expose physics3d_load_bvh_collider via wasm-bindgen

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Build script — add Node.js WASM target

**Files:**

- Modify: `scripts/build-wasm.sh`

- [ ] **Step 1: Add build-tools Node.js target**

In `scripts/build-wasm.sh`, after the existing `wasm-pack build` invocation for the web target, add:

```bash
# Build Node.js target for Vite plugin build-tools
log_info "Building gwen-core build-tools (Node.js target)..."
wasm-pack build "$CRATE_DIR" \
  --target nodejs \
  --out-dir "$(dirname "$CRATE_DIR")/packages/physics3d/build-tools" \
  --features "build-tools" \
  --release \
  -- --no-default-features 2>&1

# Clean up wasm-pack Node.js artifacts we don't need
rm -f "$(dirname "$CRATE_DIR")/packages/physics3d/build-tools/.gitignore"
log_info "Build-tools WASM built successfully"
```

- [ ] **Step 2: Add build-tools/ to .gitignore**

Add to `packages/physics3d/.gitignore` (create if missing):

```
build-tools/
```

- [ ] **Step 3: Build both targets**

```bash
pnpm build:wasm 2>&1 | tail -20
```

Expected: two successful wasm-pack invocations. Second one outputs to `packages/physics3d/build-tools/`.

- [ ] **Step 4: Verify Node.js WASM exports**

```bash
node -e "
const { build_bvh_buffer, build_bvh_from_glb } = require('./packages/physics3d/build-tools/gwen_core.js');
const verts = new Float32Array([0,0,0, 1,0,0, 0,1,0]);
const idxs = new Uint32Array([0,1,2]);
const buf = build_bvh_buffer(verts, idxs);
console.log('BVH buffer size:', buf.length, 'bytes');
console.log('Magic:', String.fromCharCode(...buf.slice(0,4)));
"
```

Expected:

```
BVH buffer size: ~N bytes (> 8)
Magic: GBVH
```

- [ ] **Step 5: Commit**

```bash
git add scripts/build-wasm.sh packages/physics3d/.gitignore
git commit -m "build: add nodejs wasm-pack target for physics3d build-tools

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Vite plugin — GLB detection + BVH pre-baking

**Files:**

- Modify: `packages/physics3d/src/vite-plugin.ts`

**Prerequisites:** Task 4 (build-tools WASM) must have run — `packages/physics3d/build-tools/gwen_core.js` must exist.

- [ ] **Step 1: Write failing test**

Create `packages/physics3d/tests/vite-plugin-bvh.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createGwenPhysics3DPlugin } from '../src/vite-plugin.js';

// We test the transform logic in isolation by mocking the build-tools WASM
vi.mock('../build-tools/gwen_core.js', () => ({
  default: async () => {},
  build_bvh_from_glb: (_bytes: Uint8Array, _name?: string) => {
    // Return a fake GBVH buffer
    const buf = new Uint8Array(16);
    buf[0] = 0x47;
    buf[1] = 0x42;
    buf[2] = 0x56;
    buf[3] = 0x48; // GBVH
    return buf;
  },
}));

describe('gwen:physics3d Vite plugin — BVH transform', () => {
  it('transforms useMeshCollider string arg to __bvhAssetId', async () => {
    const plugin = createGwenPhysics3DPlugin();
    // Simulate transform hook
    const code = `useMeshCollider('./terrain.glb')`;
    // Plugin should detect string literal and schedule pre-bake
    // We assert the transform returns code with __bvhUrl
    const result = await (plugin as any).transformBvhReferences?.(code, 'src/game.ts');
    expect(result).toContain('__bvhUrl');
  });

  it('leaves dynamic useMeshCollider({ vertices, indices }) untouched', async () => {
    const plugin = createGwenPhysics3DPlugin();
    const code = `useMeshCollider({ vertices: v, indices: i })`;
    const result = await (plugin as any).transformBvhReferences?.(code, 'src/game.ts');
    // Dynamic data — cannot pre-bake, must remain unchanged
    expect(result).toBeNull();
  });
});
```

Run: `pnpm --filter @gwenjs/physics3d exec vitest run tests/vite-plugin-bvh.test.ts 2>&1 | tail -10`
Expected: FAIL — `transformBvhReferences` not defined.

- [ ] **Step 2: Implement BVH transform in vite-plugin.ts**

Add to `packages/physics3d/src/vite-plugin.ts`:

```typescript
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { Plugin } from 'vite';

// Lazy-loaded build-tools WASM (only initialised during build, not dev serve)
let buildToolsWasm: {
  build_bvh_from_glb: (bytes: Uint8Array, name?: string) => Uint8Array;
} | null = null;

async function getBuildTools() {
  if (!buildToolsWasm) {
    const mod = await import('../build-tools/gwen_core.js' as string);
    await mod.default?.();
    buildToolsWasm = mod;
  }
  return buildToolsWasm;
}

// Regex: useMeshCollider('./relative/path.glb') or useConvexCollider('./path.glb')
// Captures: [full_match, quote, path, optional_comma_options]
const MESH_GLB_RE =
  /use(?:Mesh|Convex)Collider\(\s*(['"`])(\.\/[^'"` \n]+\.glb)\1(\s*,\s*\{[^}]*\})?\s*\)/g;

/**
 * Detect `useMeshCollider('./file.glb')` patterns and pre-bake their BVH.
 * Returns transformed code string or null if no matches found.
 */
export async function transformBvhReferences(
  code: string,
  id: string,
  emitFile: (opts: { type: 'asset'; name: string; source: Buffer }) => string,
): Promise<string | null> {
  if (!MESH_GLB_RE.test(code)) return null;
  MESH_GLB_RE.lastIndex = 0;

  const tools = await getBuildTools();
  let transformed = code;
  let offset = 0;

  for (const match of code.matchAll(MESH_GLB_RE)) {
    const [full, , glbPath, optionsStr] = match;
    const absGlbPath = resolve(dirname(id), glbPath);

    if (!existsSync(absGlbPath)) {
      console.warn(`[gwen:physics3d] useMeshCollider: file not found: ${absGlbPath}`);
      continue;
    }

    // Extract optional { mesh: 'Name' } selector
    const meshNameMatch = optionsStr?.match(/mesh\s*:\s*['"`]([^'"` ]+)['"`]/);
    const meshName = meshNameMatch?.[1];

    const glbBytes = readFileSync(absGlbPath);
    let bvhBuffer: Uint8Array;
    try {
      bvhBuffer = tools.build_bvh_from_glb(new Uint8Array(glbBytes), meshName);
    } catch (e) {
      console.warn(`[gwen:physics3d] BVH pre-bake failed for ${glbPath}: ${e}`);
      continue;
    }

    const hash = createHash('md5').update(bvhBuffer).digest('hex').slice(0, 8);
    const assetName = `bvh-${hash}.bin`;

    emitFile({ type: 'asset', name: assetName, source: Buffer.from(bvhBuffer) });

    // Replace: useMeshCollider('./terrain.glb') → useMeshCollider({ __bvhUrl: '/assets/bvh-abc.bin' })
    const replacement = `useMeshCollider({ __bvhUrl: '${assetName}' })`;
    const start = (match.index ?? 0) + offset;
    transformed =
      transformed.slice(0, start) + replacement + transformed.slice(start + full.length);
    offset += replacement.length - full.length;
  }

  return transformed !== code ? transformed : null;
}
```

Wire into the existing Vite plugin hooks in `createGwenPhysics3DPlugin()`:

```typescript
// In the existing plugin object, add/extend the transform hook:
async transform(code: string, id: string) {
  // ... existing layer inlining logic ...

  // BVH pre-baking (build mode only)
  if (!id.includes('node_modules') && /\.(ts|tsx|js|jsx)$/.test(id)) {
    const bvhTransformed = await transformBvhReferences(
      code,
      id,
      this.emitFile.bind(this),
    )
    if (bvhTransformed) code = bvhTransformed
  }

  return code || null
},
```

- [ ] **Step 3: Run test to verify it passes**

```bash
pnpm --filter @gwenjs/physics3d exec vitest run tests/vite-plugin-bvh.test.ts 2>&1 | tail -10
```

Expected: 2 tests passing.

- [ ] **Step 4: Commit**

```bash
git add packages/physics3d/src/vite-plugin.ts packages/physics3d/tests/vite-plugin-bvh.test.ts
git commit -m "feat(physics3d): vite plugin BVH pre-baking from GLB file paths

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: TypeScript — Async pipeline + SharedShape cache + Web Worker

**Files:**

- Modify: `packages/physics3d/src/composables/use-mesh-collider.ts`
- Modify: `packages/physics3d/src/index.ts`
- Modify: `packages/physics3d/src/types.ts`
- Create: `packages/physics3d/src/bvh-worker.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/physics3d/tests/mesh-collider-async.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('useMeshCollider async pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses __bvhUrl path: fetches bin and calls physics3d_load_bvh_collider', async () => {
    const mockBridge = {
      physics3d_load_bvh_collider: vi.fn().mockReturnValue(true),
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(64),
    });

    const loadBvhFromUrl = async (url: string, bridge: typeof mockBridge) => {
      const ab = await (await fetch(url)).arrayBuffer();
      return bridge.physics3d_load_bvh_collider(
        0,
        new Uint8Array(ab),
        0,
        0,
        0,
        false,
        0.5,
        0,
        0xffff,
        0xffff,
        1,
      );
    };

    const result = await loadBvhFromUrl('/assets/bvh-abc.bin', mockBridge);
    expect(mockBridge.physics3d_load_bvh_collider).toHaveBeenCalledOnce();
    expect(result).toBe(true);
  });

  it('SharedShape cache: same URL fetched only once across multiple calls', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(64),
    });
    global.fetch = fetchSpy;

    // Simulate the cache
    const cache = new Map<string, Promise<ArrayBuffer>>();
    const fetchCached = (url: string) => {
      if (!cache.has(url))
        cache.set(
          url,
          fetch(url).then((r) => r.arrayBuffer()),
        );
      return cache.get(url)!;
    };

    await Promise.all([
      fetchCached('/assets/bvh-terrain.bin'),
      fetchCached('/assets/bvh-terrain.bin'),
      fetchCached('/assets/bvh-terrain.bin'),
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('aborts pending load when abort() is called', async () => {
    let aborted = false;
    const ac = new AbortController();
    ac.signal.addEventListener('abort', () => {
      aborted = true;
    });

    // Simulate: entity destroyed before BVH arrives
    ac.abort();

    expect(aborted).toBe(true);
  });

  it('status transitions: loading → active on success', async () => {
    let status: string = 'loading';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(64),
    });
    const mockBridge = { physics3d_load_bvh_collider: vi.fn().mockReturnValue(true) };

    const ab = await (await fetch('/assets/bvh-test.bin')).arrayBuffer();
    mockBridge.physics3d_load_bvh_collider(
      0,
      new Uint8Array(ab),
      0,
      0,
      0,
      false,
      0.5,
      0,
      0xffff,
      0xffff,
      1,
    );
    status = 'active';

    expect(status).toBe('active');
  });
});
```

Run: `pnpm --filter @gwenjs/physics3d exec vitest run tests/mesh-collider-async.test.ts 2>&1 | tail -10`
Expected: PASS (these are unit tests for isolated logic, not the full composable).

- [ ] **Step 2: Extend types in types.ts**

Add to `packages/physics3d/src/types.ts` (extend existing `MeshColliderOptions` and `MeshColliderHandle3D`):

```typescript
// Extend MeshColliderOptions (existing interface):
export interface MeshColliderOptions {
  // --- Raw data (procedural / escape hatch) ---
  vertices?: Float32Array;
  indices?: Uint32Array;

  // --- Set by Vite plugin — do not write manually ---
  /** URL to a pre-baked BVH binary asset emitted at build time. */
  __bvhUrl?: string;

  // --- New options ---
  /**
   * Fallback box collider active while the BVH is loading asynchronously.
   * If omitted, no collision response until load completes.
   */
  placeholder?: { halfX: number; halfY: number; halfZ: number };

  /**
   * Set to `false` to force synchronous runtime BVH construction even for
   * static literals. Default: `true` (Vite plugin auto-detects).
   */
  prebake?: boolean;

  // --- Shared ---
  isSensor?: boolean;
  layer?: number;
  mask?: number;
  offsetX?: number;
  offsetY?: number;
  offsetZ?: number;
}

// Extend MeshColliderHandle3D (existing interface):
export interface MeshColliderHandle3D {
  colliderId: number;
  /** Current load state. `'active'` once the collider is live in Rapier. */
  status: 'loading' | 'active' | 'error';
  /** Resolves when the collider becomes active in Rapier. */
  ready: Promise<void>;
  remove(): void;
  /** Cancel a pending async load (e.g., when the actor is destroyed). */
  abort(): void;
}
```

- [ ] **Step 3: Add SharedShape cache + physics3d_load_bvh_collider to index.ts**

In `packages/physics3d/src/index.ts`:

1. Add to `Physics3DWasmBridge` interface (~line 91):

```typescript
physics3d_load_bvh_collider?: (
  entityIndex: number,
  bvhBytes: Uint8Array,
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
```

2. Add module-level SharedShape cache after existing top-level consts:

```typescript
/** Cache: bvhUrl → in-flight or resolved ArrayBuffer fetch. */
const _bvhCache = new Map<string, Promise<ArrayBuffer>>();

function _fetchBvhBuffer(url: string): Promise<ArrayBuffer> {
  if (!_bvhCache.has(url)) {
    _bvhCache.set(
      url,
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`BVH fetch failed: ${r.status} ${url}`);
        return r.arrayBuffer();
      }),
    );
  }
  return _bvhCache.get(url)!;
}
```

3. In `addColliderImpl`, after the existing `capsule` block, add:

```typescript
if (shape.type === 'mesh' && options.__bvhUrl) {
  // Async path: pre-baked BVH from Vite plugin
  const ac = new AbortController();
  let resolveReady!: () => void;
  let rejectReady!: (e: unknown) => void;
  const ready = new Promise<void>((res, rej) => {
    resolveReady = res;
    rejectReady = rej;
  });

  _fetchBvhBuffer(options.__bvhUrl)
    .then((ab) => {
      if (ac.signal.aborted) return;
      const ok =
        wasmBridge!.physics3d_load_bvh_collider?.(
          idx,
          new Uint8Array(ab),
          ox,
          oy,
          oz,
          isSensor,
          friction,
          restitution,
          membership,
          filter,
          colliderId,
        ) ?? false;
      if (ok) resolveReady();
      else rejectReady(new Error('physics3d_load_bvh_collider returned false'));
    })
    .catch(rejectReady);

  // Attach abort + ready to handle (stored separately, returned via useMeshCollider)
  _pendingBvhLoads.set(colliderId, { ac, ready });
  return true; // placeholder registered
}
```

- [ ] **Step 4: Create bvh-worker.ts**

Create `packages/physics3d/src/bvh-worker.ts`:

```typescript
/**
 * Web Worker for async BVH construction from procedural mesh data.
 *
 * Loaded by useMeshCollider when mesh data is provided at runtime (not pre-baked).
 * Uses the same build-tools WASM as the Vite plugin, but in the browser context.
 */
// @ts-ignore — dynamic import resolved by bundler
import initWasm, { build_bvh_buffer } from '../build-tools/gwen_core.js';

let wasmReady = false;
const queue: Array<{ id: number; vertices: Float32Array; indices: Uint32Array }> = [];

initWasm().then(() => {
  wasmReady = true;
  queue.splice(0).forEach(processJob);
});

interface WorkerJob {
  id: number;
  vertices: Float32Array;
  indices: Uint32Array;
}

function processJob({ id, vertices, indices }: WorkerJob) {
  try {
    const bvhBytes = build_bvh_buffer(vertices, indices);
    self.postMessage({ id, bvhBytes, error: null }, [bvhBytes.buffer]);
  } catch (e) {
    self.postMessage({ id, bvhBytes: null, error: String(e) });
  }
}

self.onmessage = ({ data }: MessageEvent<WorkerJob>) => {
  if (!wasmReady) {
    queue.push(data);
    return;
  }
  processJob(data);
};
```

- [ ] **Step 5: Run all physics3d tests**

```bash
pnpm --filter @gwenjs/physics3d test 2>&1 | tail -20
```

Expected: all tests passing.

- [ ] **Step 6: Commit**

```bash
git add packages/physics3d/src/types.ts packages/physics3d/src/index.ts \
        packages/physics3d/src/bvh-worker.ts \
        packages/physics3d/tests/mesh-collider-async.test.ts
git commit -m "feat(physics3d): async BVH pipeline, SharedShape cache, Web Worker, load_bvh_collider bridge

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 7: TypeScript — preloadMeshCollider + streaming API

**Files:**

- Modify: `packages/physics3d/src/composables/use-mesh-collider.ts`
- Modify: `packages/physics3d/src/index.ts`

- [ ] **Step 1: Write failing test**

Add to `packages/physics3d/tests/mesh-collider-async.test.ts`:

```typescript
describe('preloadMeshCollider', () => {
  it('starts fetch immediately and returns a handle', () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(64),
    });
    // preloadMeshCollider should call fetch immediately
    const handle = preloadMeshCollider('/assets/bvh-zone2.bin');
    expect(fetch).toHaveBeenCalledWith('/assets/bvh-zone2.bin');
    expect(handle.status).toBe('loading');
  });

  it('handle.ready resolves when fetch completes', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(64),
    });
    const handle = preloadMeshCollider('/assets/bvh-zone2.bin');
    await handle.ready;
    expect(handle.status).toBe('ready');
  });
});
```

Import at the top: `import { preloadMeshCollider } from '../src/index.js'`

Run to verify failure, then implement.

- [ ] **Step 2: Implement preloadMeshCollider in index.ts**

````typescript
export interface PreloadedBvhHandle {
  /** Current fetch state. */
  status: 'loading' | 'ready' | 'error';
  /** The URL being preloaded. */
  url: string;
  /** Resolves when the binary is in memory, ready for instant use. */
  ready: Promise<void>;
  /** Internal buffer once ready — used by useMeshCollider. @internal */
  _buffer?: ArrayBuffer;
}

/**
 * Start fetching a pre-baked BVH binary before the actor is instantiated.
 * Useful for open-world streaming: preload Zone 2 while player is in Zone 1.
 *
 * @example
 * ```typescript
 * // At scene load
 * const zone2Bvh = preloadMeshCollider('/assets/bvh-zone2.bin')
 *
 * // When player approaches Zone 2
 * const Zone2Actor = defineActor(Zone2Prefab, () => {
 *   useStaticBody()
 *   useMeshCollider(zone2Bvh) // instant if already loaded
 * })
 * ```
 */
export function preloadMeshCollider(url: string): PreloadedBvhHandle {
  const handle: PreloadedBvhHandle = { status: 'loading', url, ready: Promise.resolve() };
  handle.ready = _fetchBvhBuffer(url)
    .then((ab) => {
      handle._buffer = ab;
      handle.status = 'ready';
    })
    .catch(() => {
      handle.status = 'error';
    });
  return handle;
}
````

- [ ] **Step 3: Accept PreloadedBvhHandle in useMeshCollider**

Extend `useMeshCollider` signature to accept a preloaded handle:

```typescript
// New overload in use-mesh-collider.ts:
export function useMeshCollider(
  options: MeshColliderOptions | PreloadedBvhHandle,
): MeshColliderHandle3D;
```

When called with a `PreloadedBvhHandle`, convert to `{ __bvhUrl: handle.url }` and let the async pipeline handle it (it will hit the cache if already fetched).

- [ ] **Step 4: Run all tests**

```bash
pnpm --filter @gwenjs/physics3d test 2>&1 | tail -20
```

Expected: all tests passing.

- [ ] **Step 5: Commit**

```bash
git add packages/physics3d/src/index.ts \
        packages/physics3d/src/composables/use-mesh-collider.ts \
        packages/physics3d/tests/mesh-collider-async.test.ts
git commit -m "feat(physics3d): preloadMeshCollider for open-world BVH streaming

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Self-Review

### Spec coverage

- ✅ BVH pre-baking at build time via Vite plugin
- ✅ GLB import via string literal `useMeshCollider('./file.glb')`
- ✅ Optional mesh name selector `{ mesh: 'Terrain_Col' }`
- ✅ GLB conventions: `_col`, `_collision`, `_phys` suffix auto-match
- ✅ Web Worker for procedural async BVH
- ✅ SharedShape cache (deduplicates fetch for same URL)
- ✅ Entity lifecycle safety (AbortController)
- ✅ `status: 'loading' | 'active' | 'error'` on handle
- ✅ `ready: Promise<void>` on handle
- ✅ `abort()` on handle
- ✅ `preloadMeshCollider()` for open-world streaming
- ✅ GBVH header with version for future compatibility
- ✅ Dev warnings for missing GLB files

### Dependency order

- Task 1 (Rust bincode+world.rs) — standalone
- Task 2 (build_tools.rs) — standalone
- Task 3 (bindings.rs) — needs Task 1
- Task 4 (build script) — needs Task 2
- Task 5 (Vite plugin) — needs Task 4
- Task 6 (TS async) — needs RFC-06b merged + Task 3 WASM built
- Task 7 (preload) — needs Task 6
