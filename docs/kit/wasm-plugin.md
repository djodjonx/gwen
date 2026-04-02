# Building a WASM Plugin

::: info Who compiles Rust?
Only framework contributors write Rust. Published packages ship **pre-compiled `.wasm` artifacts**. Game developers and most plugin authors only write TypeScript. This page is for the small audience building low-level engine extensions that require native performance.
:::

## Overview

A WASM plugin couples a **Rust crate** compiled to `.wasm` with a **TypeScript wrapper** that handles initialization, memory wiring, and the service API. From a game developer's perspective it looks identical to a TypeScript-only plugin — they add it to `gwen.config.ts` and call `useService()`.

The Rust crate and the TypeScript package are separate sources but published together on npm, with the `.wasm` binary bundled in the package.

---

## Architecture

```
┌─────────────────────────────────────┐
│           Game Code (TS)            │
│  const physics = useService('sim')  │
└──────────────┬──────────────────────┘
               │ engine.provide()
┌──────────────▼──────────────────────┐
│       TypeScript Plugin Wrapper     │  ← you write this
│  definePlugin({ name, setup, ... }) │
│  engine.loadWasmModule(...)         │
└──────────────┬──────────────────────┘
               │ SharedArrayBuffer (zero-copy)
┌──────────────▼──────────────────────┐
│         Rust / WASM Binary          │  ← compiled, not authored by game devs
│  #[wasm_bindgen] exported fns       │
│  reads/writes shared memory regions │
└─────────────────────────────────────┘
```

The TypeScript layer owns initialization: it allocates the `SharedArrayBuffer`, loads the `.wasm` binary, and wires named memory regions and ring-buffer channels. Rust simulation logic — physics ticks, pathfinding, particle updates — runs entirely inside WASM.

---

## Loading the WASM Binary

Use `engine.loadWasmModule()` inside your plugin's `setup()`:

```ts
import { definePlugin } from '@gwenjs/kit'

export const simPlugin = definePlugin({
  name: 'sim',
  async setup(engine) {
    const handle = await engine.loadWasmModule({
      name: 'sim',
      url: new URL('./sim.wasm', import.meta.url),

      memory: [
        { name: 'positions', byteLength: 40_000 },
        { name: 'velocities', byteLength: 40_000 },
      ],

      channels: [
        { name: 'collisions', capacity: 256 },
      ],

      step(handle, dt) {
        // called every frame by the engine
        handle.region('positions').asFloat32Array()  // direct view — no copy
        // Rust has already written updated positions to this region
      },
    })

    engine.provide('sim', buildService(handle))
  },
})
```

| Option | Type | Description |
|---|---|---|
| `name` | `string` | Unique module identifier |
| `url` | `URL` | Path to the `.wasm` binary |
| `memory` | `MemoryRegionConfig[]` | Named byte regions in the shared buffer |
| `channels` | `ChannelConfig[]` | Named ring-buffer channels for event streaming |
| `step` | `(handle, dt) => void` | Per-frame callback; runs after Rust has stepped |

---

## Memory Regions

Memory regions are named slices of the shared `SharedArrayBuffer`. Rust writes into them; TypeScript reads (or the reverse, depending on direction).

### Defining regions

```ts
memory: [
  { name: 'positions', byteLength: 40_000 },   // 10,000 × Vec4 (4 × f32)
  { name: 'velocities', byteLength: 40_000 },
  { name: 'flags', byteLength: 10_000 },        // u8 per entity
]
```

### Reading in `step`

```ts
step(handle, dt) {
  const positions = handle.region('positions').asFloat32Array()
  // positions[i * 4 + 0] = x, [i * 4 + 1] = y, etc.
  for (let i = 0; i < entityCount; i++) {
    renderQueue.push(positions[i * 4], positions[i * 4 + 1])
  }
}
```

See [WASM Shared Memory](./shared-memory) for the full `WasmRegionView` API and alignment rules.

---

## Ring-Buffer Channels

