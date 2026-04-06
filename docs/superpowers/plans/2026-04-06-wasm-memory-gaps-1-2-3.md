# WASM Plugin Memory Gaps 1–3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three architectural gaps in the RFC-008 community plugin memory system: corrupted ring-buffer placement (GAP 1), lack of cross-WASM transform buffer access (GAP 2), and missing layout versioning (GAP 3).

**Architecture:** GAP 1 introduces a `gwen_channel!()` Rust macro that pins the ring buffer to the data segment and exports its address, eliminating the `_byteOffset=0` corruption. GAP 2 passes transform-buffer metadata to community plugins via WASM host-function imports at instantiation time. GAP 3 adds an optional `gwen_plugin_api_version()` export convention with a configurable version gate in `loadWasmModule()`.

**Tech Stack:** Rust (wasm-bindgen 0.2, paste 1.0), TypeScript 5, Vitest, oxlint

**Spec:** `docs/superpowers/specs/2026-04-06-wasm-plugin-memory-gaps-design.md`

---

## File Map

### New files
| Path | Responsibility |
|---|---|
| `crates/gwen-wasm-utils/src/channel.rs` | `gwen_channel!()` macro + `__gwen_channel_inner!()` helper |
| `crates/gwen-wasm-utils/src/channel_tests.rs` | Rust unit tests for the macro |
| `packages/core/src/wasm/transform-imports.ts` | `buildTransformImports()` + `GwenTransformImports` interface |
| `packages/core/tests/wasm-ring-buffer.test.ts` | TS unit tests for `WasmRingBuffer` byteOffset auto-detection |
| `packages/core/tests/transform-imports.test.ts` | TS unit tests for `buildTransformImports()` |
| `packages/core/tests/wasm-version-check.test.ts` | TS unit tests for version policy in `loadWasmModule()` |
| `packages/core/bench/ring-buffer.bench.ts` | Benchmark: push/pop throughput (auto-detected vs explicit offset) |
| `docs/plugins/custom-wasm-plugin.md` | VitePress page: writing a community WASM plugin |

### Modified files
| Path | Change |
|---|---|
| `crates/gwen-wasm-utils/Cargo.toml` | Add `paste = "1"` dependency |
| `crates/gwen-wasm-utils/src/lib.rs` | Expose `pub mod channel` + `#[cfg(test)] mod channel_tests` |
| `packages/core/src/engine/wasm-module-handle.ts` | `WasmChannelOptions.byteOffset?`; `WasmRingBuffer` constructor + `exports?` auto-detect |
| `packages/core/src/engine/gwen-engine.ts` | `WasmModuleOptions.expectedVersion?`, `.versionPolicy?`, `.transformAccess?`; update `loadWasmModule()` |
| `packages/core/src/wasm/shared-memory.ts` | Add `get transformBufferPtr(): number` |
| `internals-docs/shared-array-buffer-memory-map.md` | Document V1 import protocol, versioning convention, V2 migration path |
| `docs/plugins/index.md` | Add link to `custom-wasm-plugin.md` |

---

## Task 1: GAP 1 — Rust `gwen_channel!()` macro

**Files:**
- Create: `crates/gwen-wasm-utils/src/channel.rs`
- Create: `crates/gwen-wasm-utils/src/channel_tests.rs`
- Modify: `crates/gwen-wasm-utils/Cargo.toml`
- Modify: `crates/gwen-wasm-utils/src/lib.rs`

- [ ] **Step 1.1: Add `paste` dependency**

In `crates/gwen-wasm-utils/Cargo.toml`, add under `[dependencies]`:

```toml
paste = "1"
```

- [ ] **Step 1.2: Write the failing test first**

Create `crates/gwen-wasm-utils/src/channel_tests.rs`:

```rust
//! Tests for the `gwen_channel!()` macro.

#[cfg(test)]
mod tests {
    /// Verify that the generated static buffer has the correct size.
    ///
    /// `gwen_channel!(ping, 4, 8)` should produce a buffer of
    /// `HEADER_BYTES (8) + capacity (4) * item_size (8) = 40` bytes.
    #[test]
    fn static_buffer_size_equals_header_plus_slots() {
        use crate::ring::HEADER_BYTES;
        gwen_channel!(ping, 4, 8);
        let expected = HEADER_BYTES + 4 * 8;
        let actual = unsafe { GWEN_CHANNEL_PING.len() };
        assert_eq!(actual, expected, "buffer must be HEADER_BYTES + capacity * item_size");
    }

    /// Verify that the ptr export returns a non-zero address.
    ///
    /// A non-zero address means the buffer lives in the data segment,
    /// not at offset 0 (which is the WASM shadow stack).
    #[test]
    fn ring_ptr_is_nonzero() {
        gwen_channel!(events, 16, 12);
        let ptr = gwen_events_ring_ptr();
        assert_ne!(ptr, 0, "ptr must point into the data segment, never address 0");
    }

    /// Verify cap and item_size exports match the macro arguments.
    #[test]
    fn ring_cap_and_item_size_match_macro_args() {
        gwen_channel!(cmds, 32, 20);
        assert_eq!(gwen_cmds_ring_cap(), 32);
        assert_eq!(gwen_cmds_ring_item_size(), 20);
    }

    /// Verify that `version = N` generates `gwen_plugin_api_version()`.
    #[test]
    fn version_export_is_generated_when_requested() {
        gwen_channel!(versioned, 8, 4, version = 1_000_002);
        assert_eq!(gwen_plugin_api_version(), 1_000_002);
    }

    /// Verify that two channels with different names do not alias each other.
    ///
    /// They must have distinct non-overlapping memory addresses.
    #[test]
    fn two_channels_have_distinct_addresses() {
        gwen_channel!(alpha, 4, 8);
        gwen_channel!(beta, 4, 8);
        let a = gwen_alpha_ring_ptr() as usize;
        let b = gwen_beta_ring_ptr() as usize;
        assert_ne!(a, b, "two channels must not share the same address");
    }
}
```

- [ ] **Step 1.3: Run the tests to verify they fail**

```bash
cd /path/to/gwen
cargo test -p gwen-wasm-utils 2>&1 | head -30
```

Expected: compile error because `gwen_channel!()` is not defined yet.

- [ ] **Step 1.4: Create `channel.rs`**

