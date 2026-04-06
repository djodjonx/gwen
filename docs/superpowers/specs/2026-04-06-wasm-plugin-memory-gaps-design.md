# WASM Plugin Memory Architecture — Gaps 1–3

**Date:** 2026-04-06  
**Status:** Approved  
**Scope:** `packages/core`, `crates/gwen-wasm-utils`  
**Author:** Copilot (brainstorm session)

---

## Problem Statement

Three architectural gaps exist in the RFC-008 community plugin memory system:

1. **GAP 1 — Ring buffer placement bug**: `WasmRingBuffer._byteOffset` is hardcoded to `0`, which is the WASM shadow stack region. Any Rust function call after a `push()` call overwrites the stack and causes undefined behaviour.

2. **GAP 2 — No transform buffer access**: Community plugins (separate `.wasm` modules with their own linear memory) have no way to read or write the gwen-core transform buffer. Built-in plugins (physics2d, physics3d) share gwen-core's memory because they are compiled as features of the same crate — an option not available to third parties.

3. **GAP 3 — No layout versioning**: If gwen-core changes its memory layout (stride, field offsets, flag bits), community plugins built against the old layout will silently corrupt memory. There is no version check at load time.

---

## GAP 1 — Ring Buffer Placement

### Root Cause

WASM linear memory layout:
```
0x0000 ..  ~0xFFFF  : shadow stack (grows down from ~64 KB)
~0x10000 ..          : data segment (static [u8; N] buffers)
after data segment   : heap (Box, Vec, allocator-managed)
```

A `static mut [u8; N]` in Rust lives in the data segment. Its address is a compile-time constant `i32` that is never touched by the allocator. It is the ideal ring buffer backing store.

### Solution: `gwen_channel!()` macro + auto-detection (Approach B + A fallback)

**Rust side — `crates/gwen-wasm-utils/src/channel.rs` (new file):**
```rust
/// Declare a named ring-buffer channel backed by a static buffer.
///
/// Generates:
/// - `static mut GWEN_CHANNEL_{NAME}: [u8; HEADER_BYTES + capacity * item_size]`
/// - `#[no_mangle] pub extern "C" fn gwen_{name}_ring_ptr() -> i32`
/// - `#[no_mangle] pub extern "C" fn gwen_{name}_ring_cap() -> i32`
/// - `#[no_mangle] pub extern "C" fn gwen_{name}_ring_item_size() -> i32`
///
/// # Example
/// ```rust
/// gwen_channel!(commands, 256, 12);
/// // Then use gwen_wasm_utils::ring::RingWriter with &GWEN_CHANNEL_COMMANDS
/// ```
#[macro_export]
macro_rules! gwen_channel {
    ($name:ident, $capacity:expr, $item_size:expr) => { ... }
}
```

**TypeScript side — `WasmRingBuffer` constructor change:**

```typescript
// Before
constructor(memory: WebAssembly.Memory, opts: WasmChannelOptions) {
  this._byteOffset = 0;   // ← BUG
}

// After
constructor(
  memory: WebAssembly.Memory,
  opts: WasmChannelOptions,
  exports?: WebAssembly.Exports,
) {
  const ptrFn = exports?.[`gwen_${opts.name}_ring_ptr`];
  if (typeof ptrFn === 'function') {
    this._byteOffset = (ptrFn as () => number)();          // ✅ auto-detect
  } else {
    this._byteOffset = opts.byteOffset ?? 65_536;          // ✅ fallback (first page boundary)
  }
}
```

**`WasmChannelOptions` — new optional field:**
```typescript
interface WasmChannelOptions {
  // ... existing fields ...
  /**
   * Explicit byte offset in WASM linear memory for the ring buffer backing store.
   * Only needed for modules that do NOT use the `gwen_channel!()` macro.
   * Defaults to 65 536 (first page boundary) when auto-detection fails.
   */
  byteOffset?: number;
}
```

**`loadWasmModule()` — pass exports to ring buffer constructor:**
```typescript
new WasmRingBuffer(memory, c, instance.exports)
```

### Backward Compatibility

- Modules without `gwen_channel!()`: `byteOffset ?? 65_536` — matches typical shadow stack end for 1-page modules.
- Modules with `gwen_channel!()`: auto-detected, zero configuration required.
- Explicit `byteOffset` in options always wins if present.

---

## GAP 2 — Cross-WASM Transform Buffer Access

### The Constraint

Two WASM modules have **separate linear memories**. Direct memory sharing requires `WebAssembly.Memory({ shared: true })` backed by `SharedArrayBuffer`, which mandates `COOP`/`COEP` HTTP headers — a deployment constraint.

### Two-Phase Solution

#### Phase 1 (V1): Host function imports — ship now

The engine passes JS accessor functions to community plugins via the WASM import object at instantiation:

```typescript
// In loadWasmModule():
const gwen_imports = sharedMemory
  ? buildTransformImports(sharedMemory, maxEntities)
  : {};

