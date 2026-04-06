# SharedArrayBuffer Memory Map — GWEN Engine

**Audience:** GWEN core contributors (Rust + TS) and external WASM plugin authors  
**Status:** Living document — update when strides, flags, or region protocols change  
**Location:** `internals-docs/` — not published to VitePress

---

## Table of Contents

1. [Overview](#1-overview)
2. [Two Distinct Memory Systems](#2-two-distinct-memory-systems)
3. [System A — gwen-core SAB (built-in plugins)](#3-system-a--gwen-core-sab-built-in-plugins)
   - [3.1 2D Transform Buffer (stride 32 B)](#31-2d-transform-buffer-stride-32-b)
   - [3.2 3D Transform Buffer (stride 48 B)](#32-3d-transform-buffer-stride-48-b)
   - [3.3 Flags field](#33-flags-field)
   - [3.4 Linear region allocation and sentinel guards](#34-linear-region-allocation-and-sentinel-guards)
   - [3.5 Synchronisation flow (per-frame)](#35-synchronisation-flow-per-frame)
4. [System B — Community WASM module memory (RFC-008)](#4-system-b--community-wasm-module-memory-rfc-008)
   - [4.1 WasmRegionView](#41-wasmregionview)
   - [4.2 WasmRingBuffer](#42-wasmringbuffer)
   - [4.3 Ring buffer memory placement — known constraint](#43-ring-buffer-memory-placement--known-constraint)
5. [Is the current architecture sufficient?](#5-is-the-current-architecture-sufficient)
   - [5.1 For built-in GWEN plugins](#51-for-built-in-gwen-plugins)
   - [5.2 For RFC-008 community WASM plugins](#52-for-rfc-008-community-wasm-plugins)
   - [5.3 For TypeScript-only plugins](#53-for-typescript-only-plugins)
   - [5.4 Gap summary](#54-gap-summary)
6. [Guide for new plugin authors](#6-guide-for-new-plugin-authors)
7. [Constants reference](#7-constants-reference)

---

## 1. Overview

GWEN uses **zero-copy inter-module communication** through shared memory. Two complementary
systems exist depending on the plugin type:

| System | Used by | Memory lives in |
|--------|---------|-----------------|
| **System A** — `SharedMemoryManager` | Built-in WASM plugins (physics2d, physics3d) | `gwen-core.wasm` linear memory |
| **System B** — `WasmRegionView` / `WasmRingBuffer` | RFC-008 community WASM plugins | Each module's own WASM linear memory |

Both systems avoid JavaScript-level copying. The cost of reading entity state per frame is
limited to a `TypedArray` view construction (a few nanoseconds), not a `postMessage` or
`JSON.stringify`.

---

## 2. Two Distinct Memory Systems

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         gwen-core.wasm linear memory                        │
│                                                                             │
│  [ Transform buffer — maxEntities × 32 B (2D) or × 48 B (3D) ]            │
│  [ physics2d region ] [ SENTINEL ] [ physics3d region ] [ SENTINEL ] …     │
│                                                                             │
│  ← alloc_shared_buffer() carves regions out of this space                  │
└─────────────────────────────────────────────────────────────────────────────┘
         ↑ ptr passed to built-in Rust plugins at construction time

┌───────────────────────┐   ┌───────────────────────┐
│  agents.wasm memory   │   │  pathfind.wasm memory  │
│  [ named regions ]    │   │  [ named regions ]     │
│  [ ring buffers ]     │   │  [ ring buffers ]      │
└───────────────────────┘   └───────────────────────┘
  ↑ RFC-008 community plugins — each has its own isolated WASM memory
    accessed from TS via handle.region('name') and handle.channel('name')
```

The two systems **never share the same buffer**. A community plugin cannot read gwen-core's
transform buffer directly — see [Gap 3](#54-gap-summary) for the known limitation.

---

## 3. System A — gwen-core SAB (built-in plugins)

### 3.1 2D Transform Buffer (stride 32 B)

`TRANSFORM_STRIDE = 32` — defined in both TypeScript (`shared-memory.ts`) and Rust
(`crates/gwen-core/src/transform.rs`). **Both sides must be kept in sync manually.**

```
slot_offset = entity_index × 32

┌──────────────────────────────────────────────────────────────────────────────┐
│ byte  0 │ pos_x    │ f32 (4 B) │ World X position in metres                 │
│ byte  4 │ pos_y    │ f32 (4 B) │ World Y position in metres                 │
│ byte  8 │ rotation │ f32 (4 B) │ Rotation angle in radians                  │
│ byte 12 │ scale_x  │ f32 (4 B) │ Horizontal scale factor                    │
│ byte 16 │ scale_y  │ f32 (4 B) │ Vertical scale factor                      │
│ byte 20 │ flags    │ u32 (4 B) │ See §3.3                                    │
│ byte 24 │ reserved │  8 bytes  │ Reserved — must write 0, do not read        │
└──────────────────────────────────────────────────────────────────────────────┘
Total: 32 bytes
```

### 3.2 3D Transform Buffer (stride 48 B)

`TRANSFORM3D_STRIDE = 48` — aligned to 16 bytes (SIMD-friendly).

```
slot_offset = entity_index × 48

┌──────────────────────────────────────────────────────────────────────────────┐
│ byte  0 │ pos_x   │ f32 (4 B) │ World X position in metres                  │
│ byte  4 │ pos_y   │ f32 (4 B) │ World Y position in metres                  │
│ byte  8 │ pos_z   │ f32 (4 B) │ World Z position in metres                  │
│ byte 12 │ rot_x   │ f32 (4 B) │ Quaternion X component                      │
│ byte 16 │ rot_y   │ f32 (4 B) │ Quaternion Y component                      │
│ byte 20 │ rot_z   │ f32 (4 B) │ Quaternion Z component                      │
│ byte 24 │ rot_w   │ f32 (4 B) │ Quaternion W component (identity = 1.0)      │
│ byte 28 │ scale_x │ f32 (4 B) │ X scale factor                              │
│ byte 32 │ scale_y │ f32 (4 B) │ Y scale factor                              │
│ byte 36 │ scale_z │ f32 (4 B) │ Z scale factor                              │
│ byte 40 │ flags   │ u32 (4 B) │ See §3.3                                    │
│ byte 44 │ padding │  4 bytes  │ 16-byte alignment pad — write 0, do not read │
└──────────────────────────────────────────────────────────────────────────────┘
Total: 48 bytes
```

### 3.3 Flags field

The `flags` field at `slot_offset + 20` (2D) or `slot_offset + 40` (3D) is a `u32` bitmask:

| Bit | Constant | Meaning |
|-----|----------|---------|
| 0 | `FLAG_PHYSICS_ACTIVE = 0b01` | Slot is managed by a physics plugin. The ECS reads position back from the buffer after the physics step. |
| 1 | `dirty` (internal) | ECS transform changed this frame — physics must pick up the new position. Cleared after sync. |
| 2–31 | — | Reserved — must write 0 |

TypeScript constants are exported from `packages/core/src/wasm/shared-memory.ts`:

```typescript
import { FLAG_PHYSICS_ACTIVE, FLAGS_OFFSET, FLAGS3D_OFFSET } from '@gwenjs/core/wasm/shared-memory';
```

### 3.4 Linear region allocation and sentinel guards

The full buffer is allocated once at engine start via `alloc_shared_buffer(byteLength)`.
Built-in plugins then carve named regions out of it:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  region 'physics2d'   (aligned to 8 B)  │  0xDEADBEEF  │  padding  │        │
│  region 'physics3d'   (aligned to 8 B)  │  0xDEADBEEF  │  padding  │        │
│  …                                                                           │
└──────────────────────────────────────────────────────────────────────────────┘
```

- Regions are allocated **linearly** in declaration order — deterministic, no fragmentation.
- Each region is followed by a 4-byte sentinel `0xDEADBEEF`.
- `SharedMemoryManager.checkSentinels(bridge)` verifies sentinels every frame (debug mode).
  Overwriting a sentinel means a Rust plugin wrote past its `byteLength` — immediate throw.
- Region size is **rounded up to the nearest 8 bytes** (required by the wasm-bindgen allocator).
- Calling `allocateRegion(pluginId, bytes)` twice with the same id is **idempotent**.

### 3.5 Synchronisation flow (per-frame)

```
Frame start
  │
  ├─ ECS dirty check → sync_transforms_to_buffer_sparse(ptr)
  │    Only writes slots whose dirty bit is set. O(dirty_count), not O(maxEntities).
  │
  ├─ physics step (Rust, inside gwen-core) reads/writes the buffer directly
  │
  └─ sync_transforms_from_buffer(ptr, maxEntities)
       Reads FLAG_PHYSICS_ACTIVE slots back into the ECS.
```

The sparse variant (`sync_transforms_to_buffer_sparse`) was added for performance: on a
typical frame only a handful of entities move, so scanning all `maxEntities` slots is wasteful.

---

## 4. System B — Community WASM module memory (RFC-008)

RFC-008 introduced `engine.loadWasmModule(options)`. Community plugins compile their own
`.wasm` files and declare their memory layout in JavaScript:

```typescript
const handle = await engine.loadWasmModule({
  name: 'agents',
  url: '/agents.wasm',
  memory: {
    regions: [
      { name: 'state', byteOffset: 1024, byteLength: 10_000 * 16, type: 'f32' },
    ],
  },
  channels: [
    { name: 'commands', direction: 'ts→wasm', capacity: 256, itemByteSize: 16 },
  ],
  step: (h, dt) => (h.exports as AgentsExports).tick(dt),
});
```

### 4.1 WasmRegionView

`handle.region('state')` returns a `WasmRegionView`. Each property access (`.f32`, `.u32`, etc.)
creates a **new `TypedArray`** backed by the module's current `WebAssembly.Memory.buffer`.
This means views are **never stale** after `memory.grow()` — but also that you should not store
the `TypedArray` across frames:

```typescript
// ✅ Correct — fresh view each frame
onUpdate(() => {
  const state = handle.region('state').f32;
  for (let i = 0; i < entityCount; i++) {
    const x = state[i * 4 + 0];
  }
});

// ❌ Wrong — stored view is invalidated by memory.grow()
const stateView = handle.region('state').f32;
onUpdate(() => { stateView[0] = 1; }); // may crash after grow
```

### 4.2 WasmRingBuffer

Ring buffers are declared in `options.channels` and accessed via `handle.channel('commands')`.
Items are fixed-size byte payloads. The ring buffer is lock-free (single-threaded JS — no
`SharedArrayBuffer` or `Atomics` required).

```typescript
// Enqueue a 16-byte command from TS → WASM
const cmd = new Float32Array([entityId, 1, 0, 0]); // 4 f32 = 16 bytes
handle.channel('commands').push(cmd);

// In the WASM step callback, the Rust side drains the ring buffer
step: (h, dt) => (h.exports as AgentsExports).drain_commands_and_tick(dt),
```

### 4.3 Ring buffer memory placement — known constraint

`WasmRingBuffer` currently hardcodes `_byteOffset = 0`, meaning it assumes the ring buffer
data starts at the very beginning of the module's WASM linear memory. In practice, WASM
modules using `wasm-bindgen` or `wasm-pack` reserve the first several kilobytes for allocator
metadata — writing there corrupts the allocator.

**Current workaround:** Community WASM modules that use ring buffers must either:
1. Export a `ring_buffer_base(): i32` function that returns the correct base address, OR
2. Declare regions with an explicit `byteOffset > 0` that avoids the allocator heap

This is a **known gap** tracked below. A future version will use the exported symbol to
derive the correct offset automatically.

---

## 5. Is the current architecture sufficient?

### 5.1 For built-in GWEN plugins

✅ **Yes — fully sufficient.** The physics2d and physics3d plugins use the System A SAB:
- Layout is stable and documented (§3.1, §3.2)
- Sentinel guards catch buffer overruns immediately in debug mode
- Sparse sync minimises per-frame overhead
- Constants are defined once in Rust and mirrored in TS — the only risk is a manual drift

**Action required when adding a new built-in plugin:**
1. Call `sharedMemory.allocateRegion(pluginId, maxEntities * stride)` before plugin init
2. Pass `region.ptr` to the Rust constructor
3. Define the per-slot layout in this document

### 5.2 For RFC-008 community WASM plugins

⚠️ **Partially sufficient.** The mechanism works for self-contained modules, but three gaps
limit more advanced use cases:

| # | Gap | Impact | Workaround |
|---|-----|--------|------------|
| 1 | `WasmRingBuffer._byteOffset` hardcoded to `0` | Corrupts wasm-bindgen allocator if module uses dynamic allocation | Export `ring_buffer_base(): i32` from WASM and use a fixed byteOffset |
| 2 | No access to gwen-core's transform buffer from a community plugin | A community plugin cannot read entity positions without a separate JS call | Pass transform ptr via an init export, or use ring buffer to relay data |
| 3 | No version field on `WasmMemoryRegion` | Layout changes in the WASM module silently break the TS side | Document layout version in `memory.regions[].name` by convention (e.g. `'state_v2'`) |

None of these gaps block shipping community plugins today. They become relevant once a
plugin needs to interact directly with the ECS transform buffer.

### 5.3 For TypeScript-only plugins

✅ **No memory concerns.** TS plugins use the composable API (`useQuery`, `useComponent`, etc.)
and never touch the SAB directly.

### 5.4 Gap summary

```
Gap 1 — WasmRingBuffer byteOffset=0
  Severity: Medium (silent memory corruption in modules using dynamic alloc)
  Fix:      Derive offset from exported WASM symbol `ring_buffer_base()`

Gap 2 — Community plugins cannot read gwen-core transform buffer
  Severity: Low (current RFC-008 scope does not require it)
  Fix:      Add `engine.getTransformBufferPtr(): number` to the public API
            and document the hand-off protocol

Gap 3 — No memory layout versioning
  Severity: Low (only matters during active development of a community plugin)
  Fix:      Naming convention: suffix region names with _v<N> on breaking changes
```

---

## 6. Guide for new plugin authors

### New built-in plugin (Rust, ships with GWEN core)

1. **Define stride constant** in `crates/gwen-core/src/your_plugin/mod.rs`:
   ```rust
   pub const YOUR_STRIDE: usize = 16; // bytes per entity slot
   ```

2. **Mirror in TypeScript** in `packages/core/src/wasm/shared-memory.ts`:
   ```typescript
   export const YOUR_STRIDE = 16;
   ```

3. **Allocate region** in the engine init sequence:
   ```typescript
   const region = sharedMemory.allocateRegion('your-plugin', maxEntities * YOUR_STRIDE);
   ```

4. **Pass ptr to Rust constructor**:
   ```typescript
   const plugin = new WasmYourPlugin(region.ptr, maxEntities);
   ```

5. **Document slot layout** in this file (§3.x new subsection).

6. **Add sentinel check** — it is automatic: `checkSentinels()` runs every debug frame.

### New RFC-008 community plugin (standalone `.wasm`)

1. **Decide byteOffset carefully.** If your WASM module uses any dynamic allocation
   (`Box`, `Vec`, strings), the allocator metadata starts near address 0. Use `16_384`
   (16 KB) as a safe base offset, or export a `ring_buffer_base(): i32` symbol.

2. **Declare your memory layout** in `loadWasmModule` options:
   ```typescript
   memory: {
     regions: [
       // byteOffset=16384 — safely above wasm-bindgen allocator metadata
       { name: 'agent_state', byteOffset: 16_384, byteLength: maxAgents * 32, type: 'f32' },
     ],
   },
   channels: [
     { name: 'spawn_commands', direction: 'ts→wasm', capacity: 128, itemByteSize: 16 },
   ],
   ```

3. **Never store TypedArray views across frames** — always re-read from `handle.region('name').f32`.

4. **Document your slot layout** in your plugin's README, not here.

---

## 7. Constants reference

| Constant | Value | Location |
|----------|-------|----------|
| `TRANSFORM_STRIDE` | `32` B | `packages/core/src/wasm/shared-memory.ts` · `crates/gwen-core/src/transform.rs` |
| `TRANSFORM3D_STRIDE` | `48` B | `packages/core/src/wasm/shared-memory.ts` |
| `FLAGS_OFFSET` (2D) | `20` B | `packages/core/src/wasm/shared-memory.ts` |
| `FLAGS3D_OFFSET` (3D) | `40` B | `packages/core/src/wasm/shared-memory.ts` |
| `FLAG_PHYSICS_ACTIVE` | `0b01` | `packages/core/src/wasm/shared-memory.ts` |
| `SENTINEL` | `0xDEADBEEF` | `packages/core/src/wasm/shared-memory.ts` |
| `TRANSFORM_SAB_TYPE_ID` | `u32::MAX - 1` | `crates/gwen-core/src/transform.rs` · `crates/gwen-core/src/bindings.rs` |

> ⚠️ `TRANSFORM_STRIDE` and `TRANSFORM_SAB_TYPE_ID` are defined in **both** Rust and TypeScript.
> They must be kept in sync manually — there is no compile-time check enforcing this.

---

## Fixed Gaps (implemented)

### GAP 1 — Ring buffer placement

**Root cause:** `WasmRingBuffer._byteOffset = 0` wrote at WASM shadow stack offset 0.

**Fix:** The `gwen_channel!()` macro in `crates/gwen-wasm-utils` declares
`static mut [u8; N]` in the data segment and exports its address as
`gwen_{name}_ring_ptr() -> i32`. The TypeScript `WasmRingBuffer` constructor
reads this export and uses the returned value as `_byteOffset`.

**Byte-offset resolution priority:**
1. `WasmChannelOptions.byteOffset` — explicit override (highest priority)
2. `exports.gwen_{name}_ring_ptr()` — auto-detection via `gwen_channel!()` macro
3. `65_536` — first 64 KiB page boundary (past the shadow stack, fallback)

---

### GAP 2 — Cross-WASM transform buffer access (V1)

**Root cause:** Community plugins (separate WASM modules) cannot directly
access gwen-core's linear memory.

**V1 fix (host function imports):** The engine always injects three JavaScript
functions into the WASM import object under the `gwen` namespace:

| Import | Rust signature | Description |
|---|---|---|
| `gwen.transform_buffer_ptr` | `fn gwen_transform_buffer_ptr() -> i32` | Absolute address of transform buffer in WASM linear memory |
| `gwen.transform_stride` | `fn gwen_transform_stride() -> i32` | 32 bytes (2D stride) |
| `gwen.max_entities` | `fn gwen_max_entities() -> i32` | Engine `maxEntities` |

Plugins call these once in `init()` and cache the values in `static mut` fields.

**V2 migration path (future):** When `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` headers are available, replace host
functions with `new WebAssembly.Memory({ shared: true })` passed to both gwen-core
and community plugins. Zero-copy, zero JS overhead.

---

### GAP 3 — Plugin API versioning

**Fix:** Community plugins export `gwen_plugin_api_version() -> i32`.
Use `gwen_channel!(name, cap, size, version = N)` to generate this automatically.

**Version encoding:** `major * 1_000_000 + minor * 1_000 + patch`.
Example: `1.2.3 → 1_002_003`.

**TypeScript gate:**
```typescript
await engine.loadWasmModule({
  name: 'my-plugin',
  url: '/my-plugin.wasm',
  expectedVersion: 1_000_000,  // expect v1.0.0
  versionPolicy: 'throw',      // throw if mismatch
});
```
