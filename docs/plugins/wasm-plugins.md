---
title: WASM Plugins — Guide & API Reference
description: How to build, register, and use Rust/WASM plugins in GWEN. Covers shared memory, lifecycle, TypeScript glue, and the physics2d reference implementation.
---

# Guide: Creating a WASM Plugin for GWEN

> **Audience:** developers who want to extend GWEN with a Rust/WASM module
> (physics, AI, networking, procedural generation…)
>
> **Prerequisites:** Rust stable + `wasm-pack` installed, basic knowledge of GWEN
>
> **See also:** [WASM Plugin Best Practices](./wasm-plugin-best-practices.md) —
> rules, pitfalls, and design decisions learned from building the first plugin.

---

## Table of contents

1. [Prerequisites](#1-prerequisites)
2. [Plugin architecture](#2-plugin-architecture)
3. [Shared memory layout](#3-shared-memory-layout)
4. [Sentinel guards — buffer overrun detection](#4-sentinel-guards--buffer-overrun-detection)
5. [Memory growth and buffer-detach](#5-memory-growth-and-buffer-detach)
6. [Parallel WASM fetch strategy](#6-parallel-wasm-fetch-strategy)
7. [Creating the Rust crate](#7-creating-the-rust-crate)
8. [Creating the TypeScript package](#8-creating-the-typescript-package)
9. [Declaring the plugin in `gwen.config.ts`](#9-declaring-the-plugin-in-gwenconfigts)
10. [COOP/COEP headers](#10-coopcoep-headers)
11. [Testing](#11-testing)
12. [Type reference](#12-type-reference)
13. [Reference implementation: `@gwen/plugin-physics2d`](#13-reference-implementation-gwenplugin-physics2d)

---

## 1. Prerequisites

```bash
# Rust stable toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# wasm-pack — compiles Rust crates to browser-compatible WASM modules
cargo install wasm-pack

# Verify
rustc --version    # 1.76+
wasm-pack --version
```

---

## 2. Plugin architecture

A GWEN WASM plugin consists of **two complementary parts**:

```
my-plugin/
  crates/gwen-plugin-my-plugin/   ← Rust crate (simulation logic)
    Cargo.toml
    src/
      lib.rs
      bindings.rs      ← wasm-bindgen exports
      world.rs         ← simulation state & step logic
      memory.rs        ← shared buffer read/write helpers
    tests/
      my_plugin_tests.rs

  packages/@gwen/plugin-my-plugin/  ← TypeScript package (glue layer)
    package.json
    src/
      types.ts         ← TypeScript interfaces
      index.ts         ← GwenWasmPlugin + factory helper
    wasm/
      .gitignore       ← compiled artefacts excluded from git
    tests/
      my_plugin.test.ts
```

### Per-frame data flow

```
┌──────────────────────────────────────────────────────────────┐
│                       Engine._tick()                         │
│                                                              │
│  1. dispatchBeforeUpdate()   — TsPlugins: capture inputs     │
│  2. syncTransformsToBuffer() — ECS → SAB (gwen-core ptr)     │
│  3. dispatchWasmStep()       — plugin.onStep(delta)          │
│     └─ Rust reads SAB, computes, writes SAB                  │
│  4. checkSentinels()  ← debug mode: detect buffer overruns   │
│  5. syncTransformsFromBuffer() — SAB → ECS                   │
│  6. wasmBridge.tick()        — Rust game-loop heartbeat      │
│  7. dispatchUpdate()         — TsPlugins: game logic         │
│  8. dispatchRender()         — TsPlugins: rendering          │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Shared memory layout

`SharedMemoryManager` allocates a contiguous buffer in `gwen-core`'s WASM
linear memory. Every entity occupies exactly **32 bytes** (constant stride).

```
slot_offset = entity_index * TRANSFORM_STRIDE  (TRANSFORM_STRIDE = 32)

slot_offset +  0 : pos_x    (f32, 4 B) — world X position in metres
slot_offset +  4 : pos_y    (f32, 4 B) — world Y position in metres
slot_offset +  8 : rotation (f32, 4 B) — angle in radians
slot_offset + 12 : scale_x  (f32, 4 B)
slot_offset + 16 : scale_y  (f32, 4 B)
slot_offset + 20 : flags    (u32, 4 B) — bit 0 = physics_active, bit 1 = dirty
slot_offset + 24 : reserved (8  B)     — reserved for future use
```

### Rust helpers (`src/memory.rs`)

> ⚠️ **Cross-module memory isolation — critical rule**
>
> Each WASM module has its own **completely isolated linear memory**. A `usize`
> raw pointer valid inside `gwen-core.wasm` is **meaningless** in
> `gwen_physics2d.wasm` — dereferencing it causes `RuntimeError: memory access
> out of bounds` immediately.
>
> **The only valid way to share memory between two WASM modules in GWEN v1**
> is a **`Uint8Array` JS view** over one module's memory, passed to the other:
>
> ```typescript
> // TypeScript onInit — build a view over gwen-core's region
> const mem = bridge.getLinearMemory()!;
> const sharedBuf = new Uint8Array(mem.buffer, region.byteOffset, region.byteLength);
> this.wasmPlugin = new wasm.MyPlugin(sharedBuf, maxEntities);
> ```
>
> ```rust
> // Rust — accept Uint8Array, read/write via js_sys helpers
> use js_sys::Uint8Array;
>
> #[wasm_bindgen(constructor)]
> pub fn new(shared_buf: Uint8Array, max_entities: u32) -> Self { … }
>
> fn read_f32(buf: &Uint8Array, offset: usize) -> f32 { … }
> fn write_f32(buf: &Uint8Array, offset: usize, v: f32) { … }
> ```
>
> Always implement `onMemoryGrow` to refresh the view after a `memory.grow()` event:
>
> ```typescript
> onMemoryGrow(newMemory: WebAssembly.Memory): void {
>   const fresh = new Uint8Array(newMemory.buffer, this._region.byteOffset, this._region.byteLength);
>   this.wasmPlugin.update_shared_buf(fresh);
> }
> ```
>
> **Long term:** the WASM Component Model will solve this via WIT interfaces and
> native memory sharing. See `specs/PLAN_WASM_COMPONENT_MODEL.md`. Horizon ~2027.

```rust
use crate::memory::{read_position_rotation, write_position_rotation, set_physics_active};

// Read current position from the SAB via Uint8Array
let (x, y, rot) = read_position_rotation(&shared_buf, entity_index);

// Write updated position back after simulation
write_position_rotation(&shared_buf, entity_index, new_x, new_y, new_rot);
set_physics_active(&shared_buf, entity_index);
```

### TypeScript constants

```typescript
import { TRANSFORM_STRIDE, FLAG_PHYSICS_ACTIVE, FLAGS_OFFSET, SENTINEL } from '@gwen/engine-core';
```

---

## 4. Sentinel guards — buffer overrun detection

### Why it matters

If a Rust plugin writes more bytes than its `MemoryRegion.byteLength` allows, it
silently overwrites the adjacent region — corrupting another plugin's data with
no immediate error. This is the classic "heap corruption" bug.

### How GWEN detects it

`SharedMemoryManager` writes a **4-byte sentinel** (`0xDEADBEEF`) immediately
after each allocated region:

```
| region A data (byteLength) | 0xDEADBEEF (4 B) | region B data … |
```

`Engine._tick()` calls `checkSentinels()` **after** `dispatchWasmStep()` and
**before** `syncTransformsFromBuffer()` — the only frame slot where an overrun
could have occurred. If any sentinel has been overwritten, an error is thrown
immediately with the offending plugin name and the corrupted address.

```
[GWEN:SharedMemory] Sentinel overwrite detected for plugin 'physics2d'!
Expected 0xDEADBEEF at address 327680, found 0xCAFEBABE.
The plugin wrote past its MemoryRegion.byteLength boundary.
```

### Enabling sentinel checks

Sentinel checks run **only when `debug: true`** in your engine config:

```typescript
export default defineConfig({
  engine: { debug: true },   // ← enables per-frame sentinel verification
  wasmPlugins: [physics2D()],
});
```

In production (`debug: false`) the check is skipped entirely — zero overhead.

---

## 5. Memory growth and buffer-detach

### The problem

When Rust allocates enough memory to exhaust the current WASM linear memory,
the runtime calls `memory.grow(n_pages)`. This **replaces the underlying
`ArrayBuffer`**. Any `TypedArray` or `DataView` built on the old buffer
becomes **detached** — reads return `0`, writes are silently discarded.

**Rust-side: safe.** Rust computes addresses from pointer arithmetic and never
holds a JS `ArrayBuffer` reference.

**TypeScript-side: dangerous** if your plugin caches a typed array view.

### The fix — always re-wrap `memory.buffer`

```typescript
// ❌ Wrong: buffer reference cached across frames
this.view = new Float32Array(bridge.getLinearMemory()!.buffer, ptr, slotCount * 8);

// ✅ Correct: re-wrap on every frame (or in onMemoryGrow)
const view = new Float32Array(bridge.getLinearMemory()!.buffer, ptr, slotCount * 8);
```

### The `onMemoryGrow()` hook

For plugins that genuinely need to cache a view (performance-critical debug
overlay, for instance), implement the optional `onMemoryGrow()` hook:

```typescript
export class MyPlugin implements GwenWasmPlugin {
  private view: Float32Array | null = null;

  async onInit(bridge, region, api) {
    this.refreshView(bridge, region);
  }

  onMemoryGrow(newMemory: WebAssembly.Memory) {
    // Called automatically when gwen-core grows its linear memory.
    // Recreate the view on the fresh ArrayBuffer.
    this.view = new Float32Array(newMemory.buffer, this.region!.ptr, this.slotCount * 8);
  }

  private refreshView(bridge: WasmBridge, region: MemoryRegion) {
    const mem = bridge.getLinearMemory();
    if (mem) this.view = new Float32Array(mem.buffer, region.ptr, this.slotCount * 8);
  }
}
```

`bridge.getLinearMemory()` returns the live `WebAssembly.Memory` object —
access `.buffer` fresh on each use, never cache the buffer itself.

---

## 6. Parallel WASM fetch strategy

### The two-phase init in `createEngine()`

`createEngine()` separates plugin initialisation into two phases to minimise
load time when multiple WASM plugins are declared:

```
Phase 1 — network (parallel)
  All plugins' _prefetch() calls run concurrently.
  Each plugin fetches its .wasm binary independently.
  Total network time = max(individual fetch times), not their sum.

Phase 2 — memory + services (sequential)
  onInit() is called one plugin at a time.
  allocateRegion() mutates SharedMemoryManager.usedBytes — not concurrency-safe.
  Service registration must be ordered to avoid dependency issues.
```

### Implementing `_prefetch()` in your plugin

```typescript
export class MyPlugin implements GwenWasmPlugin {
  // Cached during _prefetch, consumed in onInit
  private _wasmModule: MyWasmModule | null = null;

  /**
   * Phase 1 — runs in parallel with other plugins' _prefetch().
   * Fetch the .wasm binary and cache the initialized module.
   */
  async _prefetch(): Promise<void> {
    this._wasmModule = await loadWasmPlugin<MyWasmModule>({
      jsUrl:   '/wasm/gwen_my_plugin.js',
      wasmUrl: '/wasm/gwen_my_plugin_bg.wasm',
      name:    'MyPlugin',
    });
  }

  /**
   * Phase 2 — runs sequentially.
   * _wasmModule is already loaded — no network round-trip here.
   */
  async onInit(bridge, region, api) {
    const wasm = this._wasmModule!;
    this.wasmPlugin = new wasm.MyPlugin(region.ptr, this.maxEntities);
    api.services.register('myService', this._createAPI());
  }
}
```

Plugins that do **not** implement `_prefetch()` simply fetch inside `onInit()`.
Both patterns work — `_prefetch()` is a performance optimisation, not required.

---

## 7. Creating the Rust crate

### `Cargo.toml`

```toml
[package]
name = "gwen-plugin-my-plugin"
version.workspace = true
edition.workspace = true

[lib]
crate-type = ["cdylib", "rlib"]   # cdylib for WASM, rlib for native tests

[dependencies]
wasm-bindgen = "0.2.87"
js-sys       = "0.3.64"
# Add your simulation library here

[package.metadata.wasm-pack.profile.release]
wasm-opt = false   # Avoid compatibility issues with wasm-opt and bulk-memory opcodes
```

### Minimal Rust file structure

**`src/lib.rs`**
```rust
pub mod bindings;
pub mod memory;   // copy from crates/gwen-plugin-physics2d/src/memory.rs
pub mod world;

pub use bindings::MyPlugin;
```

**`src/bindings.rs`** — wasm-bindgen interface
```rust
use wasm_bindgen::prelude::*;
use crate::world::MyWorld;

#[wasm_bindgen]
pub struct MyPlugin {
    world:        MyWorld,
    shared_ptr:   usize,
    max_entities: u32,
}

#[wasm_bindgen]
impl MyPlugin {
    #[wasm_bindgen(constructor)]
    pub fn new(shared_ptr: usize, max_entities: u32) -> Self {
        MyPlugin { world: MyWorld::new(), shared_ptr, max_entities }
    }

    /// Called every frame by the TS layer via onStep(delta).
    pub fn step(&mut self, delta: f32) {
        for entity_index in 0..self.max_entities {
            let (x, y, rot) = unsafe {
                crate::memory::read_position_rotation(self.shared_ptr, entity_index)
            };
            // … compute new_x, new_y, new_rot …
            unsafe {
                crate::memory::write_position_rotation(
                    self.shared_ptr, entity_index, new_x, new_y, new_rot,
                );
            }
        }
    }
}
```

### Compile to WASM

```bash
wasm-pack build crates/gwen-plugin-my-plugin \
  --target web \
  --out-dir packages/@gwen/plugin-my-plugin/wasm \
  --out-name gwen_my_plugin

# Output in packages/@gwen/plugin-my-plugin/wasm/:
#   gwen_my_plugin.js          ← wasm-bindgen JS glue
#   gwen_my_plugin_bg.wasm     ← WASM binary
#   gwen_my_plugin.d.ts        ← TypeScript types
```

---

## 8. Creating the TypeScript package

### `src/index.ts` — minimal implementation

```typescript
import type { GwenWasmPlugin, WasmBridge, EngineAPI, MemoryRegion } from '@gwen/engine-core';
import { loadWasmPlugin } from '@gwen/engine-core';

export interface MyPluginConfig {
  maxEntities?: number;
}

export class MyPlugin implements GwenWasmPlugin {
  readonly id = 'my-plugin';
  readonly name = 'MyPlugin';
  readonly sharedMemoryBytes: number;
  readonly provides = { myService: {} as MyServiceAPI };

  private _wasmModule: WasmMyModule | null = null;   // cached by _prefetch
  private wasmPlugin:  WasmMyPlugin | null = null;

  constructor(private config: MyPluginConfig = {}) {
    this.sharedMemoryBytes = (config.maxEntities ?? 10_000) * 32;
  }

  // Phase 1 — parallel network fetch
  async _prefetch(): Promise<void> {
    this._wasmModule = await loadWasmPlugin<WasmMyModule>({
      jsUrl:   '/wasm/gwen_my_plugin.js',
      wasmUrl: '/wasm/gwen_my_plugin_bg.wasm',
      name:    this.name,
    });
  }

  // Phase 2 — sequential init
  async onInit(bridge: WasmBridge, region: MemoryRegion, api: EngineAPI): Promise<void> {
    const wasm = this._wasmModule
      ?? await loadWasmPlugin<WasmMyModule>({ /* fallback if _prefetch not called */ });
    this.wasmPlugin = new wasm.MyPlugin(region.ptr, this.config.maxEntities ?? 10_000);
    api.services.register('myService', this._createAPI());
  }

  onStep(deltaTime: number): void { this.wasmPlugin?.step(deltaTime); }
  onDestroy(): void { this.wasmPlugin?.free?.(); this.wasmPlugin = null; }

  private _createAPI(): MyServiceAPI { /* … */ }
}

export function myPlugin(config: MyPluginConfig = {}): MyPlugin {
  return new MyPlugin(config);
}
```

### `package.json` — required `gwen` field

```json
{
  "name": "@gwen/plugin-my-plugin",
  "gwen": {
    "type": "wasm-plugin",
    "wasmId": "my-plugin",
    "wasmFiles": ["wasm/gwen_my_plugin.js", "wasm/gwen_my_plugin_bg.wasm"]
  }
}
```

The `gwen.wasmFiles` array tells `@gwen/vite-plugin` which files to serve in
dev mode and bundle into `dist/wasm/` for production.

---

## 9. Declaring the plugin in `gwen.config.ts`

```typescript
import { defineConfig } from '@gwen/engine-core';
import { myPlugin } from '@gwen/plugin-my-plugin';

export default defineConfig({
  engine: {
    maxEntities: 10_000,
    targetFPS:   60,
    debug:       true,   // enables per-frame sentinel checks in development
  },
  wasmPlugins: [
    myPlugin({ maxEntities: 10_000 }),
  ],
  tsPlugins: [],
});
```

### Accessing the service in a TsPlugin

```typescript
import type { MyServiceAPI } from '@gwen/plugin-my-plugin';

export class MySystem implements TsPlugin {
  name = 'MySystem';

  // Resolve in onInit only — never in onUpdate (service lookup is O(1) but
  // caching the reference is the idiomatic GWEN pattern)
  private myService!: MyServiceAPI;

  onInit(api: EngineAPI) {
    this.myService = api.services.get('myService') as MyServiceAPI;
  }

  onUpdate(api: EngineAPI, delta: number) {
    // Use this.myService — already resolved
  }
}
```

---

## 10. COOP/COEP headers

`@gwen/vite-plugin` automatically sets the isolation headers in dev mode and
in `vite preview`. For production deployments on custom servers:

```nginx
# nginx example
add_header Cross-Origin-Opener-Policy  "same-origin";
add_header Cross-Origin-Embedder-Policy "require-corp";
```

> ⚠️ These headers prevent loading cross-origin images, fonts, and audio from
> CDNs that do not return `Cross-Origin-Resource-Policy: cross-origin`.
> All assets must be self-hosted or served from a CORP-compatible CDN.

---

## 11. Testing

### Rust tests (native, no browser required)

```bash
# Fast native tests — runs in milliseconds, suitable for CI
cargo test -p gwen-plugin-my-plugin

# Browser tests (headless Chrome via wasm-pack)
wasm-pack test crates/gwen-plugin-my-plugin --headless --chrome
```

### TypeScript tests (Vitest + WASM mock)

```typescript
// tests/my_plugin.test.ts
vi.mock('@gwen/engine-core', async (importOriginal) => {
  const original = await importOriginal<typeof import('@gwen/engine-core')>();
  return { ...original, loadWasmPlugin: vi.fn() };
});

import { loadWasmPlugin } from '@gwen/engine-core';
import { MyPlugin } from '../src/index';

it('onInit registers the service', async () => {
  const mockWasm = {
    MyPlugin: vi.fn().mockReturnValue({ step: vi.fn(), free: vi.fn() }),
  };
  (loadWasmPlugin as Mock).mockResolvedValue(mockWasm);

  const plugin = new MyPlugin();
  const api = makeMockAPI();  // { services: { register: vi.fn(), get: ... } }
  await plugin.onInit(mockBridge, mockRegion, api);

  expect(api.services.register).toHaveBeenCalledWith('myService', expect.any(Object));
});
```

---

## 12. Type reference

### `GwenWasmPlugin`

```typescript
interface GwenWasmPlugin {
  readonly id: string;               // Unique identifier ('physics2d', 'ai'…)
  readonly name: string;             // Human-readable name ('Physics2D')
  readonly version?: string;
  readonly sharedMemoryBytes: number; // Bytes in SAB: maxEntities × TRANSFORM_STRIDE

  // Optional: services to register (for type-inference in api.services)
  readonly provides?: Record<string, unknown>;

  // Phase 1 — parallel network fetch (optional optimisation)
  _prefetch?(): Promise<void>;

  // Phase 2 — sequential memory allocation + service registration
  onInit(bridge: WasmBridge, region: MemoryRegion, api: EngineAPI): Promise<void>;

  // Per-frame slot (between beforeUpdate and update)
  onStep?(deltaTime: number): void;

  // Called when gwen-core's linear memory grows — recreate detached views here
  onMemoryGrow?(newMemory: WebAssembly.Memory): void;

  onDestroy?(): void;
}
```

### `MemoryRegion`

```typescript
interface MemoryRegion {
  readonly pluginId:   string;  // Owner plugin id
  readonly ptr:        number;  // Raw pointer in gwen-core's WASM linear memory
  readonly byteLength: number;  // Usable bytes (8-byte aligned)
  readonly byteOffset: number;  // Offset from start of shared buffer
}
```

### `SharedMemoryManager`

```typescript
class SharedMemoryManager {
  // Allocate the buffer in gwen-core's linear memory
  static create(bridge: WasmBridge, maxEntities?: number): SharedMemoryManager;

  // Carve out a named region + write sentinel guard
  allocateRegion(pluginId: string, byteLength: number): MemoryRegion;

  // Per-frame integrity check (throws if any sentinel overwritten)
  checkSentinels(bridge: WasmBridge): void;

  // Write sentinel canaries into the buffer (called by createEngine after all regions allocated)
  _writeSentinels(bridge: WasmBridge): void;

  getTransformRegion(): MemoryRegion;
  get allocatedBytes(): number;
  get capacityBytes(): number;
}
```

### Key constants

```typescript
const TRANSFORM_STRIDE   = 32;          // Bytes per entity slot
const FLAG_PHYSICS_ACTIVE = 0b01;       // Bit 0 of the flags field
const FLAGS_OFFSET        = 20;         // Byte offset of flags in a slot
const SENTINEL            = 0xDEADBEEF; // Buffer-overrun canary value
```

---

## 13. Reference implementation: `@gwen/plugin-physics2d`

The official `@gwen/plugin-physics2d` plugin covers every pattern documented here:

| Pattern | File |
|---------|------|
| Shared buffer layout (memory.rs) | `crates/gwen-plugin-physics2d/src/memory.rs` |
| ECS ↔ simulation mapping | `crates/gwen-plugin-physics2d/src/world.rs` |
| wasm-bindgen exports | `crates/gwen-plugin-physics2d/src/bindings.rs` |
| GwenWasmPlugin (TS) | `packages/@gwen/plugin-physics2d/src/index.ts` |
| Service types | `packages/@gwen/plugin-physics2d/src/types.ts` |
| Rust tests (native) | `crates/gwen-plugin-physics2d/tests/physics_world_tests.rs` |
| TS tests (mocked WASM) | `packages/@gwen/plugin-physics2d/tests/physics2d.test.ts` |

```typescript
// Complete usage example
import { defineConfig } from '@gwen/engine-core';
import { physics2D } from '@gwen/plugin-physics2d';
import type { Physics2DAPI } from '@gwen/plugin-physics2d';

export default defineConfig({
  engine: { maxEntities: 10_000, targetFPS: 60, debug: true },
  wasmPlugins: [physics2D({ gravity: -9.81, maxEntities: 10_000 })],
});

// Inside a TsPlugin:
private physics!: Physics2DAPI;

onInit(api: EngineAPI) {
  this.physics = api.services.get('physics') as Physics2DAPI;
  const handle = this.physics.addRigidBody(entityIndex, 'dynamic', x, y);
  this.physics.addBoxCollider(handle, 0.5, 0.5);
}

onUpdate(api: EngineAPI) {
  for (const event of this.physics.getCollisionEvents()) {
    console.log(`Collision: entity ${event.entityA} ↔ ${event.entityB}`);
  }
}
```