await WebAssembly.instantiate(buffer, { gwen: gwen_imports });
```

```typescript
// packages/core/src/wasm/transform-imports.ts (new file)
export interface GwenTransformImports {
  transform_buffer_ptr: () => number;
  transform_stride: () => number;
  max_entities: () => number;
}

export function buildTransformImports(
  sharedMemory: SharedMemoryManager,
  maxEntities: number,
): GwenTransformImports {
  return {
    transform_buffer_ptr: () => sharedMemory.transformBufferPtr,
    transform_stride: () => TRANSFORM_STRIDE,
    max_entities: () => maxEntities,
  };
}
```

On the Rust side, community plugins declare:
```rust
extern "C" {
    fn gwen_transform_buffer_ptr() -> i32;
    fn gwen_transform_stride() -> i32;
    fn gwen_max_entities() -> i32;
}
```

These are called **once** in the `init()` function to cache values. The plugin then has the byte offset of the transform buffer in gwen-core's linear memory — but cannot access that memory directly (it's a different module).

**Important**: For V1, the engine also passes the transform buffer **data** as a separate shared `Uint8Array` via `DataView` functions, OR the plugin uses a secondary WASM linear memory region explicitly allocated and filled by the engine (see below).

**Practical V1 pattern**: The engine allocates a `Float32Array` view over the gwen-core transform buffer region and passes it to community plugins that declare they want it via `WasmModuleOptions.transformAccess: true`. At each frame step, the engine calls the plugin's `step(dt)`. The plugin can reach back into gwen-core data only through the JS import functions — acceptable for plugins that read transforms a few times per frame, not for mass-entity physics loops.

#### Phase 2 (V2): Shared WebAssembly.Memory — future

When the host environment supports it (COOP/COEP configured), the engine creates a shared memory object:
```typescript
const sharedMem = new WebAssembly.Memory({ initial: 64, maximum: 256, shared: true });
// gwen-core is instantiated with this memory as import
// community plugins also receive it as an import
// both can read/write via SharedArrayBuffer — zero copy
```

This is a **non-breaking upgrade**: `WasmModuleOptions` gets `sharedMemory?: WebAssembly.Memory`. If absent, V1 host functions are used.

**`SharedMemoryManager` change**: add `get transformBufferPtr(): number` getter that returns the raw WASM ptr of the transform buffer.

### Scope for this implementation

Implement V1 only:
- Add `get transformBufferPtr(): number` to `SharedMemoryManager`
- Add `buildTransformImports()` helper
- Pass `{ gwen: buildTransformImports(...) }` in `loadWasmModule()` when `sharedMemory` is available
- Add `transformAccess?: boolean` to `WasmModuleOptions` (opt-in, defaults to false)
- Document V2 migration path in `internals-docs/shared-array-buffer-memory-map.md`

---

## GAP 3 — Layout Versioning

### Convention

Any community WASM plugin that accesses the transform buffer SHOULD export:
```rust
#[no_mangle]
pub extern "C" fn gwen_plugin_api_version() -> i32 {
    // Encode as major * 1_000_000 + minor * 1_000 + patch
    // e.g., version 1.2.3 → 1_002_003
    1_000_000
}
```

### TypeScript enforcement

`WasmModuleOptions` gains:
```typescript
/**
 * Inclusive version range [min, max] accepted for this module.
 * Encoded as `major * 1_000_000 + minor * 1_000 + patch`.
 * If the module exports `gwen_plugin_api_version()`, its value is checked
 * against this range at load time.
 * - If out of range: throws an error if `versionPolicy === 'error'`
 *   (default), warns if `'warn'`, ignores if `'off'`.
 */
