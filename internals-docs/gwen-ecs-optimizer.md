# GWEN Compile-Time ECS Optimizer

**Status:** Draft — pending RFC  
**Audience:** GWEN core contributors  
**Location:** This document lives in `internals-docs/` and is NOT published to VitePress.

---

## 1. Problem Statement

### The WASM Boundary Tax

The current ECS API requires one WASM boundary crossing per component read and per component write:

```ts
// defineSystem — current runtime pattern
const entities = useQuery([Position, Velocity])

onUpdate((dt) => {
  for (const e of entities) {
    const pos = e.get(Position)    // → get_component_raw()   ← 1 WASM call
    const vel = e.get(Velocity)    // → get_component_raw()   ← 1 WASM call
    e.set(Position, {              // → add_component()        ← 1 WASM call
      x: pos.x + vel.x * dt,
      y: pos.y + vel.y * dt,
    })
  }
})
```

For **1 000 entities**: `3 000 WASM calls/frame × 60 fps = 180 000 WASM calls/second`.

Each call pays:
- Argument serialization / deserialization (bigint pack/unpack, Uint8Array copy)
- JS → WASM memory boundary crossing
- GC pressure from intermediate `Uint8Array` and object allocations

**Measured impact** (from `specs/TODO.md` benchmark notes):
```
WASM query alone:    351× faster than pure TS  
Full frame (naive):  2.15× SLOWER than pure TS  ← boundary crossing overhead
```

The WASM core is fast. The crossing between JS and WASM is the bottleneck.

---

## 2. Solution Overview

### Two-Level Compile-Time Optimization

The `gwen:optimizer` Vite plugin analyzes the AST at **build time** and rewrites patterns known to be inefficient into equivalent code that minimizes WASM boundary crossings.

```
Developer writes (ergonomic)         Vite builds (optimal)
────────────────────────────         ──────────────────────
for (const e of entities) {    →     // 2 WASM calls total
  const pos = e.get(Position)         const _pos = bridge.readComponentsBulk(...)
  const vel = e.get(Velocity)         const _vel = bridge.readComponentsBulk(...)
  e.set(Position, {...})              for (let i = 0; i < n; i++) { ... }
}                                     bridge.writeComponentsBulk(...)
```

**N entities = N WASM calls → N entities = 2–3 WASM calls (constant).**

### Level 1 — `useComponent` Proxy → Direct TypedArray Access

Replaces the reactive Proxy created by `useComponent()` with direct SoA typed array access. Zero allocations per frame.

### Level 2 — Query Loop → Bulk Read/Compute/Write

Rewrites `for (e of entities)` loops with component access into:
1. `readComponentsBulk()` — fetch all component data in one call
2. Plain JS loop over TypedArray (no WASM crossings)
3. `writeComponentsBulk()` — flush writes in one call

---

## 3. Architecture

### Components of the System

```
packages/vite/src/plugins/optimizer.ts   ← Vite plugin (AST transform)
packages/vite/src/optimizer/
  ├── ast-walker.ts                       ← Walk TypeScript AST (using oxc-parser or acorn)
  ├── component-manifest.ts              ← Resolve defineComponent() schemas at build time
  ├── pattern-detector.ts                ← Detect transformable patterns
  ├── code-generator.ts                  ← Emit optimized JS
  └── types.ts                           ← Internal optimizer types

crates/gwen-core/src/
  ├── bulk_ops.rs                        ← New: pure ECS bulk ops — no physics dep (see §5)
  ├── bulk_ops_physics2d.rs              ← New: physics2d bulk ops (feature = "physics2d")
  ├── bulk_ops_physics3d.rs              ← New: physics3d bulk ops (feature = "physics3d")
  ├── query_buffer.rs                    ← Existing: static query buffer
  └── bindings.rs                        ← Existing: wasm_bindgen exports
```

### Data Flow