```rust
//! `gwen_channel!()` — declare a named ring-buffer channel backed by a static
//! buffer in the WASM data segment.
//!
//! ## Why a static buffer?
//!
//! WASM linear memory layout:
//! ```text
//! 0x0000 .. ~0xFFFF  shadow stack (grows down, managed by wasm-bindgen)
//! ~0x10000 ..         data segment  ← static [u8; N] lives here
//! after data segment  heap          (Box, Vec, managed by allocator)
//! ```
//!
//! A `static mut [u8; N]` lives at a fixed address that is **never** touched
//! by the allocator. Its address is a compile-time constant that we export
//! with `#[no_mangle]` so the TypeScript engine can read it before any Rust
//! code runs.
//!
//! This is in contrast to `Vec::new()` or `Box::new()`, whose addresses come
//! from the heap allocator and are not known until runtime.
//!
//! ## Usage
//!
//! ```rust
//! use gwen_wasm_utils::gwen_channel;
//!
//! // Declare a channel named "commands" with capacity 256 and 12 bytes/item.
//! gwen_channel!(commands, 256, 12);
//!
//! // Optionally export the plugin API version at the same time:
//! gwen_channel!(events, 128, 16, version = 1_000_000);
//! ```
//!
//! ## Generated symbols (example: `gwen_channel!(commands, 256, 12)`)
//!
//! | Symbol | Type | Description |
//! |---|---|---|
//! | `GWEN_CHANNEL_COMMANDS` | `static mut [u8; 8 + 256 * 12]` | Backing store |
//! | `gwen_commands_ring_ptr()` | `extern "C" fn() -> i32` | Byte offset in WASM linear memory |
//! | `gwen_commands_ring_cap()` | `extern "C" fn() -> i32` | Capacity (number of slots) |
//! | `gwen_commands_ring_item_size()` | `extern "C" fn() -> i32` | Bytes per item |
//!
//! When `version = N` is provided, `gwen_plugin_api_version() -> i32` is also exported.
//! Version encoding: `major * 1_000_000 + minor * 1_000 + patch`.

/// Internal helper — do not call directly.
///
/// Expands to the static buffer declaration and the three ptr/cap/item_size
/// exports. Separated from the public macro so that the `version` variant
/// can add `gwen_plugin_api_version()` without duplicating the inner code.
#[doc(hidden)]
#[macro_export]
macro_rules! __gwen_channel_inner {
    ($name:ident, $capacity:expr, $item_size:expr) => {
        ::paste::paste! {
            /// Backing store for the ring-buffer channel.
            ///
            /// Lives in the WASM data segment. Size = `HEADER_BYTES + capacity * item_size`.
            /// Never accessed directly — use [`gwen_wasm_utils::ring::RingWriter`] instead.
            #[allow(non_upper_case_globals)]
            static mut [<GWEN_CHANNEL_ $name:upper>]: [u8;
                $crate::ring::HEADER_BYTES + $capacity * $item_size] =
                [0u8; $crate::ring::HEADER_BYTES + $capacity * $item_size];

            /// Returns the byte offset of this ring buffer in WASM linear memory.
            ///
            /// The GWEN TypeScript engine calls this function immediately after
            /// instantiation to determine where to place the `WasmRingBuffer`.
            /// The value is a stable compile-time address in the data segment.
            #[no_mangle]
            pub extern "C" fn [<gwen_ $name _ring_ptr>]() -> i32 {
                // SAFETY: We only take the address — we never dereference it here.
                // The static is initialised to zero bytes and written exclusively
                // through `RingWriter`, which bounds-checks every write.
                unsafe { [<GWEN_CHANNEL_ $name:upper>].as_ptr() as i32 }
            }

            /// Returns the capacity (number of item slots) of this ring buffer.
            #[no_mangle]
            pub extern "C" fn [<gwen_ $name _ring_cap>]() -> i32 {
                $capacity as i32
            }

            /// Returns the byte size of one item in this ring buffer.
            #[no_mangle]
            pub extern "C" fn [<gwen_ $name _ring_item_size>]() -> i32 {
                $item_size as i32
            }
        }
    };
}

/// Declare a named ring-buffer channel backed by a static buffer.
///
/// See the [module documentation](`crate::channel`) for a full description of
/// the generated symbols and the WASM memory layout rationale.
///
/// # Arguments
///
/// - `$name` — Channel identifier (snake_case Rust ident).
/// - `$capacity` — Maximum number of items the ring buffer can hold.
/// - `$item_size` — Byte size of one item. Must be a multiple of 4.
/// - `version = N` — *(optional)* Also export `gwen_plugin_api_version() → i32`
///   with value `N`. Encode as `major * 1_000_000 + minor * 1_000 + patch`.
///
/// # Example
///
/// ```rust
/// use gwen_wasm_utils::gwen_channel;
///
/// gwen_channel!(commands, 256, 12);
/// gwen_channel!(events, 128, 16, version = 1_000_000);
/// ```
#[macro_export]
macro_rules! gwen_channel {
    ($name:ident, $capacity:expr, $item_size:expr) => {
        $crate::__gwen_channel_inner!($name, $capacity, $item_size);
    };
    ($name:ident, $capacity:expr, $item_size:expr, version = $version:expr) => {
        $crate::__gwen_channel_inner!($name, $capacity, $item_size);

        /// Returns the API version of this WASM plugin.
        ///
        /// Read by the GWEN engine immediately after `WebAssembly.instantiate()`.
        /// Version encoding: `major * 1_000_000 + minor * 1_000 + patch`.
        ///
        /// Example: version 1.2.3 → `1_002_003`.
        #[no_mangle]
        pub extern "C" fn gwen_plugin_api_version() -> i32 {
            $version
        }
    };
}
```

- [ ] **Step 1.5: Expose `channel` module in `lib.rs`**

Replace the content of `crates/gwen-wasm-utils/src/lib.rs` with:

```rust
//! Shared utilities for GWEN WASM plugins.
//!
//! # Modules
//! - `buffer`  — Read/write helpers for `js_sys::Uint8Array` (little-endian).
//! - `channel` — `gwen_channel!()` macro for declaring ring-buffer channels.
//! - `debug`   — Sentinel canary helpers for buffer overrun detection.
//! - `ring`    — Ring-buffer writer for the GWEN binary event protocol.

pub mod buffer;
pub mod channel;
pub mod debug;
pub mod ring;

#[cfg(test)]
mod buffer_tests;

#[cfg(test)]
mod channel_tests;

#[cfg(test)]
mod ring_tests;
```

- [ ] **Step 1.6: Run the tests to verify they pass**

```bash
cargo test -p gwen-wasm-utils 2>&1
```

Expected output (all passing):
```
test tests::static_buffer_size_equals_header_plus_slots ... ok
test tests::ring_ptr_is_nonzero ... ok
test tests::ring_cap_and_item_size_match_macro_args ... ok
test tests::version_export_is_generated_when_requested ... ok
test tests::two_channels_have_distinct_addresses ... ok
test result: ok. 5 passed; 0 failed
```

- [ ] **Step 1.7: Commit**

```bash
git add crates/gwen-wasm-utils/
git commit -m "feat(wasm-utils): add gwen_channel!() macro for safe ring buffer placement