expectedVersion?: [min: number, max: number];
/** @default 'error' */
versionPolicy?: 'error' | 'warn' | 'off';
```

`loadWasmModule()` reads the export after instantiation:
```typescript
const versionFn = instance.exports['gwen_plugin_api_version'];
if (typeof versionFn === 'function' && options.expectedVersion) {
  const version = (versionFn as () => number)();
  const [min, max] = options.expectedVersion;
  if (version < min || version > max) {
    const msg = `[GWEN] Module "${options.name}" reports API version ${version}, ` +
      `expected ${min}–${max}.`;
    if ((options.versionPolicy ?? 'error') === 'error') throw new Error(msg);
    if (options.versionPolicy === 'warn') console.warn(msg);
  }
}
```

The `gwen_channel!()` macro (GAP 1) optionally includes the version export when `version` argument is provided:
```rust
gwen_channel!(commands, 256, 12, version = 1_000_000);
```

### Scope for this implementation

- Add `expectedVersion?` and `versionPolicy?` to `WasmModuleOptions`
- Add version check in `loadWasmModule()` after instantiation
- Add `gwen_plugin_api_version()` to `gwen_channel!()` macro (optional argument)
- Document convention in `internals-docs/shared-array-buffer-memory-map.md`

---

## Architecture Summary

```
┌──────────────────────────────────────────────────────────────────────┐
│ loadWasmModule(options)                                               │
│                                                                       │
│  1. fetch + instantiate({ gwen: buildTransformImports(...) })        │ ← GAP 2
│  2. version check: exports.gwen_plugin_api_version()                 │ ← GAP 3
│  3. channel setup: new WasmRingBuffer(mem, ch, exports)              │ ← GAP 1
│     └→ auto-detects byteOffset via exports.gwen_{name}_ring_ptr()   │
└──────────────────────────────────────────────────────────────────────┘

Rust plugin (community):
  gwen_channel!(events, 128, 16, version = 1_000_000)
  │
  ├── static GWEN_CHANNEL_EVENTS: [u8; ...]        ← data segment, safe
  ├── gwen_events_ring_ptr() -> i32                ← auto-detection
  ├── gwen_events_ring_cap() -> i32
  ├── gwen_plugin_api_version() -> i32             ← version gate
  └── extern "C" { fn gwen_transform_buffer_ptr(); }  ← V1 access
```

---

## Files to Create / Modify

### New files
- `crates/gwen-wasm-utils/src/channel.rs` — `gwen_channel!()` macro
- `packages/core/src/wasm/transform-imports.ts` — `buildTransformImports()`

### Modified files
- `crates/gwen-wasm-utils/src/lib.rs` — expose `channel` module
- `packages/core/src/engine/wasm-module-handle.ts`
  - `WasmChannelOptions.byteOffset?: number`
  - `WasmRingBuffer` constructor: `exports?` param + auto-detection
- `packages/core/src/engine/gwen-engine.ts`
  - `WasmModuleOptions.expectedVersion?`, `.versionPolicy?`, `.transformAccess?`
  - `loadWasmModule()`: version check + transform imports + pass exports to ring buffer
- `packages/core/src/wasm/shared-memory.ts`
  - Add `get transformBufferPtr(): number`
- `internals-docs/shared-array-buffer-memory-map.md`
  - Document V1 host function protocol, V2 migration path, versioning convention

### Tests
- `crates/gwen-wasm-utils/src/channel_tests.rs` — macro expansion + ptr correctness
- `packages/core/tests/wasm-ring-buffer.test.ts` — byteOffset auto-detection + fallback
- `packages/core/tests/wasm-module-handle.test.ts` — version check (error/warn/off)
- `packages/core/tests/transform-imports.test.ts` — buildTransformImports() returns correct values

---

## Non-Goals (future)

- V2 shared `WebAssembly.Memory` — separate RFC when COOP/COEP is established
- `BodyStateView` from RFC-07c
- Event pool recycling
- Multi-memory WASM proposal support