```
1. Vite processes a .ts file
2. gwen:optimizer plugin intercepts transform(code, id)
3. ast-walker.ts parses the file into an AST
4. component-manifest.ts resolves all imports to find defineComponent() schemas
5. pattern-detector.ts walks the AST:
   a. Finds defineSystem() / defineActor() boundaries (scope root)
   b. Finds useQuery([...]) calls → extracts component list
   c. Finds useComponent(X) calls → captures binding
   d. Finds for...of loops over query results
   e. Classifies component access (read / write / read-write)
6. code-generator.ts rewrites matched patterns
7. Returns transformed code to Vite pipeline
```

---

## 4. Level 1 — `useComponent` Proxy Elimination

### The Pattern

```ts
// Input — actor factory
const pos = useComponent(Position)   // creates a Proxy at spawn
const vel = useComponent(Velocity)   // creates a Proxy at spawn

onUpdate((dt) => {
  pos.x += vel.x * dt               // Proxy getter (2) + setter (1) per frame
  pos.y += vel.y * dt
})
```

### The Transform

The optimizer knows at build time:
- `pos` is bound to `Position`
- `vel` is bound to `Velocity`
- The actor's entity ID is available as `entityId` (captured at spawn via `_getActorEntityId()`)
- `Position` schema: `{ x: Types.f32, y: Types.f32 }` → stride = 2 floats

```ts
// Output — generated code
// useComponent() calls are removed
// No Proxy created

onUpdate((dt) => {
  // Direct SoA typed array access — 0 allocations
  const _posSlot = _unpackEntityIndex(entityId)
  Position._data[_posSlot * 2 + 0] += Velocity._data[_posSlot * 2 + 0] * dt
  Position._data[_posSlot * 2 + 1] += Velocity._data[_posSlot * 2 + 1] * dt
})
```

### Requirements

1. `defineComponent()` must expose a static `_data: Float32Array` view into the component store
2. Field offsets must be computable at build time from the schema (no dynamic schemas)
3. Entity slot index must be available in the same scope (it is: `_getActorEntityId()` → unpack)

### Component Manifest Format

Built by `component-manifest.ts` at transform time:

```ts
interface ComponentManifest {
  /** Import path to the component definition */
  importPath: string
  /** Variable name in the source file */
  varName: string
  /** ECS component type ID (assigned at runtime, resolved at build time via static analysis) */
  fields: ComponentField[]
  /** Total byte size per entity */
  byteSize: number
  /** Float32Array stride (byteSize / 4) */
  f32Stride: number
}

interface ComponentField {
  name: string
  type: 'f32' | 'i32' | 'u32' | 'bool' | 'vec2' | 'vec3'
  byteOffset: number
  f32Offset: number   // byteOffset / 4 (for Float32Array indexing)
  elementCount: number // 1 for scalar, 2 for vec2, 3 for vec3
}

// Example — Position { x: Types.f32, y: Types.f32 }
const positionManifest: ComponentManifest = {
  varName: 'Position',
  fields: [
    { name: 'x', type: 'f32', byteOffset: 0, f32Offset: 0, elementCount: 1 },
    { name: 'y', type: 'f32', byteOffset: 4, f32Offset: 1, elementCount: 1 },
  ],
  byteSize: 8,
  f32Stride: 2,
}
```

---

## 5. Level 2 — Query Loop Bulk Transformation

### The Pattern

The detector looks for the combination of:
1. A `useQuery([...])` call assigning to a variable
2. An `onUpdate` / `onBeforeUpdate` / `onAfterUpdate` / `onRender` callback containing
3. A `for...of` loop over that query variable
4. Component accesses (`e.get(X)` / `e.set(X, ...)`) inside the loop

```ts
// Input — triggers Level 2 transform
const entities = useQuery([Position, Velocity])

onUpdate((dt) => {
  for (const e of entities) {
    const pos = e.get(Position)           // read
    const vel = e.get(Velocity)           // read
    e.set(Position, {                     // write
      x: pos.x + vel.x * dt,
      y: pos.y + vel.y * dt,
    })
  }
})
```

