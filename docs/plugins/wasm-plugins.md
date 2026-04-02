---
title: WASM Plugins — Guide & API Reference
description: How to build, register, and use Rust/WASM plugins in GWEN. Covers the Plugin Data Bus, lifecycle, TypeScript glue, and the physics2d reference implementation.
---

# Guide: Creating a WASM Plugin for GWEN

> **Audience:** developers who want to extend GWEN with a Rust/WASM module
> (physics, AI, networking, procedural generation…)
>
> **Prerequisites:** Rust stable + `wasm-pack` installed, basic knowledge of GWEN
>
> **See also:** [WASM Plugin Best Practices](./wasm-plugin-best-practices.md) —
> rules, pitfalls, and design decisions.

---

## Table of contents

1. [Prerequisites](#1-prerequisites)
2. [Plugin architecture](#2-plugin-architecture)
3. [Plugin Data Bus — channel-based communication](#3-plugin-data-bus--channel-based-communication)
4. [Sentinel guards — buffer overrun detection](#4-sentinel-guards--buffer-overrun-detection)
5. [Parallel WASM fetch strategy](#5-parallel-wasm-fetch-strategy)
6. [Creating the Rust crate](#6-creating-the-rust-crate)
7. [Creating the TypeScript package](#7-creating-the-typescript-package)
8. [Declaring the plugin in `gwen.config.ts`](#8-declaring-the-plugin-in-gwenconfigts)
9. [COOP/COEP headers](#9-coopcoep-headers)
10. [Testing](#10-testing)
11. [Type reference](#11-type-reference)
12. [Reference implementation: `@djodjonx/gwen-plugin-physics2d`](#12-reference-implementation-gwenplugin-physics2d)

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
      memory.rs        ← buffer layout helpers
    tests/
      my_plugin_tests.rs

  packages/@djodjonx/gwen-plugin-my-plugin/  ← TypeScript package (glue layer)
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
┌──────────────────────────────────────────────────────────────────────┐
│                         Engine._tick()                               │
│                                                                      │
│  1. dispatchBeforeUpdate()      TsPlugins: capture inputs            │
│  2. syncTransformsToBuffer()    ECS → SAB (legacy gwen-core ptr)     │
│  2b. resetEventChannels()       Bus: reset ring-buffer heads to 0    │
│  3. dispatchWasmStep()          plugin.onStep(delta)                 │
│     └─ Rust reads Bus channels, computes, writes Bus channels        │
│  4. checkSentinels()   [debug]  SAB + Bus buffer overrun detection   │
│  5. syncTransformsFromBuffer()  SAB → ECS (legacy)                  │
│  6. wasmBridge.tick()           Rust game-loop heartbeat             │
│  7. dispatchUpdate()            TsPlugins: game logic + read events  │
│  8. dispatchRender()            TsPlugins: rendering                 │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. Plugin Data Bus — channel-based communication

### Why the Bus exists

Two separate WASM modules cannot share raw pointers — each has its own isolated
linear memory. The **Plugin Data Bus** provides the correct solution: JS-native
`ArrayBuffer`s allocated by the engine, independent of any WASM module's memory.

Key properties:
- **Immune to `memory.grow()`** — Bus buffers are plain JS `ArrayBuffer`s.
  A `memory.grow()` in `gwen-core.wasm` never invalidates them.
- **Zero `onMemoryGrow()` needed** — no view invalidation, no refresh logic.
- **One bulk copy per channel per frame** — Rust calls `copy_from()` once.
  At 500 entities this costs ~10–20 µs — negligible vs. the simulation.
- **Typed sentinel guards** — each buffer gets a `0xDEADBEEF` canary in
  debug mode, checked after every `dispatchWasmStep()`.

### Declaring channels

Declare your plugin's channels as a static array on the class:

```typescript
import type { PluginChannel } from '@djodjonx/gwen-engine-core';

readonly channels: PluginChannel[] = [
  // Transform data from ECS → plugin (read direction)
  {
    name:        'transform',
    direction:   'read',
    strideBytes: 20,      // pos_x f32, pos_y f32, rot f32, scale_x f32, scale_y f32
    bufferType:  'f32',
  },
  // Binary events from plugin → TS (ring buffer)
  {
    name:           'events',
    direction:      'write',
    bufferType:     'ring',
    capacityEvents: 256,
  },
];
```

`PluginDataBus` allocates one `ArrayBuffer` per channel before `onInit()` is called.

### Channel types

| `bufferType` | View type       | Buffer size formula                              |
|---|---|---|
| `'f32'`      | `Float32Array`  | `maxEntities × strideBytes + 4` (sentinel)       |
| `'i32'`      | `Int32Array`    | `maxEntities × strideBytes + 4`                  |
| `'u8'`       | `Uint8Array`    | `maxEntities × strideBytes + 4`                  |
| `'ring'`     | `Uint8Array`    | `8 + capacityEvents × 11 + 4` (header + body + sentinel) |

### Ring-buffer event protocol

Events written by Rust are read by TypeScript using the binary ring-buffer protocol:

```
Buffer layout:
  Offset  0..4  : write_head (u32 LE) — next slot for Rust to write
  Offset  4..8  : read_head  (u32 LE) — next slot for TS to read
  Offset  8..N  : events, each 11 bytes:
                    [type u16][slotA u32][slotB u32][flags u8]
```

The engine resets both heads to `0` at the start of each frame (step 2b),
so Rust always writes fresh events and TypeScript always reads the current frame.

### Receiving buffers in `onInit()`

```typescript
async onInit(
  _bridge: WasmBridge,
  _region: MemoryRegion | null,   // null when sharedMemoryBytes = 0
  api: EngineAPI,
  bus?: PluginDataBus,
): Promise<void> {
  // Retrieve pre-allocated buffers from the Bus
  const transformBuf = bus?.get(this.id, 'transform')?.buffer
    ?? new ArrayBuffer(this.config.maxEntities * 20);  // fallback for tests
  const eventsBuf = bus?.get(this.id, 'events')?.buffer
    ?? new ArrayBuffer(8 + 256 * 11);

  const wasm = await loadWasmPlugin<MyWasmModule>({ jsUrl: '…', wasmUrl: '…', name: '…' });

  // Pass as Uint8Array views — the only valid cross-module memory bridge
  this.wasmPlugin = new wasm.MyPlugin(
    new Uint8Array(transformBuf),
    new Uint8Array(eventsBuf),
    this.config.maxEntities,
  );

  api.services.register('myService', this._createAPI());
}
```

### Reading events in TypeScript

```typescript
import { readEventChannel } from '@djodjonx/gwen-engine-core';

getMyEvents() {
  if (!this._eventsBuf) return [];
  return readEventChannel(this._eventsBuf);
  // Returns: Array<{ type: number; slotA: number; slotB: number; flags: number }>
}
```

`readEventChannel` advances `read_head` to `write_head` after reading —
calling it a second time within the same frame returns `[]`.

### SharedArrayBuffer opt-in (`wasm.sharedMemory`)

GWEN v2 uses the **Plugin Data Bus** by default (no SAB required).
A plugin explicitly opts into the SAB path via `sharedMemory: true`.

```typescript
wasm: {
  id: 'my-plugin',
  sharedMemory: true,      // explicit SAB opt-in
  sharedMemoryBytes: 65536 // required when sharedMemory=true
}
```

Rules:
- `sharedMemory: false` (or absent) => DataBus-only, no COOP/COEP headers required.
- `sharedMemory: true` => requires cross-origin isolation (COOP/COEP).
- if `sharedMemory: true` and `sharedMemoryBytes <= 0`, initialization fails explicitly.

### Setting `sharedMemoryBytes = 0`

Plugins using the Bus should keep `sharedMemory` unset/false and set `sharedMemoryBytes = 0`. This tells
`SharedMemoryManager` to skip allocation and passes `region = null` to `onInit()`.

```typescript
readonly sharedMemory = false;
readonly sharedMemoryBytes = 0;  // No legacy SAB — use the Bus
```

---

## 4. Sentinel guards — buffer overrun detection

Both the legacy SAB and the Plugin Data Bus use `0xDEADBEEF` sentinel canaries
written at the end of each allocated buffer.

`Engine._tick()` calls `checkSentinels()` **after** `dispatchWasmStep()` in
debug mode. If any sentinel has been overwritten, an error is thrown immediately:

```
[GWEN] PluginDataBus: sentinel overwrite detected in plugin 'my-plugin' channel 'events'
Expected 0xDEADBEEF, got 0x00000000.
The Rust plugin wrote past the end of its buffer.
```

Enable sentinel checks with `debug: true` in your engine config:

```typescript
export default defineConfig({
  engine: { debug: true },
  plugins: [myPlugin()],
});
```

In production (`debug: false`) the check is skipped — zero overhead.

---

## 5. Parallel WASM fetch strategy

`createEngine()` separates plugin initialisation into two phases:

```
Phase 1 — network (parallel)
  All plugins' _prefetch() calls run concurrently.
  Total network time = max(individual fetch times), not their sum.

Phase 2 — memory + services (sequential)
  onInit() is called one plugin at a time.
  Bus allocation and service registration are ordered and deterministic.
```

Implement `_prefetch()` to kick off the WASM binary download early:

```typescript
private _wasmModule: MyWasmModule | null = null;

async _prefetch(): Promise<void> {
  this._wasmModule = await loadWasmPlugin<MyWasmModule>({
    jsUrl:   '/wasm/gwen_my_plugin.js',
    wasmUrl: '/wasm/gwen_my_plugin_bg.wasm',
    name:    this.name,
  });
}

async onInit(_bridge, _region, api, bus) {
  // Module already downloaded — no second round-trip
  const wasm = this._wasmModule!;
  // … retrieve bus buffers, construct Rust struct, register service
}
```

---

## 6. Creating the Rust crate

### `Cargo.toml`

```toml
[package]
name = "gwen-plugin-my-plugin"
version.workspace = true
edition.workspace = true

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
wasm-bindgen    = "0.2.87"
js-sys          = "0.3.64"
gwen-wasm-utils = { path = "../../crates/gwen-wasm-utils" }

[package.metadata.wasm-pack.profile.release]
wasm-opt = false
```

### `src/bindings.rs`

```rust
use js_sys::Uint8Array;
use wasm_bindgen::prelude::*;
use gwen_wasm_utils::ring::RingWriter;
use gwen_wasm_utils::buffer::{write_u16, write_u32, write_u8};
use crate::world::MyWorld;

#[wasm_bindgen]
pub struct MyPlugin {
    world:         MyWorld,
    transform_buf: Uint8Array,  // Canal "transform" — JS-native ArrayBuffer du Bus
    events_buf:    Uint8Array,  // Canal "events"    — ring buffer JS-native du Bus
    max_entities:  u32,
}

#[wasm_bindgen]
impl MyPlugin {
    #[wasm_bindgen(constructor)]
    pub fn new(
        transform_buf: Uint8Array,
        events_buf:    Uint8Array,
        max_entities:  u32,
    ) -> Self {
        MyPlugin { world: MyWorld::new(), transform_buf, events_buf, max_entities }
    }

    pub fn step(&mut self, delta: f32) {
        // 1. Read transforms from Bus (positions ECS → plugin)
        self.world.read_transforms_from_buffer(&self.transform_buf, self.max_entities);

        // 2. Simulate
        self.world.simulate(delta);

        // 3. Write events to ring buffer
        self.world.write_events_to_buffer(&self.events_buf);
    }
}
```

### `src/world.rs` — writing events

```rust
use js_sys::Uint8Array;
use gwen_wasm_utils::ring::RingWriter;
use gwen_wasm_utils::buffer::{write_u16, write_u32, write_u8};

pub fn write_events_to_buffer(&self, buf: &Uint8Array) {
    let writer = RingWriter::new(buf, 11 /* stride: type u16 + slotA u32 + slotB u32 + flags u8 */);
    for ev in &self.events {
        if let Some(offset) = writer.next_write_offset() {
            write_u16(buf, offset,      ev.event_type);
            write_u32(buf, offset + 2,  ev.slot_a);
            write_u32(buf, offset + 6,  ev.slot_b);
            write_u8 (buf, offset + 10, ev.flags);
            writer.advance();
        } else {
            #[cfg(debug_assertions)]
            js_sys::eval("console.warn('[GWEN:MyPlugin] events ring buffer overflow')").ok();
            break;
        }
    }
}
```

### Compile to WASM

```bash
wasm-pack build crates/gwen-plugin-my-plugin \
  --target web \
  --out-dir packages/@djodjonx/gwen-plugin-my-plugin/wasm \
  --release
```

---

## 7. Creating the TypeScript package

### `src/index.ts` — complete implementation

```typescript
import type {
  GwenWasmPlugin, WasmBridge, EngineAPI, MemoryRegion,
  PluginChannel,
} from '@djodjonx/gwen-engine-core';
import { loadWasmPlugin, readEventChannel } from '@djodjonx/gwen-engine-core';
import type { PluginDataBus } from '@djodjonx/gwen-engine-core';

export class MyPlugin implements GwenWasmPlugin {
  readonly id      = 'my-plugin' as const;
  readonly name    = 'MyPlugin'  as const;
  readonly version = '0.1.0';

  // No legacy SAB — use the Plugin Data Bus
  readonly sharedMemoryBytes = 0;

  readonly channels: PluginChannel[] = [
    { name: 'transform', direction: 'read',  strideBytes: 20, bufferType: 'f32' },
    { name: 'events',    direction: 'write', bufferType: 'ring', capacityEvents: 256 },
  ];

  readonly provides = { myService: {} as MyServiceAPI };

  private wasmPlugin: WasmMyPlugin | null = null;
  private _eventsBuf: ArrayBuffer  | null = null;

  constructor(private config: MyPluginConfig = {}) {}

  async onInit(
    _bridge: WasmBridge,
    _region: MemoryRegion | null,
    api: EngineAPI,
    bus?: PluginDataBus,
  ): Promise<void> {
    const maxEntities = this.config.maxEntities ?? 10_000;

    const transformBuf = bus?.get(this.id, 'transform')?.buffer
      ?? new ArrayBuffer(maxEntities * 20);
    const eventsBuf = bus?.get(this.id, 'events')?.buffer
      ?? new ArrayBuffer(8 + 256 * 11);

    this._eventsBuf = eventsBuf;

    const wasm = await loadWasmPlugin<WasmMyModule>({
      jsUrl:   '/wasm/gwen_my_plugin.js',
      wasmUrl: '/wasm/gwen_my_plugin_bg.wasm',
      name:    this.name,
    });

    this.wasmPlugin = new wasm.MyPlugin(
      new Uint8Array(transformBuf),
      new Uint8Array(eventsBuf),
      maxEntities,
    );

    api.services.register('myService', this._createAPI());
  }

  // No onMemoryGrow() needed — Bus buffers are immune to memory.grow()

  onStep(deltaTime: number): void { this.wasmPlugin?.step(deltaTime); }

  onDestroy(): void {
    this.wasmPlugin?.free?.();
    this.wasmPlugin = null;
    this._eventsBuf = null;
  }

  private _createAPI(): MyServiceAPI {
    return {
      getEvents: () => {
        if (!this._eventsBuf) return [];
        return readEventChannel(this._eventsBuf);
      },
    };
  }
}

export function myPlugin(config: MyPluginConfig = {}): MyPlugin {
  return new MyPlugin(config);
}
```

### `package.json` — required `gwen` field

```json
{
  "name": "@djodjonx/gwen-plugin-my-plugin",
  "gwen": {
    "type": "wasm-plugin",
    "wasmId": "my-plugin",
    "wasmFiles": ["wasm/gwen_my_plugin.js", "wasm/gwen_my_plugin_bg.wasm"]
  }
}
```

---

## 8. Declaring the plugin in `gwen.config.ts`

```typescript
import { defineConfig } from '@djodjonx/gwen-kit';
import { myPlugin } from '@djodjonx/gwen-plugin-my-plugin';

export default defineConfig({
  engine: { maxEntities: 10_000, targetFPS: 60, debug: true },
  plugins: [myPlugin({ maxEntities: 10_000 })],
});
```

### Accessing the service in a TsPlugin

```typescript
import { createEntityId } from '@djodjonx/gwen-engine-core';

onInit(api: EngineAPI) {
  this.myService = api.services.get('myService') as MyServiceAPI;
}

onUpdate(api: EngineAPI) {
  for (const ev of this.myService.getEvents()) {
    // ev: { type, slotA, slotB, flags }
    // Reconstruct EntityId (bigint) from raw slot index:
    const entityA = createEntityId(ev.slotA, api.getEntityGeneration(ev.slotA));
  }
}
```

---

## 9. COOP/COEP headers

`@djodjonx/gwen-vite-plugin` sets the isolation headers automatically in dev mode.
For production servers:

```nginx
add_header Cross-Origin-Opener-Policy  "same-origin";
add_header Cross-Origin-Embedder-Policy "require-corp";
```

---

## 10. Testing

### Rust tests (native, no browser required)

```bash
cargo test -p gwen-plugin-my-plugin
cargo check -p gwen-plugin-my-plugin --target wasm32-unknown-unknown
```

### TypeScript tests (Vitest + mock WASM + mock Bus)

```typescript
function makeMockBus(transformBuf?: ArrayBuffer, eventsBuf?: ArrayBuffer) {
  const tb = transformBuf ?? new ArrayBuffer(10_000 * 20);
  const eb = eventsBuf   ?? new ArrayBuffer(8 + 256 * 11);
  return {
    get: (pluginId: string, name: string) => {
      if (name === 'transform') return { buffer: tb };
      if (name === 'events')    return { buffer: eb };
      return undefined;
    },
    _eventsBuf: eb,
  };
}

it('getEvents reads binary ring buffer', async () => {
  const bus = makeMockBus();
  // Write an event manually into the ring buffer
  const view = new DataView(bus._eventsBuf);
  view.setUint32(0, 1, true);          // write_head = 1
  view.setUint32(8 + 2, 5, true);      // slotA = 5
  view.setUint32(8 + 6, 3, true);      // slotB = 3
  view.setUint8 (8 + 10, 1);           // flags = 1

  await plugin.onInit(bridge, null, api, bus);
  const events = myService.getEvents();
  expect(events[0]).toEqual({ type: 0, slotA: 5, slotB: 3, flags: 1 });
});
```

---

## 11. Type reference

### `GwenWasmPlugin`

```typescript
interface GwenWasmPlugin {
  readonly id:                string;
  readonly name:              string;
  readonly version?:          string;
  readonly sharedMemoryBytes: number;          // Set to 0 for Bus-based plugins
  readonly channels?:         PluginChannel[]; // Declare Bus channels here
  readonly provides?:         Record<string, unknown>;

  _prefetch?(): Promise<void>;

  onInit(
    bridge: WasmBridge,
    region: MemoryRegion | null,   // null when sharedMemoryBytes = 0
    api:    EngineAPI,
    bus?:   PluginDataBus,
  ): Promise<void>;

  onStep?(deltaTime: number): void;
  onDestroy?(): void;
}
```

### `PluginChannel`

```typescript
// Data channel — bulk array of structs
type DataChannel = {
  name:        string;
  direction:   'read' | 'write' | 'readwrite';
  strideBytes: number;       // bytes per entity slot
  bufferType:  'f32' | 'i32' | 'u8';
};

// Event channel — binary ring buffer
type EventChannel = {
  name:           string;
  direction:      'write';
  bufferType:     'ring';
  capacityEvents: number;    // max simultaneous events per frame
};

type PluginChannel = DataChannel | EventChannel;
```

### `GwenEvent`

```typescript
interface GwenEvent {
  type:  number;   // u16 — plugin-defined event type
  slotA: number;   // u32 — raw ECS slot index of first entity
  slotB: number;   // u32 — raw ECS slot index of second entity (0 if N/A)
  flags: number;   // u8  — plugin-defined flags
}
```

### `PluginDataBus`

```typescript
class PluginDataBus {
  allocate(pluginId: string, channel: PluginChannel, maxEntities: number): AllocatedChannel;
  get(pluginId: string, channelName: string): AllocatedChannel | undefined;
  writeSentinels(): void;
  checkSentinels(): void;
  resetEventChannels(): void;
}

interface AllocatedChannel {
  readonly pluginId: string;
  readonly channel:  PluginChannel;
  readonly buffer:   ArrayBuffer;
  readonly view:     Float32Array | Int32Array | Uint8Array;
}
```

### Helpers

```typescript
// Read all pending events from a ring buffer (advances read_head)
function readEventChannel(buffer: ArrayBuffer): GwenEvent[];

// Write a single event into a ring buffer from TypeScript
function writeEventToChannel(buffer: ArrayBuffer, event: GwenEvent): boolean;

// Get a Float32Array view over a data channel buffer
function getDataChannelView(buffer: ArrayBuffer): Float32Array;
```

---

## 12. Reference implementation: `@djodjonx/gwen-plugin-physics2d`

The official `@djodjonx/gwen-plugin-physics2d` plugin covers every pattern documented here:

| Pattern | File |
|---|---|
| Channel declaration | `packages/@djodjonx/gwen-plugin-physics2d/src/index.ts` |
| Bus buffer retrieval in `onInit` | `packages/@djodjonx/gwen-plugin-physics2d/src/index.ts` |
| Binary event reading (`readCollisionEventsFromBuffer`) | `packages/@djodjonx/gwen-plugin-physics2d/src/types.ts` |
| Rust ring-buffer event writing | `crates/gwen-plugin-physics2d/src/world.rs` |
| `gwen-wasm-utils` usage | `crates/gwen-plugin-physics2d/src/world.rs` |
| TS tests with mock Bus | `packages/@djodjonx/gwen-plugin-physics2d/tests/physics2d.test.ts` |

```typescript
// Complete usage example
import { defineConfig } from '@djodjonx/gwen-kit';
import { createEntityId } from '@djodjonx/gwen-engine-core';
import { physics2D } from '@djodjonx/gwen-plugin-physics2d';
import type { Physics2DAPI } from '@djodjonx/gwen-plugin-physics2d';

export default defineConfig({
  engine: { maxEntities: 10_000, targetFPS: 60, debug: true },
  plugins: [physics2D({ gravity: -9.81, maxEntities: 10_000 })],
});

// Inside a TsPlugin:
private physics!: Physics2DAPI;

onInit(api: EngineAPI) {
  // Service is inferred from generated types (gwen prepare).
  this.physics = api.services.get('physics');
  const handle = this.physics.addRigidBody(entityIndex, 'dynamic', x, y);
  this.physics.addBoxCollider(handle, 0.5, 0.5);
}

onUpdate(api: EngineAPI) {
  for (const ev of this.physics.getCollisionEventsBatch().events) {
    // ev.slotA / ev.slotB are raw slot indices — reconstruct EntityId (bigint):
    const entityA = createEntityId(ev.slotA, api.getEntityGeneration(ev.slotA));
    const tagA    = api.getComponent(entityA, Tag);
  }
}
```

> Important: in app/playground code, do **not** cast services (e.g. `as Physics2DAPI`).
> Run `gwen prepare` (or `pnpm dev`) so `api.services.get('physics')` is inferred automatically.

