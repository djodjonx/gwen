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
  ├── bulk_ops.rs                        ← New: bulk ECS operations (see §5)
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

The existing `get_components_bulk` / `set_components_bulk` cover most cases. The following additional APIs need to be implemented in `crates/gwen-core/src/bulk_ops.rs`.

### Design Principles for Rust APIs

- **No allocations in hot paths** — all output goes into caller-provided buffers
- **Single WASM export per operation** — no multi-call protocols
- **Stable binary interface** — changes require version bump in `Cargo.toml`
- **Documented stride and layout** — every function must document its buffer layout in its doc comment
- **Separate module** — `bulk_ops.rs` is isolated from `bindings.rs` for clarity

### API Catalogue

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

#### To implement — Archetype-Aware Bulk Ops

```rust
/// Read multiple component types for all entities matching a query in one call.
///
/// # Buffer layout (out_buf)
/// `[component_A_for_e0 | component_B_for_e0 | ... | component_A_for_e1 | ...]`
/// Interleaved by entity (AoS layout for cache friendliness when reading all
/// components of one entity together, e.g., physics integration).
///
/// # Arguments
/// - `component_type_ids`: component types to read (in order)
/// - `component_sizes`: byte size per component (same order)
/// - `out_buf`: pre-allocated by caller, length = entity_count × sum(component_sizes)
/// - Returns: number of entities written
#[wasm_bindgen]
pub fn query_read_components_bulk(
    component_type_ids: &[u32],
    component_sizes: &[u32],
    out_buf: &mut [u8],
) -> u32
```

```rust
/// Write multiple component types for all currently-queried entities in one call.
/// Must be called after `query_entities_to_buffer` (uses same entity set).
///
/// # Buffer layout (data)
/// Same interleaved AoS layout as `query_read_components_bulk`.
///
/// # Arguments
/// - `component_type_ids`: component types to write
/// - `component_sizes`: byte size per component
/// - `data`: packed component data
#[wasm_bindgen]
pub fn query_write_components_bulk(
    component_type_ids: &[u32],
    component_sizes: &[u32],
    data: &[u8],
)
```

```rust
/// Compute linear velocity integration for all entities matching a query.
/// This is the canonical "Movement System" operation, entirely in WASM.
///
/// Reads Position + Velocity components, integrates, writes Position.
/// Layout expected: Position = { x: f32, y: f32 }, Velocity = { x: f32, y: f32 }
///
/// # Arguments
/// - `position_type_id`: registered component type ID for Position
/// - `velocity_type_id`: registered component type ID for Velocity
/// - `delta_time`: frame delta in seconds
/// - Returns: number of entities updated
///
/// This is a Tier-2 API (physics-independent). For full physics, use the
/// physics2d/3d step functions instead.
#[wasm_bindgen]
pub fn bulk_integrate_velocity_2d(
    position_type_id: u32,
    velocity_type_id: u32,
    delta_time: f32,
) -> u32
```

```rust
/// Apply a uniform transform (translation + rotation + scale) to a set of entities.
/// Designed for camera, particle systems, and non-physics movement.
///
/// # Arguments
/// - `entity_slots`: raw entity slot indices (from query buffer)
/// - `entity_gens`: generation counters (must match)
/// - `transform_type_id`: registered type ID for the Transform component
/// - `delta_x`, `delta_y`: translation delta
/// - `delta_rotation`: rotation delta in radians
#[wasm_bindgen]
pub fn bulk_apply_transform_2d(
    entity_slots: &[u32],
    entity_gens: &[u32],
    transform_type_id: u32,
    delta_x: f32,
    delta_y: f32,
    delta_rotation: f32,
)
```

### Module Structure for `bulk_ops.rs`

```rust
// crates/gwen-core/src/bulk_ops.rs
//
// Bulk ECS operations — all WASM-exported functions that operate on
// multiple entities in one call.
//
// MAINTENANCE RULES:
// 1. Never change an existing function signature without bumping WASM_API_VERSION.
// 2. New functions go at the bottom to keep existing offsets stable.
// 3. Every function MUST document its buffer layout in the doc comment.
// 4. No allocations inside hot paths — use pre-allocated buffers only.
// 5. Test every function in tests/bulk_ops_tests.rs before merging.

mod bulk_ops {
  // ... implementations
}
```

---

## 7. The `gwen:optimizer` Vite Plugin

### Plugin Lifecycle

```ts
// packages/vite/src/plugins/optimizer.ts

export function gwenOptimizerPlugin(options: GwenViteOptions): Plugin {
  // Build-time component manifest (populated during build start)
  const manifest = new ComponentManifestResolver()

  return {
    name: 'gwen:optimizer',
    enforce: 'pre',   // Must run before TypeScript transform

    async buildStart() {
      // Resolve all defineComponent() calls in the project
      // Builds a map: importPath#varName → ComponentManifest
      await manifest.resolve(options.root ?? process.cwd())
    },

    transform(code: string, id: string) {
      // Only transform .ts / .tsx files
      if (!id.match(/\.(tsx?)$/)) return null
      // Skip node_modules
      if (id.includes('node_modules')) return null

      const optimizer = new GwenEcsOptimizer(code, id, manifest)
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

1. Add the Rust function to `crates/gwen-core/src/bulk_ops.rs`
2. Document buffer layout in the doc comment (see §6)
3. Add tests in `crates/gwen-core/tests/bulk_ops_tests.rs`
4. Add the TypeScript wrapper in `packages/core/src/engine/wasm-bridge.ts`
5. If the Vite optimizer can use it, add a pattern in `optimizer/pattern-detector.ts`
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

### Phase 0 — Foundation (prerequisite)
- [ ] `defineComponent` exposes `_typeId`, `_byteSize`, `_f32Stride`, `_fields` at runtime
- [ ] `ComponentManifest` buildable statically from `defineComponent` schema literals
- [ ] Add `bulk_ops.rs` module with `query_read_components_bulk` + `query_write_components_bulk`
- [ ] Add `queryReadBulk` / `queryWriteBulk` to `WasmBridge`

### Phase 1 — Level 2 Transform (highest ROI)
- [ ] `ast-walker.ts`: parse TS files, detect `useQuery` + `for...of` + `e.get/set` pattern
- [ ] `pattern-detector.ts`: classify loops as pure / impure
- [ ] `code-generator.ts`: emit bulk read + plain loop + bulk write
- [ ] Source map support via `magic-string`
- [ ] Tests: `tests/optimizer/level2.test.ts` (transform output verified)
- [ ] Benchmark: MovementSystem 10K entities before/after

### Phase 2 — Level 1 Transform
- [ ] `ast-walker.ts`: detect `useComponent(X)` + property access in `onUpdate`
- [ ] `code-generator.ts`: replace Proxy access with direct `ComponentDef._data[]` access
- [ ] Tests: `tests/optimizer/level1.test.ts`

### Phase 3 — WASM Built-ins (for common patterns)
- [ ] `bulk_integrate_velocity_2d` Rust API + bindings
- [ ] Pattern: detect velocity integration → emit single WASM call
- [ ] `bulk_apply_transform_2d` for non-physics movement

### Phase 4 — Polish
- [ ] `@gwen-no-optimize` / `@gwen-force-bulk` annotations
- [ ] Dev-mode warning when a transformable pattern is skipped
- [ ] DevTools integration: label bulk calls in WASM profiling