**Cost today:** `3N` WASM calls per frame (N reads Pos + N reads Vel + N writes Pos).

### The Transform

```ts
// Output — generated code (Vite build only, not what the developer sees)
const _queryTypeIds = [Position._typeId, Velocity._typeId]

onUpdate((dt) => {
  // 1. Bulk query — 1 WASM call, result in static buffer
  const _entitySlots = _bridge.queryEntitiesRaw(_queryTypeIds)
  const _n = _entitySlots.length
  if (_n === 0) return

  // 2. Bulk reads — 2 WASM calls (one per component)
  const _posData = _bridge.readComponentsBulk(_entitySlots, Position._typeId, Position._byteSize)
  const _velData = _bridge.readComponentsBulk(_entitySlots, Velocity._typeId, Velocity._byteSize)

  // 3. Compute — pure JS over TypedArrays, 0 WASM calls
  for (let _i = 0; _i < _n; _i++) {
    const _pi = _i * 2   // Position f32Stride = 2
    const _vi = _i * 2   // Velocity f32Stride = 2
    _posData[_pi + 0] += _velData[_vi + 0] * dt   // pos.x += vel.x * dt
    _posData[_pi + 1] += _velData[_vi + 1] * dt   // pos.y += vel.y * dt
  }

  // 4. Bulk write — 1 WASM call (only Position was written)
  _bridge.writeComponentsBulk(_entitySlots, Position._typeId, _posData)
})
```

**Cost after:** `3 WASM calls/frame` regardless of entity count.

### Reduction Table

| Entities | Before (3N calls) | After (3 calls) | Speedup |
|---|---|---|---|
| 100 | 300 | 3 | 100× |
| 1 000 | 3 000 | 3 | 1 000× |
| 10 000 | 30 000 | 3 | 10 000× |

---

## 6. New Rust Bulk APIs Required

The existing `get_components_bulk` / `set_components_bulk` cover most cases. The following additional APIs need to be implemented, **split across three modules** matching the three engine tiers.

### Engine Tiers

```
Tier 1 — Core only       crates/gwen-core/src/bulk_ops.rs
                          Feature flags: none (always compiled)
                          Bundle: ~30KB WASM gzip
                          Depends on: ECS archetype store only

Tier 2 — Core + Physics2D crates/gwen-core/src/bulk_ops_physics2d.rs
                          Feature flags: #[cfg(feature = "physics2d")]
                          Bundle: ~120KB WASM gzip (adds Rapier2D)
                          Depends on: bulk_ops.rs + Rapier2D

Tier 3 — Core + Physics3D crates/gwen-core/src/bulk_ops_physics3d.rs
                          Feature flags: #[cfg(feature = "physics3d")]
                          Bundle: ~280KB WASM gzip (adds Rapier3D)
                          Depends on: bulk_ops.rs + Rapier3D
```

The Vite plugin reads which tier is active from `gwen.config.ts` and emits code accordingly — it never emits `bulk_physics2d_*` calls for a core-only project.

---

### Design Principles for all Rust Bulk APIs

- **No allocations in hot paths** — all output goes into caller-provided buffers
- **Single WASM export per operation** — no multi-call protocols
- **Stable binary interface** — changes require version bump in `Cargo.toml`
- **Documented stride and layout** — every function MUST document its buffer layout in its Rust doc comment
- **Tier isolation** — `bulk_ops.rs` must NOT import anything from `physics2d/` or `physics3d/`
- **Test file per module** — `tests/bulk_ops_tests.rs`, `tests/bulk_ops_physics2d_tests.rs`, etc.

---

### Tier 1 — `bulk_ops.rs` (pure ECS, no physics)

#### Already exists (do NOT change signatures — used by WasmBridge)