GAP 1: pins ring buffers to the WASM data segment via static mut [u8; N].
Exports gwen_{name}_ring_ptr/cap/item_size for TypeScript auto-detection.
Optional version = N argument exports gwen_plugin_api_version().

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: GAP 1 — TypeScript `WasmRingBuffer` auto-detection

**Files:**
- Modify: `packages/core/src/engine/wasm-module-handle.ts`
- Modify: `packages/core/src/engine/gwen-engine.ts`
- Create: `packages/core/tests/wasm-ring-buffer.test.ts`
- Create: `packages/core/bench/ring-buffer.bench.ts`

- [ ] **Step 2.1: Write the failing tests**

Create `packages/core/tests/wasm-ring-buffer.test.ts`:

```typescript
/**
 * WasmRingBuffer — byteOffset auto-detection tests
 *
 * Tests cover:
 *   - Auto-detection: reads byteOffset from gwen_{name}_ring_ptr() export
 *   - Explicit override: WasmChannelOptions.byteOffset takes precedence over export
 *   - Fallback: uses 65 536 when no export and no explicit byteOffset
 *   - Push writes to the correct offset in linear memory
 *   - Pop reads from the correct offset in linear memory
 */

import { describe, it, expect } from 'vitest';
import { WasmRingBuffer } from '../src/engine/wasm-module-handle';
import type { WasmChannelOptions } from '../src/engine/wasm-module-handle';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a fake WebAssembly.Memory with a real in-process ArrayBuffer.
 * Large enough (2 MiB) to hold buffers at any offset we test with.
 */
function makeFakeMemory(sizeBytes = 2 * 1024 * 1024): WebAssembly.Memory {
  const buf = new ArrayBuffer(sizeBytes);
  return { buffer: buf, grow: () => { throw new Error('grow not supported'); } } as unknown as WebAssembly.Memory;
}

/**
 * Build fake exports that simulate the gwen_channel!() macro output.
 * Returns an exports object where `gwen_${name}_ring_ptr()` returns `ptr`.
 */
function makeFakeExports(name: string, ptr: number): WebAssembly.Exports {
  return {
    [`gwen_${name}_ring_ptr`]: () => ptr,
    [`gwen_${name}_ring_cap`]: () => 16,
    [`gwen_${name}_ring_item_size`]: () => 8,
  };
}

const ITEM_SIZE = 8;
const CAPACITY = 16;

function makeOpts(name = 'events'): WasmChannelOptions {
  return { name, direction: 'wasm→ts', capacity: CAPACITY, itemByteSize: ITEM_SIZE };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WasmRingBuffer — byteOffset resolution', () => {
  it('uses gwen_{name}_ring_ptr() export when present', () => {
    const memory = makeFakeMemory();
    const DATA_OFFSET = 131_072; // 128 KiB — a realistic data segment address
    const exports = makeFakeExports('events', DATA_OFFSET);
    const buf = new WasmRingBuffer(memory, makeOpts('events'), exports);

    // Push one item and verify the write lands at DATA_OFFSET + HEADER (8)
    const item = new Uint8Array(ITEM_SIZE).fill(0xAB);
    expect(buf.push(item)).toBe(true);

    // slot 0 starts at DATA_OFFSET + HEADER_BYTES (8)
    const view = new Uint8Array(memory.buffer, DATA_OFFSET + 8, ITEM_SIZE);
    expect(view[0]).toBe(0xAB);
  });

  it('uses options.byteOffset when provided (explicit override)', () => {
    const memory = makeFakeMemory();
    const EXPLICIT_OFFSET = 200_000;
    // Even if the export points to a different address, explicit wins
    const exports = makeFakeExports('cmds', 999_999);
    const opts: WasmChannelOptions = { ...makeOpts('cmds'), byteOffset: EXPLICIT_OFFSET };
    const buf = new WasmRingBuffer(memory, opts, exports);

    const item = new Uint8Array(ITEM_SIZE).fill(0xCD);
    expect(buf.push(item)).toBe(true);

    const view = new Uint8Array(memory.buffer, EXPLICIT_OFFSET + 8, ITEM_SIZE);
    expect(view[0]).toBe(0xCD);
  });

  it('falls back to 65 536 when no export and no explicit byteOffset', () => {
    const memory = makeFakeMemory();
    const FALLBACK = 65_536;
    const buf = new WasmRingBuffer(memory, makeOpts('fallback')); // no exports

    const item = new Uint8Array(ITEM_SIZE).fill(0xEF);
    expect(buf.push(item)).toBe(true);

    const view = new Uint8Array(memory.buffer, FALLBACK + 8, ITEM_SIZE);
    expect(view[0]).toBe(0xEF);
  });

  it('explicit byteOffset overrides fallback when no export present', () => {
    const memory = makeFakeMemory();
    const EXPLICIT = 300_000;
    const opts: WasmChannelOptions = { ...makeOpts('manual'), byteOffset: EXPLICIT };
    const buf = new WasmRingBuffer(memory, opts); // no exports

    const item = new Uint8Array(ITEM_SIZE).fill(0x12);
    expect(buf.push(item)).toBe(true);

    const view = new Uint8Array(memory.buffer, EXPLICIT + 8, ITEM_SIZE);
    expect(view[0]).toBe(0x12);
  });

  it('pop reads from the same detected offset', () => {
    const memory = makeFakeMemory();
    const DATA_OFFSET = 150_000;
    const exports = makeFakeExports('roundtrip', DATA_OFFSET);
    const buf = new WasmRingBuffer(memory, makeOpts('roundtrip'), exports);

    const pushed = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    buf.push(pushed);

    const dest = new Uint8Array(ITEM_SIZE);
    expect(buf.pop(dest)).toBe(true);
    expect(Array.from(dest)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
```

- [ ] **Step 2.2: Run tests to verify they fail**

```bash
cd packages/core && pnpm exec vitest run tests/wasm-ring-buffer.test.ts 2>&1 | tail -15
```

Expected: FAIL — `WasmRingBuffer` constructor does not accept a third argument yet.

- [ ] **Step 2.3: Update `WasmChannelOptions` and `WasmRingBuffer` in `wasm-module-handle.ts`**

**Edit 1** — Add `byteOffset?` to `WasmChannelOptions`. Replace:

```typescript
export interface WasmChannelOptions {
  /** Stable name used to access the channel: `handle.channel('commands')`. */
  name: string;
  /** Data flow direction. */
  direction: 'ts→wasm' | 'wasm→ts';
  /** Maximum number of items in the ring buffer. */
  capacity: number;
  /** Size of one item in bytes. Must be a multiple of 4. */
  itemByteSize: number;
}
```

With:

```typescript
export interface WasmChannelOptions {
  /** Stable name used to access the channel: `handle.channel('commands')`. */
  name: string;
  /** Data flow direction. */
  direction: 'ts→wasm' | 'wasm→ts';
  /** Maximum number of items in the ring buffer. */
  capacity: number;
  /** Size of one item in bytes. Must be a multiple of 4. */
  itemByteSize: number;
  /**
   * Explicit byte offset into WASM linear memory for the ring buffer backing store.
   *
   * When set, this always overrides auto-detection via `gwen_{name}_ring_ptr()`.
   * Only needed for modules that do NOT use the `gwen_channel!()` macro and need
   * manual placement control.
   *
   * When absent and no `gwen_{name}_ring_ptr` export is found, defaults to
   * `65 536` (first 64 KiB page boundary — safely past the shadow stack).
   */
  byteOffset?: number;
}
```

**Edit 2** — Update the `WasmRingBuffer` constructor. Replace:

```typescript
  constructor(memory: WebAssembly.Memory, opts: WasmChannelOptions) {
    this._memory = memory;
    // Ring buffer data starts at offset 0 in the module's memory by convention.
    // Modules that expose a named channel base export may override this.
    this._byteOffset = 0;
    this._capacity = opts.capacity;
    this._itemByteSize = opts.itemByteSize;
  }
```

With:

```typescript
  /**
   * Create a ring buffer backed by WASM linear memory.
   *
   * ## Byte offset resolution (in priority order)
   *
   * 1. `opts.byteOffset` — explicit override, always wins when set.
   * 2. `exports.gwen_{name}_ring_ptr()` — auto-detection from the
   *    `gwen_channel!()` Rust macro. Returns the address of the static
   *    buffer in the WASM data segment.
   * 3. Fallback: `65 536` (first page boundary, safely past the shadow stack).
   *
   * @param memory  WASM linear memory from `instance.exports.memory`.
   * @param opts    Channel configuration.
   * @param exports Optional WASM exports object used for auto-detection.
   */
  constructor(
    memory: WebAssembly.Memory,
    opts: WasmChannelOptions,
    exports?: WebAssembly.Exports,
  ) {
    this._memory = memory;
    this._capacity = opts.capacity;
    this._itemByteSize = opts.itemByteSize;

    if (opts.byteOffset !== undefined) {
      // Explicit override — highest priority.
      this._byteOffset = opts.byteOffset;
    } else {
      // Auto-detect via the gwen_channel!() macro's ptr export.
      const ptrExport = exports?.[`gwen_${opts.name}_ring_ptr`];
      if (typeof ptrExport === 'function') {
        this._byteOffset = (ptrExport as () => number)();
      } else {
        // Fallback: first 64 KiB page boundary (past the WASM shadow stack).
        this._byteOffset = 65_536;
      }
    }
  }
```

- [ ] **Step 2.4: Run the tests to verify they pass**

```bash
cd packages/core && pnpm exec vitest run tests/wasm-ring-buffer.test.ts 2>&1
```

Expected: all 5 tests PASS.

- [ ] **Step 2.5: Update `loadWasmModule()` to pass exports to ring buffer**

In `packages/core/src/engine/gwen-engine.ts`, find the channel map construction and update it:

```typescript
// old
const channelMap = new Map(
  (options.channels ?? []).map((c) => [
    c.name,
    new WasmRingBuffer(memory ?? new WebAssembly.Memory({ initial: 1 }), c),
  ]),
);
```

```typescript
// new
const channelMap = new Map(
  (options.channels ?? []).map((c) => [
    c.name,
    new WasmRingBuffer(
      memory ?? new WebAssembly.Memory({ initial: 1 }),
      c,
      instance.exports,  // enables gwen_{name}_ring_ptr() auto-detection
    ),
  ]),
);
```

- [ ] **Step 2.6: Create the ring-buffer benchmark**

Create `packages/core/bench/ring-buffer.bench.ts`:

```typescript
/**
 * Benchmark: WasmRingBuffer push/pop throughput
 *
 * Compares three byteOffset configurations:
 *   A) auto-detected via fake gwen_{name}_ring_ptr() export (data segment pattern)
 *   B) explicit byteOffset supplied in options
 *   C) fallback (no export, no explicit — uses 65 536)
 *
 * All three should have identical throughput since the offset is resolved
 * once in the constructor. This benchmark verifies that and catches any
 * accidental per-call overhead.
 *
 * Run:
 *   pnpm --filter @gwenjs/core exec vitest bench --run bench/ring-buffer.bench.ts
 */

import { bench, describe } from 'vitest';
import { WasmRingBuffer } from '../src/engine/wasm-module-handle';
import type { WasmChannelOptions } from '../src/engine/wasm-module-handle';

const ITEM_SIZE = 16;
const CAPACITY = 256;
const MEM_SIZE = 4 * 1024 * 1024; // 4 MiB

function makeFakeMemory(): WebAssembly.Memory {
  const buf = new ArrayBuffer(MEM_SIZE);
  return { buffer: buf, grow: () => 0 } as unknown as WebAssembly.Memory;
}

function makeOpts(name: string): WasmChannelOptions {
  return { name, direction: 'ts→wasm', capacity: CAPACITY, itemByteSize: ITEM_SIZE };
}

const item = new Uint8Array(ITEM_SIZE).fill(0x42);
const dest = new Uint8Array(ITEM_SIZE);

describe('WasmRingBuffer push/pop throughput (1000 items)', () => {
  bench('auto-detected byteOffset (gwen_ring_ptr export)', () => {
    const mem = makeFakeMemory();
    const DATA_OFFSET = 131_072;
    const exports = { gwen_bench_auto_ring_ptr: () => DATA_OFFSET } as unknown as WebAssembly.Exports;
    const buf = new WasmRingBuffer(mem, makeOpts('bench_auto'), exports);
    for (let i = 0; i < 1000; i++) {
      buf.push(item);
      buf.pop(dest);
    }
  });

  bench('explicit byteOffset in options', () => {
    const mem = makeFakeMemory();
    const opts: WasmChannelOptions = { ...makeOpts('bench_explicit'), byteOffset: 131_072 };
    const buf = new WasmRingBuffer(mem, opts);
    for (let i = 0; i < 1000; i++) {
      buf.push(item);
      buf.pop(dest);
    }
  });

  bench('fallback byteOffset (65 536)', () => {
    const mem = makeFakeMemory();
    const buf = new WasmRingBuffer(mem, makeOpts('bench_fallback'));
    for (let i = 0; i < 1000; i++) {
      buf.push(item);
      buf.pop(dest);
    }
  });
});
```

