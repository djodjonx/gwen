# Architecture

GWEN is a hybrid Rust/WASM + TypeScript game engine. The Rust core handles the performance-critical internals — ECS, physics, math — compiled ahead-of-time to WebAssembly. TypeScript handles everything you touch as a developer: game logic, rendering, plugins, and tooling.

You never write Rust.

## WASM + TypeScript Separation

| Layer | Technology | Responsibility |
|---|---|---|
| Core runtime | Rust → WASM | ECS, physics, math, game loop |
| Game logic | TypeScript | Systems, plugins, scenes, DX |

The WASM modules are pre-built and shipped as npm packages. Importing `@gwenjs/core` gives you a fully functional engine — no Rust toolchain required.

## Independent WASM Modules

GWEN does not compile everything into a single monolithic `.wasm` binary. Instead, each capability ships as its own module:

- `gwen-core.wasm` — ECS, world state, game loop
- `physics2d.wasm` — 2D physics (Rapier)
- `physics3d.wasm` — 3D physics

All modules share a single `SharedArrayBuffer` as linear memory. Data is never copied between JS and WASM during a frame — reads and writes go directly to the shared buffer.

::: info Zero-copy overhead
The shared-memory bridge adds less than **0.01ms per frame** for 1,000 active entities.
:::

## ECS Model

GWEN uses a pure [Entity Component System](./components.md):

- **Entities** are integer IDs — nothing more.
- **Components** are flat, typed data stored in Structure-of-Arrays (SoA) layout inside the WASM linear memory.
- **Systems** query entities by component composition and mutate component data each frame.

There is no OOP inheritance. An entity *is* defined entirely by which components it carries.

```
Entity 42
  ├── Position { x: 10, y: 20 }
  ├── Velocity { x: 1, y: 0 }
  └── PlayerTag {}
```

See [Components](./components.md) and [Systems](./systems.md) for details.

## Plugin System

Plugins extend the engine with new capabilities. Each plugin implements the `GwenPlugin` interface with optional `setup()` and `teardown()` hooks. In standard projects, plugins are loaded by declaring their module names in `gwen.config.ts` — no manual instantiation needed.

```ts
// gwen.config.ts
export default defineConfig({
  modules: [
    '@gwenjs/input',
    ['@gwenjs/renderer-canvas2d', { width: 800, height: 600 }],
  ],
})
```

The engine context is active during `setup()` and throughout all frame phases, so composables like `useQuery()` and `useService()` work seamlessly inside any plugin or system. See [Engine Context](./context.md) for how this works.

## 8-Phase Frame Loop

Each frame runs through eight phases in order:

| Phase | Hook | Description |
|---|---|---|
| 1 | `onBeforeUpdate` | Pre-physics, input sampling |
| 2 | WASM pre-step | WASM modules prepare |
| 3 | `onUpdate` | Main game logic |
| 4 | WASM step | Physics/simulation step |
| 5 | `onAfterUpdate` | Post-physics reconciliation |
| 6 | WASM post-step | WASM modules finalize |
| 7 | `onRender` | Rendering |
| 8 | WASM render | WASM render callbacks |

Register callbacks for any phase from inside a [system's](./systems.md) setup function using the corresponding composable hook.

## Module System

Your project's entry point is `gwen.config.ts` at the repo root, using `defineConfig` from `@gwenjs/app`:

```ts
// gwen.config.ts
import { defineConfig } from '@gwenjs/app'

export default defineConfig({
  engine: { maxEntities: 10_000, targetFPS: 60 },
  modules: [
    '@gwenjs/input',
    ['@gwenjs/renderer-canvas2d', { width: 800, height: 600 }],
    ['@gwenjs/physics2d', { gravity: 9.81 }],
  ],
})
```

Each entry in `modules: []` is either a package name string (no options) or a `[name, options]` tuple. The `gwen` CLI reads this file to install plugins, generate types, and configure the engine before the game starts.

::: tip Next steps
- [Components](./components.md) — define typed data
- [Systems](./systems.md) — write game logic
- [Scenes](./scenes.md) — structure your game states
:::