```rust
/// Read N components in one call. Output: tightly packed `[e0_bytes | e1_bytes | ...]`.
/// Stride = `out_buf.len() / slots.len()`. Dead entities → zeros.
#[wasm_bindgen]
pub fn get_components_bulk(
    slots: &[u32], gens: &[u32],
    component_type_id: u32,
    out_buf: &mut [u8],
) -> u32

/// Write N components in one call. Input: tightly packed same layout.
#[wasm_bindgen]
pub fn set_components_bulk(
    slots: &[u32], gens: &[u32],
    component_type_id: u32,
    data: &[u8],
)

/// Query archetype, write slot indices to static 10K buffer. Returns count.
#[wasm_bindgen]
pub fn query_entities_to_buffer(component_type_ids: &[u32]) -> u32

/// Pointer to static query result buffer (u32 slot indices).
#[wasm_bindgen]
pub fn get_query_result_ptr() -> *const u32
```

#### To implement in `bulk_ops.rs`

```rust
/// Read multiple component types for all entities matching a query in ONE call.
///
/// # Buffer layout (out_buf) — AoS interleaved by entity
/// `[compA_e0 | compB_e0 | ... | compA_e1 | compB_e1 | ...]`
/// Stride per entity = sum(component_sizes).
/// Dead entities → zero-filled slot.
///
/// # Arguments
/// - `component_type_ids`: types to read (in order, length N)
/// - `component_sizes`: byte size per type (same order, length N)
/// - `out_buf`: caller-allocated, length = entity_count × sum(component_sizes)
/// - Returns: number of entities written
#[wasm_bindgen]
pub fn query_read_components_bulk(
    component_type_ids: &[u32],
    component_sizes: &[u32],
    out_buf: &mut [u8],
) -> u32
```

```rust
/// Write multiple component types for the last-queried entity set in ONE call.
/// Must be called after `query_entities_to_buffer` (reuses its result buffer).
///
/// # Buffer layout (data) — same AoS interleaved layout as query_read_components_bulk
///
/// # Arguments
/// - `component_type_ids`: types to write
/// - `component_sizes`: byte size per type
/// - `data`: packed component data, length = entity_count × sum(component_sizes)
#[wasm_bindgen]
pub fn query_write_components_bulk(
    component_type_ids: &[u32],
    component_sizes: &[u32],
    data: &[u8],
)
```

```rust
/// Integrate velocity into position for all entities matching the query.
/// Fully in WASM — zero JS loop, zero boundary crossings for entity data.
///
/// Expected component schemas (f32, little-endian):
///   Position: { x: f32, y: f32 }  — 8 bytes
///   Velocity: { x: f32, y: f32 }  — 8 bytes
///
/// # Arguments
/// - `position_type_id`: registered component type ID for Position
/// - `velocity_type_id`: registered component type ID for Velocity
/// - `delta_time`: frame delta in seconds
/// - Returns: number of entities updated
///
/// NOTE: This is physics-INDEPENDENT movement (kinematic, not simulated).
/// For Rapier-simulated bodies, use `physics2d_step` / `physics3d_step` instead.
#[wasm_bindgen]
pub fn bulk_integrate_velocity_2d(
    position_type_id: u32,
    velocity_type_id: u32,
    delta_time: f32,
) -> u32

#[wasm_bindgen]
pub fn bulk_integrate_velocity_3d(
    position_type_id: u32,
    velocity_type_id: u32,
    delta_time: f32,
) -> u32
```

```rust
/// Apply a delta transform (translate + rotate) to a set of entities in ONE call.
/// For non-physics movement: camera pan, parallax layers, UI elements.
///
/// # Arguments
/// - `entity_slots`: raw slot indices (from query buffer)
/// - `entity_gens`: generation counters (parallel array to slots)
/// - `transform_type_id`: registered type ID for Transform component
/// - `delta_x`, `delta_y`: world-space translation delta
/// - `delta_rotation`: rotation delta in radians
#[wasm_bindgen]
pub fn bulk_apply_transform_2d(
    entity_slots: &[u32], entity_gens: &[u32],
    transform_type_id: u32,
    delta_x: f32, delta_y: f32, delta_rotation: f32,
)

#[wasm_bindgen]
pub fn bulk_apply_transform_3d(
    entity_slots: &[u32], entity_gens: &[u32],
    transform_type_id: u32,
    delta_x: f32, delta_y: f32, delta_z: f32,
    delta_qx: f32, delta_qy: f32, delta_qz: f32, delta_qw: f32,
)
```