- [ ] **Step 2.7: Run full test suite to confirm no regressions**

```bash
cd packages/core && pnpm test 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 2.8: Commit**

```bash
git add packages/core/src/engine/wasm-module-handle.ts \
        packages/core/src/engine/gwen-engine.ts \
        packages/core/tests/wasm-ring-buffer.test.ts \
        packages/core/bench/ring-buffer.bench.ts
git commit -m "feat(core): WasmRingBuffer auto-detects byteOffset via gwen_ring_ptr export

GAP 1 TypeScript side: constructor accepts optional exports object and
reads gwen_{name}_ring_ptr() if present. Falls back to opts.byteOffset
or 65536. Eliminates byteOffset=0 shadow-stack corruption.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: GAP 2 — Transform buffer host-function imports

**Files:**
- Modify: `packages/core/src/wasm/shared-memory.ts`
- Create: `packages/core/src/wasm/transform-imports.ts`
- Modify: `packages/core/src/engine/gwen-engine.ts`
- Create: `packages/core/tests/transform-imports.test.ts`

- [ ] **Step 3.1: Write the failing tests**

Create `packages/core/tests/transform-imports.test.ts`:

```typescript
/**
 * buildTransformImports() tests
 *
 * Tests cover:
 *   - Returns correct transform_buffer_ptr from sharedMemory.transformBufferPtr
 *   - Returns correct transform_stride constant (32 for 2D)
 *   - Returns correct max_entities value
 */

import { describe, it, expect } from 'vitest';
import { buildTransformImports } from '../src/wasm/transform-imports';
import { TRANSFORM_STRIDE } from '../src/wasm/shared-memory';
import type { SharedMemoryManager } from '../src/wasm/shared-memory';

/** Build a minimal mock SharedMemoryManager with a known transformBufferPtr. */
function makeMockSharedMemory(ptr: number): Pick<SharedMemoryManager, 'transformBufferPtr'> {
  return { transformBufferPtr: ptr } as unknown as SharedMemoryManager;
}

describe('buildTransformImports()', () => {
  it('transform_buffer_ptr() returns the sharedMemory.transformBufferPtr value', () => {
    const imports = buildTransformImports(
      makeMockSharedMemory(0x20000) as SharedMemoryManager,
      5_000,
    );
    expect(imports.transform_buffer_ptr()).toBe(0x20000);
  });

  it('transform_stride() returns TRANSFORM_STRIDE (32)', () => {
    const imports = buildTransformImports(
      makeMockSharedMemory(1024) as SharedMemoryManager,
      1_000,
    );
    expect(imports.transform_stride()).toBe(TRANSFORM_STRIDE);
  });

  it('max_entities() returns the value passed as second argument', () => {
    const imports = buildTransformImports(
      makeMockSharedMemory(1024) as SharedMemoryManager,
      12_345,
    );
    expect(imports.max_entities()).toBe(12_345);
  });
});
```

- [ ] **Step 3.2: Run tests to verify they fail**

```bash
cd packages/core && pnpm exec vitest run tests/transform-imports.test.ts 2>&1 | tail -10
```

Expected: FAIL — `transform-imports` module does not exist yet.

- [ ] **Step 3.3: Add `transformBufferPtr` getter to `SharedMemoryManager`**

In `packages/core/src/wasm/shared-memory.ts`, after the `get capacityBytes()` getter, add:

```typescript
/**
 * Raw byte offset of the shared transform buffer in gwen-core's WASM linear memory.
 *
 * Community WASM plugins that declare:
 * ```rust
 * extern "C" { fn gwen_transform_buffer_ptr() -> i32; }
 * ```
 * receive this value via the WASM host import `gwen.transform_buffer_ptr`.
 *
 * They use it to compute entity slot addresses:
 * ```rust
 * let slot_ptr = gwen_transform_buffer_ptr() as usize
 *     + entity_index * gwen_transform_stride() as usize;
 * ```
 *
 * **Important:** This is an offset into gwen-core's linear memory, not a JS
 * heap address. Community plugins cannot directly dereference it — they must
 * use V1 host functions or wait for V2 shared `WebAssembly.Memory`.
 */
get transformBufferPtr(): number {
  return this.basePtr;
}
```

- [ ] **Step 3.4: Create `transform-imports.ts`**

Create `packages/core/src/wasm/transform-imports.ts`:

```typescript
/**
 * @file GAP 2 — Transform buffer host-function imports for community WASM plugins.
 *
 * Community plugins (separate `.wasm` modules) cannot directly access gwen-core's
 * linear memory. This module provides the V1 solution: JavaScript functions
 * injected into the plugin's WASM import object at instantiation time.
 *
 * ## V1 — Host function imports (this file)
 *
 * Three constants are exposed as zero-argument functions so that Rust plugins
 * can call them once during `init()` and cache the values:
 *
 * | Import name | Rust declaration | Description |
 * |---|---|---|
 * | `gwen_transform_buffer_ptr` | `fn gwen_transform_buffer_ptr() -> i32` | Byte offset of the transform buffer in gwen-core's linear memory |
 * | `gwen_transform_stride` | `fn gwen_transform_stride() -> i32` | Bytes per entity slot (32 for 2D) |
 * | `gwen_max_entities` | `fn gwen_max_entities() -> i32` | Maximum entity count |
 *
 * ### Rust usage
 *
 * ```rust
 * extern "C" {
 *     fn gwen_transform_buffer_ptr() -> i32;
 *     fn gwen_transform_stride() -> i32;
 *     fn gwen_max_entities() -> i32;
 * }
 *
 * static mut TRANSFORM_PTR: i32 = 0;
 * static mut STRIDE: i32 = 0;
 *
 * #[no_mangle]
 * pub extern "C" fn init() {
 *     unsafe {
 *         TRANSFORM_PTR = gwen_transform_buffer_ptr();
 *         STRIDE = gwen_transform_stride();
 *     }
 * }
 * ```
 *
 * ## V2 — Shared WebAssembly.Memory (future)
 *
 * When the deployment environment provides `COOP` / `COEP` HTTP headers, a
 * future upgrade will replace host functions with a shared
 * `WebAssembly.Memory({ shared: true })`. The `GwenTransformImports` interface
 * will remain unchanged — only the `buildTransformImports()` implementation changes.
 */

import type { SharedMemoryManager } from './shared-memory';
import { TRANSFORM_STRIDE } from './shared-memory';

// ─── Public interface ─────────────────────────────────────────────────────────

/**
 * WASM host functions injected into community plugin import objects.
 *
 * Place these under the `"gwen"` namespace:
 * ```typescript
 * await WebAssembly.instantiate(bytes, { gwen: buildTransformImports(mem, n) });
 * ```
 */
export interface GwenTransformImports {
  /**
   * Returns the byte offset of the shared transform buffer in gwen-core's
   * linear memory. Community plugins must call this once at `init()` and
   * cache the result.
   */
  transform_buffer_ptr: () => number;
  /** Returns the byte stride per entity slot (32 for 2D, 48 for 3D). */
  transform_stride: () => number;
  /** Returns the maximum number of entity slots. */
  max_entities: () => number;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Build the `gwen` import namespace for a community WASM plugin.
 *
 * Pass the result directly to `WebAssembly.instantiate()`:
 *
 * ```typescript
 * const { instance } = await WebAssembly.instantiate(bytes, {
 *   gwen: buildTransformImports(engine.sharedMemory, maxEntities),
 * });
 * ```
 *
 * @param sharedMemory  The engine's active `SharedMemoryManager`.
 * @param maxEntities   Maximum entity count configured in the engine.
 * @returns             A plain object of zero-argument functions suitable as WASM imports.
 */
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

- [ ] **Step 3.5: Run transform-imports tests to verify they pass**

```bash
cd packages/core && pnpm exec vitest run tests/transform-imports.test.ts 2>&1
```

Expected: all 3 tests PASS.

- [ ] **Step 3.6: Wire `buildTransformImports()` into `loadWasmModule()`**

In `packages/core/src/engine/gwen-engine.ts`:

**Edit 1** — Add the import alongside other wasm imports at the top of the file:

```typescript
import { buildTransformImports } from '../wasm/transform-imports.js';
```

**Edit 2** — Add `transformAccess?` to the `WasmModuleOptions` interface (after `channels?`):

```typescript
/**
 * When `true`, injects three host functions under the `gwen` WASM import namespace:
 * - `gwen_transform_buffer_ptr() -> i32` — byte offset of the shared transform buffer
 * - `gwen_transform_stride() -> i32` — bytes per entity slot (32)
 * - `gwen_max_entities() -> i32` — maximum entity count
 *
 * The Rust plugin declares these as:
 * ```rust
 * extern "C" {
 *     fn gwen_transform_buffer_ptr() -> i32;
 *     fn gwen_transform_stride() -> i32;
 *     fn gwen_max_entities() -> i32;
 * }
 * ```
 * and caches the results in `static mut` fields during `init()`.
 * @default false
 */
readonly transformAccess?: boolean;
```

**Edit 3** — Replace the instantiation line in `loadWasmModule()`:

```typescript
// old
const result = await WebAssembly.instantiate(buffer, {});
```

```typescript
// new
const gwenImports =
  options.transformAccess && this._sharedMemory
    ? buildTransformImports(this._sharedMemory, this._config.core?.maxEntities ?? 10_000)
    : {};