Channels let Rust **push** discrete events — collisions, triggers, audio cues — that TypeScript **reads** once per frame. They use a lock-free ring buffer backed by the shared buffer.

### Defining channels

```ts
channels: [
  { name: 'collisions', capacity: 256 },
  { name: 'audio-triggers', capacity: 64 },
]
```

### Reading in `step`

```ts
step(handle, dt) {
  for (const event of handle.channel('collisions').read()) {
    // event is a Uint8Array — decode with DataView or a schema
    const view = new DataView(event.buffer, event.byteOffset)
    const entityA = view.getUint32(0, true)
    const entityB = view.getUint32(4, true)
    dispatchCollision(entityA, entityB)
  }
}
```

If Rust produces more events than `capacity` in a single frame, oldest entries are overwritten. Size `capacity` for your worst-case frame burst.

---

## Exposing a Service

Your plugin should expose a clean TypeScript API rather than asking game code to interact with raw memory.

```ts
function buildService(handle: WasmModuleHandle) {
  return {
    setGravity(g: number) {
      // write a config value to a known region offset
      handle.region('config').asFloat32Array()[0] = g
    },
    getEntityPosition(id: number): [number, number] {
      const f32 = handle.region('positions').asFloat32Array()
      return [f32[id * 4], f32[id * 4 + 1]]
    },
  }
}
```

Provide it in `setup`:

```ts
engine.provide('sim', buildService(handle))
```

Type it via a module's `kit.addTypeTemplate()` so `useService('sim')` returns the correct type without casting. See [TypeScript Plugin → Wrapping with a Module](./typescript-plugin#wrapping-with-a-module).

---

## Rust Side

Rust exports are defined with `#[wasm_bindgen]` and compiled via `wasm-pack`. A minimal crate looks like:

```rust
// crates/my-sim/src/lib.rs
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Sim {
    positions: Vec<f32>,
}

#[wasm_bindgen]
impl Sim {
    #[wasm_bindgen(constructor)]
    pub fn new(capacity: usize) -> Self {
        Self { positions: vec![0.0; capacity * 4] }
    }

    pub fn step(&mut self, dt: f32) {
        // update positions ...
    }

    pub fn positions_ptr(&self) -> *const f32 {
        self.positions.as_ptr()
    }
}
```

The compiled `.wasm` is checked into the npm package under `dist/` or `wasm/`. Users never run `wasm-pack` — they install your npm package and get the binary.

```
my-plugin/
  src/
    index.ts        ← TypeScript wrapper
    plugin.ts
  wasm/
    my_sim_bg.wasm  ← pre-compiled, committed
    my_sim.js       ← wasm-bindgen JS glue
  package.json
```

---

## Minimal Plugin Skeleton

```ts
// src/plugin.ts
import { definePlugin } from '@gwenjs/kit'

export interface SimService {
  getPosition(id: number): [number, number]
  setGravity(g: number): void
}

export const simPlugin = definePlugin({
  name: 'sim',
  async setup(engine) {
    const handle = await engine.loadWasmModule({
      name: 'sim',
      url: new URL('../wasm/my_sim_bg.wasm', import.meta.url),
      memory: [
        { name: 'positions', byteLength: 40_000 },
      ],
      channels: [
        { name: 'collisions', capacity: 256 },
      ],
      step(handle, _dt) {
        for (const ev of handle.channel('collisions').read()) {
          // process collision events
        }
      },
    })

    const service: SimService = {
      getPosition(id) {
        const f32 = handle.region('positions').asFloat32Array()
        return [f32[id * 4], f32[id * 4 + 1]]
      },
      setGravity(g) {
        handle.region('positions').asFloat32Array()[0] = g
      },
    }

    engine.provide('sim', service)
  },
})
```

---

## Next Steps

- [WASM Shared Memory](./shared-memory) — `WasmRegionView`, `WasmRingBuffer`, alignment rules, performance
- [TypeScript Plugin](./typescript-plugin) — for the service and module wrapping patterns used above