### Module header for `bulk_ops.rs`

```rust
// crates/gwen-core/src/bulk_ops.rs
//
// Tier 1 — Pure ECS bulk operations.
// NO physics imports. NO Rapier dependency.
//
// MAINTENANCE RULES:
//   1. Never change an existing function signature — bump WASM_API_VERSION if you must.
//   2. New functions go at the bottom (stable ABI ordering).
//   3. Every function MUST document its buffer layout in the doc comment.
//   4. No allocations inside function bodies — use static/pre-allocated buffers only.
//   5. Tests live in crates/gwen-core/tests/bulk_ops_tests.rs.
//   6. This file MUST NOT import from physics2d/ or physics3d/.
```

---

### Tier 2 — `bulk_ops_physics2d.rs` (`#[cfg(feature = "physics2d")]`)

```rust
// crates/gwen-core/src/bulk_ops_physics2d.rs
//
// Tier 2 — Physics2D bulk operations (requires Rapier2D).
// Feature flag: physics2d
//
// MAINTENANCE RULES:
//   Same as bulk_ops.rs, plus:
//   7. Only import from Rapier2D and bulk_ops (Tier 1).
//   8. Tests live in crates/gwen-core/tests/bulk_ops_physics2d_tests.rs.
```

```rust
/// Synchronize all ECS Transform components → Rapier2D rigid bodies in ONE call.
/// Call this BEFORE physics2d_step() each frame.
///
/// # Behaviour
/// For each entity with both a Transform component and a registered Rapier body:
///   - Copies (pos_x, pos_y, rotation) from ECS → Rapier body
///   - Marks body as kinematic-position-based for this frame
///
/// # Arguments
/// - `transform_type_id`: ECS component type ID for Transform
/// - Returns: number of bodies synchronized
#[cfg(feature = "physics2d")]
#[wasm_bindgen]
pub fn physics2d_bulk_sync_to_rapier(transform_type_id: u32) -> u32
```

```rust
/// Synchronize all Rapier2D rigid body results → ECS Transform components in ONE call.
/// Call this AFTER physics2d_step() each frame.
///
/// # Behaviour
/// Reads (translation, rotation) from every simulated Rapier body and writes
/// back to the corresponding ECS Transform component.
///
/// # Arguments
/// - `transform_type_id`: ECS component type ID for Transform
/// - Returns: number of components updated
#[cfg(feature = "physics2d")]
#[wasm_bindgen]
pub fn physics2d_bulk_sync_from_rapier(transform_type_id: u32) -> u32
```

```rust
/// Apply impulses to multiple bodies in ONE call.
/// Useful for explosion radius, damage knockback, etc.
///
/// # Buffer layout (impulses) — AoS per entity
/// `[impulse_x: f32 | impulse_y: f32]` per entity, 8 bytes total per entity.
///
/// # Arguments
/// - `entity_slots`, `entity_gens`: target entity set
/// - `impulses`: pre-packed impulse buffer
#[cfg(feature = "physics2d")]
#[wasm_bindgen]
pub fn physics2d_bulk_apply_impulse(
    entity_slots: &[u32], entity_gens: &[u32],
    impulses: &[u8],
)
```

---

### Tier 3 — `bulk_ops_physics3d.rs` (`#[cfg(feature = "physics3d")]`)

```rust
// crates/gwen-core/src/bulk_ops_physics3d.rs
//
// Tier 3 — Physics3D bulk operations (requires Rapier3D).
// Feature flag: physics3d
//
// MAINTENANCE RULES:
//   Same as bulk_ops.rs, plus:
//   7. Only import from Rapier3D and bulk_ops (Tier 1).
//   8. Tests live in crates/gwen-core/tests/bulk_ops_physics3d_tests.rs.
```