const result = await WebAssembly.instantiate(buffer, {
  gwen: gwenImports,
});
```

> **Note:** Check the actual field name for `sharedMemory` on the engine class. Search for `SharedMemoryManager.create(` in `gwen-engine.ts` to find where it is stored (e.g., `this._sharedMemory`). Search for `maxEntities` to confirm where the config value is accessed. Adjust the code above to match the actual field names.

- [ ] **Step 3.7: Run the full core test suite**

```bash
cd packages/core && pnpm test 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 3.8: Commit**

```bash
git add packages/core/src/wasm/shared-memory.ts \
        packages/core/src/wasm/transform-imports.ts \
        packages/core/src/engine/gwen-engine.ts \
        packages/core/tests/transform-imports.test.ts
git commit -m "feat(core): GAP 2 — transform buffer host-function imports for community plugins

Adds buildTransformImports() injecting gwen.transform_buffer_ptr,
gwen.transform_stride, gwen.max_entities into the WASM import object.
WasmModuleOptions.transformAccess?: boolean opt-in gate.
SharedMemoryManager.transformBufferPtr getter exposes the base ptr.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: GAP 3 — Plugin API version checking

**Files:**
- Modify: `packages/core/src/engine/gwen-engine.ts`
- Create: `packages/core/tests/wasm-version-check.test.ts`

- [ ] **Step 4.1: Write the failing tests**

Create `packages/core/tests/wasm-version-check.test.ts`:

```typescript
/**
 * loadWasmModule() version policy tests
 *
 * Tests cover:
 *   - No version check when expectedVersion is absent
 *   - Passes silently when version is within [min, max] range
 *   - Throws when version is below min and policy is 'error' (default)
 *   - Throws when version is above max and policy is 'error'
 *   - Warns (console.warn) when out of range and policy is 'warn'
 *   - Silently ignores when out of range and policy is 'off'
 *   - Passes when module does not export gwen_plugin_api_version (no version export)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkPluginApiVersion } from '../src/engine/gwen-engine';
import type { WasmModuleOptions } from '../src/engine/gwen-engine';

describe('checkPluginApiVersion()', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('is a no-op when expectedVersion is not set', () => {
    const opts = { name: 'plugin' } as WasmModuleOptions;
    expect(() =>
      checkPluginApiVersion('plugin', { gwen_plugin_api_version: () => 2_000_000 }, opts),
    ).not.toThrow();
  });

  it('passes when version is within [min, max]', () => {
    const opts = {
      name: 'plugin',
      expectedVersion: [1_000_000, 1_999_999],
    } as WasmModuleOptions;
    expect(() =>
      checkPluginApiVersion('plugin', { gwen_plugin_api_version: () => 1_002_003 }, opts),
    ).not.toThrow();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('throws by default (error policy) when version is below min', () => {
    const opts = {
      name: 'old-plugin',
      expectedVersion: [2_000_000, 2_999_999],
    } as WasmModuleOptions;
    expect(() =>
      checkPluginApiVersion('old-plugin', { gwen_plugin_api_version: () => 1_000_000 }, opts),
    ).toThrow(/old-plugin/);
  });

  it('throws by default (error policy) when version is above max', () => {
    const opts = {
      name: 'new-plugin',
      expectedVersion: [1_000_000, 1_999_999],
    } as WasmModuleOptions;
    expect(() =>
      checkPluginApiVersion('new-plugin', { gwen_plugin_api_version: () => 3_000_000 }, opts),
    ).toThrow(/new-plugin/);
  });

  it('warns and does not throw when policy is "warn"', () => {
    const opts = {
      name: 'warn-plugin',
      expectedVersion: [1_000_000, 1_999_999],
      versionPolicy: 'warn',
    } as WasmModuleOptions;
    expect(() =>
      checkPluginApiVersion('warn-plugin', { gwen_plugin_api_version: () => 3_000_000 }, opts),
    ).not.toThrow();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('warn-plugin'));
  });

  it('silently ignores version mismatch when policy is "off"', () => {
    const opts = {
      name: 'off-plugin',
      expectedVersion: [1_000_000, 1_999_999],
      versionPolicy: 'off',
    } as WasmModuleOptions;
    expect(() =>
      checkPluginApiVersion('off-plugin', { gwen_plugin_api_version: () => 9_000_000 }, opts),
    ).not.toThrow();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('skips the check when gwen_plugin_api_version is not exported', () => {
    const opts = {
      name: 'no-version',
      expectedVersion: [1_000_000, 1_999_999],
    } as WasmModuleOptions;
    expect(() =>
      checkPluginApiVersion('no-version', {}, opts),
    ).not.toThrow();
  });
});
```

- [ ] **Step 4.2: Run tests to verify they fail**

```bash
cd packages/core && pnpm exec vitest run tests/wasm-version-check.test.ts 2>&1 | tail -10
```

Expected: FAIL — `checkPluginApiVersion` is not exported from `gwen-engine.ts`.

- [ ] **Step 4.3: Add fields to `WasmModuleOptions` and extract `checkPluginApiVersion()`**

In `packages/core/src/engine/gwen-engine.ts`:

**Edit 1** — Add to the `WasmModuleOptions` interface, after `transformAccess?`:

```typescript
/**
 * Inclusive version range `[min, max]` accepted for this module.
 *
 * Version encoding: `major * 1_000_000 + minor * 1_000 + patch`.
 * Example: version 1.2.3 → `1_002_003`.
 *
 * If the module exports `gwen_plugin_api_version()`, its return value is
 * checked against this range at load time. When the version falls outside
 * the range, behaviour is controlled by `versionPolicy`.
 *
 * When the module does not export `gwen_plugin_api_version`, this field
 * is silently ignored.
 */
readonly expectedVersion?: [min: number, max: number];

/**
 * Action to take when the module version falls outside `expectedVersion`.
 *
 * - `'error'` *(default)* — throw an `Error`; module is not registered.
 * - `'warn'`  — emit `console.warn`; module loads anyway.
 * - `'off'`   — silently ignore; module loads unconditionally.
 *
 * @default 'error'
 */
readonly versionPolicy?: 'error' | 'warn' | 'off';
```

**Edit 2** — Add the exported helper **before** the `GwenEngine` class definition:

```typescript
/**
 * Check whether a WASM module's API version is compatible with the engine's expectation.
 *
 * Reads `gwen_plugin_api_version()` from `exports` if present, then compares
 * the returned value against `options.expectedVersion [min, max]`. Behaviour
 * on mismatch is governed by `options.versionPolicy` (default: `'error'`).
 *
 * This function is exported so it can be unit-tested independently of the
 * full `loadWasmModule()` flow. Call sites should use `loadWasmModule()`.
 *
 * @param name     Module name, used in error / warning messages.
 * @param exports  WASM exports from `instance.exports`.
 * @param options  Module options potentially containing `expectedVersion` / `versionPolicy`.
 */
export function checkPluginApiVersion(
  name: string,
  exports: WebAssembly.Exports,
  options: WasmModuleOptions,
): void {
  if (!options.expectedVersion) return;

  const versionFn = exports['gwen_plugin_api_version'];
  if (typeof versionFn !== 'function') return; // No version export — skip silently.

  const version = (versionFn as () => number)();
  const [min, max] = options.expectedVersion;

  if (version >= min && version <= max) return; // ✅ within range

  const msg =
    `[GWEN] Module "${name}" reports API version ${version}, ` +
    `expected range [${min}, ${max}].`;

  const policy = options.versionPolicy ?? 'error';
  if (policy === 'error') throw new Error(msg);
  if (policy === 'warn') console.warn(msg);
  // policy === 'off': silent
}
```

**Edit 3** — Call `checkPluginApiVersion()` in `loadWasmModule()`, immediately after `instance = result.instance;`:

```typescript
checkPluginApiVersion(options.name, instance.exports, options);
```

- [ ] **Step 4.4: Run version-check tests to verify they pass**

```bash
cd packages/core && pnpm exec vitest run tests/wasm-version-check.test.ts 2>&1
```

Expected: all 7 tests PASS.

- [ ] **Step 4.5: Run the full core test suite**

```bash
cd packages/core && pnpm test 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 4.6: Commit**

```bash
git add packages/core/src/engine/gwen-engine.ts \
        packages/core/tests/wasm-version-check.test.ts
git commit -m "feat(core): GAP 3 — plugin API version gate in loadWasmModule()

Adds expectedVersion?: [min, max] and versionPolicy?: 'error'|'warn'|'off'
to WasmModuleOptions. checkPluginApiVersion() extracted for unit testing.
Reads gwen_plugin_api_version() export if present; skips silently if absent.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Documentation

**Files:**
- Modify: `internals-docs/shared-array-buffer-memory-map.md`
- Create: `docs/plugins/custom-wasm-plugin.md`
- Modify: `docs/plugins/index.md`

- [ ] **Step 5.1: Update `internals-docs/shared-array-buffer-memory-map.md`**

Append the following section at the end of the file:

```markdown
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

**V1 fix (host function imports):** When `WasmModuleOptions.transformAccess: true`,
the engine injects three JavaScript functions into the WASM import object under
the `gwen` namespace:

| Import | Rust signature | Description |
|---|---|---|
| `gwen.transform_buffer_ptr` | `fn gwen_transform_buffer_ptr() -> i32` | Byte offset of transform buffer in gwen-core memory |
| `gwen.transform_stride` | `fn gwen_transform_stride() -> i32` | 32 (2D) |
| `gwen.max_entities` | `fn gwen_max_entities() -> i32` | Engine `maxEntities` |

Plugins call these once in `init()` and cache the values in `static mut` fields.

**V2 migration path (future):** When `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` headers are available, replace host
functions with `new WebAssembly.Memory({ shared: true })` passed to both gwen-core
and community plugins. Zero-copy, zero JS overhead.

---

### GAP 3 — Layout versioning

**Fix:** Community plugins export `gwen_plugin_api_version() -> i32`.
Use `gwen_channel!(name, cap, size, version = N)` to generate this automatically.

**Version encoding:** `major * 1_000_000 + minor * 1_000 + patch`.
Example: `1.2.3 → 1_002_003`.

**TypeScript gate:**
```typescript
await engine.loadWasmModule({
  name: 'my-plugin',
  url: '/my-plugin.wasm',
  expectedVersion: [1_000_000, 1_999_999], // accept 1.x.x
  versionPolicy: 'error',                  // default: throw if out of range
});
```
```

- [ ] **Step 5.2: Create `docs/plugins/custom-wasm-plugin.md`**

```markdown
# Writing a Custom WASM Plugin

This guide explains how to write a community WASM plugin for GWEN using Rust
and the `gwen-wasm-utils` crate. Custom plugins integrate with the engine's
`loadWasmModule()` API (RFC-008).

## Prerequisites

- Rust toolchain with the `wasm32-unknown-unknown` target:
  ```bash
  rustup target add wasm32-unknown-unknown
  ```
- `wasm-pack` for building:
  ```bash
  cargo install wasm-pack
  ```

## Project Setup

```bash
cargo new --lib my-gwen-plugin
```

`Cargo.toml`:
```toml
[package]
name = "my-gwen-plugin"
version = "1.0.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
gwen-wasm-utils = "0.1"   # provides gwen_channel!, RingWriter, HEADER_BYTES
```

## Declaring a Channel

Use the `gwen_channel!()` macro to declare a ring-buffer channel. This places
the buffer in the WASM **data segment** (not the heap), so the engine can
locate it before any Rust code runs.

```rust
// src/lib.rs
use gwen_wasm_utils::gwen_channel;

// Channel: capacity 128, 16 bytes per event, plugin version 1.0.0
gwen_channel!(physics_events, 128, 16, version = 1_000_000);
```

Generated exports:
- `gwen_physics_events_ring_ptr() -> i32` — buffer address (auto-detected by engine)
- `gwen_physics_events_ring_cap() -> i32` — capacity
- `gwen_physics_events_ring_item_size() -> i32` — item size
- `gwen_plugin_api_version() -> i32` — returns `1_000_000`

## Accessing the Transform Buffer (optional)

If your plugin reads entity transform data, enable `transformAccess` on the
TypeScript side and declare the host imports in Rust:

```rust
extern "C" {
    fn gwen_transform_buffer_ptr() -> i32;
    fn gwen_transform_stride() -> i32;
    fn gwen_max_entities() -> i32;
}

static mut TRANSFORM_PTR: i32 = 0;
static mut STRIDE: i32 = 0;

#[no_mangle]
pub extern "C" fn init() {
    unsafe {
        TRANSFORM_PTR = gwen_transform_buffer_ptr();
        STRIDE = gwen_transform_stride();
    }
}
```

## Building

```bash
# Raw .wasm (no JS bindings needed for engine integration)
cargo build --target wasm32-unknown-unknown --release
# Output: target/wasm32-unknown-unknown/release/my_gwen_plugin.wasm
```

## Loading from TypeScript

```typescript
import { createEngine } from '@gwenjs/core';

const engine = await createEngine(config);

const handle = await engine.loadWasmModule({
  name: 'my-plugin',
  url: '/my_gwen_plugin.wasm',
  channels: [
    {
      name: 'physics_events',
      direction: 'wasm→ts',
      capacity: 128,
      itemByteSize: 16,
    },
  ],
  transformAccess: true,                       // inject gwen.transform_* imports
  expectedVersion: [1_000_000, 1_999_999],     // accept 1.x.x
  step(handle, dt) {
    const dest = new Uint8Array(16);
    while (handle.channel('physics_events').pop(dest)) {
      // process event bytes in dest
    }
  },
});
```

## Version Encoding

| Semantic version | Encoded value |
|---|---|
| `1.0.0` | `1_000_000` |
| `1.2.3` | `1_002_003` |
| `2.0.0` | `2_000_000` |

Pass `version = N` as the fourth argument to `gwen_channel!()`. The engine
checks it against `expectedVersion` before registering the plugin.
```

- [ ] **Step 5.3: Add link in `docs/plugins/index.md`**

After the "Official Plugins" table in `docs/plugins/index.md`, add:

```markdown
## Custom WASM Plugins

To extend GWEN with your own Rust WASM module, see the
[Custom WASM Plugin guide](/plugins/custom-wasm-plugin).
```

- [ ] **Step 5.4: Commit documentation**

```bash
git add internals-docs/shared-array-buffer-memory-map.md \
        docs/plugins/custom-wasm-plugin.md \
        docs/plugins/index.md
git commit -m "docs: WASM memory gaps fixed — internal map, custom plugin guide

Updates internals SAB memory map with fixed-gaps section (GAP 1/2/3).
Adds docs/plugins/custom-wasm-plugin.md: Rust+TS walkthrough.
Links it from docs/plugins/index.md.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: Final Verification

- [ ] **Step 6.1: Lint + typecheck + build for `packages/core`**

```bash
cd packages/core
pnpm run lint 2>&1 | tail -5
pnpm run typecheck 2>&1 | tail -5
pnpm run build 2>&1 | tail -5
```

Expected: 0 errors in all three commands.

- [ ] **Step 6.2: Full test suite for `packages/core`**

```bash
cd packages/core && pnpm test 2>&1 | tail -10
```

Expected: all tests pass, 0 failures.

- [ ] **Step 6.3: Run ring-buffer benchmark (informational)**

```bash
cd packages/core && pnpm bench -- bench/ring-buffer.bench.ts 2>&1 | grep -A4 "WasmRingBuffer"
```

Expected: A / B / C benchmarks show similar throughput (offset is resolved once at construction).

- [ ] **Step 6.4: Rust tests for `gwen-wasm-utils`**

```bash
cargo test -p gwen-wasm-utils 2>&1 | tail -10
```

Expected: all channel_tests (5) + existing buffer/ring tests pass.

- [ ] **Step 6.5: Verify no `as any` in new/modified files**

```bash
grep -rn "as any" \
  packages/core/src/wasm/transform-imports.ts \
  packages/core/src/engine/wasm-module-handle.ts \
  packages/core/src/wasm/shared-memory.ts \
  packages/core/src/engine/gwen-engine.ts
```

Expected: zero matches.

- [ ] **Step 6.6: Verify no remaining `_byteOffset = 0` in source**

```bash
grep -rn "_byteOffset = 0" packages/core/src/ crates/
```

Expected: zero matches (the bug is gone).

- [ ] **Step 6.7: Commit any post-lint fixes**

```bash
git status
# If dirty after lint auto-fix:
git add -A && git commit -m "chore(core): post-lint fixes for WASM memory gaps implementation

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```