```rust
/// Synchronize ECS Transform3D → Rapier3D rigid bodies (position + quaternion).
#[cfg(feature = "physics3d")]
#[wasm_bindgen]
pub fn physics3d_bulk_sync_to_rapier(transform_type_id: u32) -> u32

/// Synchronize Rapier3D results → ECS Transform3D components.
#[cfg(feature = "physics3d")]
#[wasm_bindgen]
pub fn physics3d_bulk_sync_from_rapier(transform_type_id: u32) -> u32

/// Apply impulses to multiple 3D bodies.
/// Buffer layout per entity: [ix: f32 | iy: f32 | iz: f32] = 12 bytes.
#[cfg(feature = "physics3d")]
#[wasm_bindgen]
pub fn physics3d_bulk_apply_impulse(
    entity_slots: &[u32], entity_gens: &[u32],
    impulses: &[u8],
)
```

---

### Tier Separation in `lib.rs`

```rust
// crates/gwen-core/src/lib.rs

mod bulk_ops;                           // Always included

#[cfg(feature = "physics2d")]
mod bulk_ops_physics2d;

#[cfg(feature = "physics3d")]
mod bulk_ops_physics3d;
```

### Module Structure for `bulk_ops.rs` (remove duplicate)

See Tier Separation in `lib.rs` above — that block supersedes this.

---

## 7. The `gwen:optimizer` Vite Plugin

### Tier Awareness

The plugin reads `gwen.config.ts` at `buildStart` to detect which WASM tier is active:

```ts
// packages/vite/src/plugins/optimizer.ts

type WasmTier = 'core' | 'physics2d' | 'physics3d'

function detectTier(options: GwenViteOptions): WasmTier {
  if (options.wasm?.some(m => m.name === 'physics3d')) return 'physics3d'
  if (options.wasm?.some(m => m.name === 'physics2d')) return 'physics2d'
  return 'core'
}
```

The tier determines which bulk call variants the code generator can emit:

| Tier | Available bulk ops |
|---|---|
| `core` | `query_read_components_bulk`, `query_write_components_bulk`, `bulk_integrate_velocity_*`, `bulk_apply_transform_*` |
| `physics2d` | All of core + `physics2d_bulk_sync_to_rapier`, `physics2d_bulk_sync_from_rapier`, `physics2d_bulk_apply_impulse` |
| `physics3d` | All of core + `physics3d_bulk_sync_to_rapier`, `physics3d_bulk_sync_from_rapier`, `physics3d_bulk_apply_impulse` |

### Plugin Lifecycle

```ts
export function gwenOptimizerPlugin(options: GwenViteOptions): Plugin {
  const manifest = new ComponentManifestResolver()
  const tier = detectTier(options)

  return {
    name: 'gwen:optimizer',
    enforce: 'pre',   // Must run before TypeScript transform

    async buildStart() {
      // Resolve all defineComponent() calls in the project
      // Builds a map: importPath#varName → ComponentManifest
      await manifest.resolve(options.root ?? process.cwd())
    },

    transform(code: string, id: string) {
      if (!id.match(/\.(tsx?)$/)) return null
      if (id.includes('node_modules')) return null

      const optimizer = new GwenEcsOptimizer(code, id, manifest, tier)
      return optimizer.transform()
    },
  }
}
```

### Pattern Detection Rules

The detector classifies patterns by **purity** before deciding to transform:

| Condition | Result |
|---|---|
| `for...of` iterates a `useQuery()` result | ✅ Candidate |
| Loop body only calls `e.get()` and `e.set()` | ✅ Pure — transform Level 2 |
| Loop body creates entities | ❌ Skip — invalidates query |
| Loop body deletes entities | ❌ Skip — invalidates iteration |
| Loop body has early `return` or `break` | ⚠️ Partial — transform with guard |
| Component set is statically known | ✅ Candidate |
| Component set depends on runtime value | ❌ Skip |

### Opt-In / Opt-Out

The transform is **automatic for pure patterns**. For edge cases:

```ts
// Force skip a specific loop (e.g., contains entity creation)
// @gwen-no-optimize
for (const e of entities) {
  // ...
}

// Force Level 2 even if not fully pure (advanced users)
// @gwen-force-bulk
for (const e of entities) {
  // ...
}
```

### Source Maps

The plugin MUST emit valid source maps so DevTools shows the original code, not the transformed output. Use `magic-string` for surgical AST rewrites with source map support.

---

## 8. TypeScript API Additions (WasmBridge)

The following methods are needed on `WasmBridge` to support the generated code:

```ts
// packages/core/src/engine/wasm-bridge.ts

/**
 * Read multiple component types for the current query result in one call.
 * Interleaved AoS layout: [compA_e0 | compB_e0 | compA_e1 | compB_e1 | ...]
 *
 * @performance 1 WASM call regardless of entity count.
 */
queryReadBulk(
  componentTypeIds: number[],
  componentSizes: number[],
): Float32Array

/**
 * Write multiple component types for the current query result in one call.
 * Must be called after queryReadBulk() or queryEntitiesRaw().
 *
 * @performance 1 WASM call regardless of entity count.
 */
queryWriteBulk(
  componentTypeIds: number[],
  componentSizes: number[],
  data: Float32Array,
): void
```

---

## 9. Maintenance and Evolution Guidelines

### Versioning

```toml
# crates/gwen-core/Cargo.toml
[package]
version = "X.Y.Z"
# X = breaking bulk API change
# Y = new bulk API added (additive)
# Z = bug fix / internal change only
```

```ts
// packages/core/src/engine/wasm-bridge.ts
export const WASM_BULK_API_VERSION = 1  // increment when bulk_ops.rs changes signatures
```

### Adding a New Bulk Operation

**Determine the correct tier first:**
- Pure ECS (no Rapier) → `bulk_ops.rs`
- Requires Rapier2D → `bulk_ops_physics2d.rs` with `#[cfg(feature = "physics2d")]`
- Requires Rapier3D → `bulk_ops_physics3d.rs` with `#[cfg(feature = "physics3d")]`

Then:
1. Add the Rust function to the correct tier file
2. Document buffer layout in the doc comment (see §6)
3. Add tests in the matching `tests/bulk_ops_*_tests.rs`
4. Add the TypeScript wrapper in `packages/core/src/engine/wasm-bridge.ts`
5. If the Vite optimizer can use it, register it in `optimizer/pattern-detector.ts` with its tier
6. Increment `WASM_BULK_API_VERSION` in wasm-bridge
7. Update this document (§6 API catalogue)

### Adding a New Schema Type to `defineComponent`

When a new `Types.*` value is added:
1. Define byte size and `f32Offset` in `optimizer/component-manifest.ts`
2. Ensure the Rust component store encodes it at the same layout
3. Add a test in `tests/optimizer/schema-layout.test.ts` that verifies TS and Rust agree

### What NOT to Do

- ❌ Do NOT use `get_component_raw()` / `add_component()` in hot frame loops — always bulk
- ❌ Do NOT allocate inside WASM hot paths (`Vec::new()`, `String::new()`) — use static buffers
- ❌ Do NOT change bulk function signatures without bumping WASM_BULK_API_VERSION
- ❌ Do NOT use the Proxy from `useComponent()` in `onUpdate` — this is what the optimizer eliminates
- ❌ Do NOT add `#[wasm_bindgen]` functions to `bulk_ops.rs` that allocate per entity

---

## 10. Benchmark Targets

Before calling the optimizer "done", the following benchmarks must pass:

| Scenario | Target | Measurement |
|---|---|---|
| MovementSystem, 10K entities | ≤ 3 WASM calls/frame | DevTools WASM counter |
| MovementSystem, 10K entities | Faster than pure TS equivalent | `pnpm bench` |
| Transform overhead (build) | < 100ms for 100 source files | `pnpm build` timing |
| Source maps valid | Original line numbers in DevTools | Manual check |

---

## 11. Relationship to Physics (Rapier)

Rapier (physics2d / physics3d) has its own step loop in WASM. The optimizer does NOT touch:
- `physics2d.step(dt)` — this is already a single WASM call
- `sync_transforms_to_buffer()` / `sync_transforms_from_buffer()` — these already use shared memory

The optimizer targets the **ECS component layer** (non-physics systems). The two pipelines coexist:

```
Frame:
  1. [Optimizer output] Bulk read inputs, compute, bulk write ECS components
  2. [Physics] sync_transforms_to_buffer() — push to Rapier
  3. [Physics] physics2d_step(dt)          — Rapier runs in WASM
  4. [Physics] sync_transforms_from_buffer() — pull from Rapier
  5. [Renderer] Read ECS components → draw
```

---

## 12. Implementation Plan

> **This section tracks the phased rollout. Update status as work progresses.**

### Phase 0 — Foundation (prerequisite for all phases)
- [ ] `defineComponent` exposes `_typeId`, `_byteSize`, `_f32Stride`, `_fields` at runtime
- [ ] `ComponentManifest` buildable statically from `defineComponent` schema literals
- [ ] **Tier 1 Rust:** Add `bulk_ops.rs` with `query_read_components_bulk` + `query_write_components_bulk`
- [ ] **Tier 1 Rust:** Add `bulk_integrate_velocity_2d/3d` + `bulk_apply_transform_2d/3d`
- [ ] **Tier 2 Rust:** Add `bulk_ops_physics2d.rs` behind `#[cfg(feature = "physics2d")]`
- [ ] **Tier 3 Rust:** Add `bulk_ops_physics3d.rs` behind `#[cfg(feature = "physics3d")]`
- [ ] Wire the 3 modules into `lib.rs` with correct `#[cfg]` guards
- [ ] Add `queryReadBulk` / `queryWriteBulk` to TypeScript `WasmBridge`
- [ ] Rust unit tests: `tests/bulk_ops_tests.rs`, `tests/bulk_ops_physics2d_tests.rs`, `tests/bulk_ops_physics3d_tests.rs`

### Phase 1 — Level 2 Transform (highest ROI)
- [ ] `ast-walker.ts`: parse TS files, detect `useQuery` + `for...of` + `e.get/set` pattern
- [ ] `pattern-detector.ts`: classify loops as pure / impure
- [ ] `code-generator.ts`: emit tier-aware bulk read + plain loop + bulk write
- [ ] `detectTier(options)` reads `gwen.config.ts` to select available ops
- [ ] Source map support via `magic-string`
- [ ] Tests: `tests/optimizer/level2.test.ts` (transform output verified)
- [ ] Benchmark: MovementSystem 10K entities — core / physics2d / physics3d tiers

### Phase 2 — Level 1 Transform
- [ ] `ast-walker.ts`: detect `useComponent(X)` + property access in `onUpdate`
- [ ] `code-generator.ts`: replace Proxy access with direct `ComponentDef._data[]` access
- [ ] Tests: `tests/optimizer/level1.test.ts`

### Phase 3 — WASM Built-ins (canonical patterns → single WASM call)
- [ ] Detect velocity integration pattern → emit `bulk_integrate_velocity_2d/3d` (Tier 1)
- [ ] Detect physics sync bookend → emit `physics2d_bulk_sync_to_rapier` (Tier 2)
- [ ] Detect impulse apply → emit `physics2d_bulk_apply_impulse` (Tier 2)

### Phase 4 — Polish
- [ ] `@gwen-no-optimize` / `@gwen-force-bulk` annotations
- [ ] Dev-mode warning when a transformable pattern is skipped
- [ ] DevTools integration: label bulk calls in WASM profiling
- [ ] Update `internals-docs/gwen-ecs-optimizer.md` with final API surface after Phase 3
