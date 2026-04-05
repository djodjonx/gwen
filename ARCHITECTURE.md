# 🏗️ GWEN Framework Architecture — Hybrid WASM/TS Game Engine

> **Version:** 1.1 — Definitive founding document
> **Date:** March 3, 2026
> **Status:** ✅ Architecture validated and set in stone

> **Canonical execution contract:** [`specs/rfc-v3/IMPLEMENTATION_PLAYBOOK_V2.md`](specs/rfc-v3/IMPLEMENTATION_PLAYBOOK_V2.md) is the authoritative source for frozen architecture decisions, ordered PR backlog, and implementation gates. This document provides the architectural overview; the playbook governs execution.

---

## 1. Vision and Philosophy

The goal of GWEN is to provide a 2D/3D web game engine that delivers **the raw performance of low-level code (Rust)** while preserving **the ergonomics and Developer Experience (DX) of modern web frameworks**.

The architecture rests on a strict separation of concerns:

- **The Muscle (Rust/WASM):** Manages linear memory, ECS, mathematics, physics, AI. The _game_ developer never writes Rust — it is transparent.
- **The Brain & The Face (TypeScript & DOM):** Manages business logic, user input, rendering, orchestration, and interfaces (HUD).

**Founding principle:** the developer writes their game in TypeScript. The engine silently delegates intensive operations to the Rust/WASM core — transparent, without lock-in.

**Rust is never required on the user side.** The `.wasm` artifacts are pre-compiled and published in each npm package. Only framework contributors compile Rust.

---

## 2. Technological Foundations

1. **Rust/WASM**: Native performance in the browser. Compiled via `wasm-pack` in CI. The `gwen_core_bg.wasm` artifact is pre-compiled and embedded in `@gwenjs/gwen-engine-core/wasm/`.
2. **ECS (Entity Component System)**: Data is not OOP objects but flat arrays (`ComponentStorage` SoA). Zero copy, zero GC, maximum speed.
3. **Independent WASM modules + SharedArrayBuffer**: `gwen-core` and WASM plugins are **separate** `.wasm` modules communicating via a shared memory buffer. Zero copy, zero marshalling, two independently deployable modules.
4. **TS plugin as glue**: The TypeScript plugin of a WASM plugin is not a "wrapper that translates" — it initializes shared memory and orchestrates calls between WASM modules. The simulation logic stays 100% in Rust.

---

## 3. WASM Plugin Model — The Key Decision

### Why not a monolithic build?

Compiling `gwen-core + physics2d` into **a single `.wasm`** is technically possible (build-time linking) but has a major cost: **the user would need Rust installed** to rebuild whenever they declare a plugin in their config. This is contrary to GWEN's founding principle.

### The chosen model: two `.wasm` + SharedArrayBuffer

```
@gwenjs/gwen-engine-core/wasm/
  gwen_core_bg.wasm        ← ECS, Transform, GameLoop

@gwenjs/gwen-plugin-physics2d/wasm/
  gwen_physics2d_bg.wasm   ← Rapier2D, RigidBody, Collider
```

The two modules share the **same linear memory** via `SharedArrayBuffer`. The TypeScript plugin (`@gwenjs/gwen-plugin-physics2d`) acts as **initialization glue**: it mounts the shared memory, wires WASM imports/exports, and exposes a clean API to the `WasmBridge`.

```
┌──────────────────────────────────────────────────────────┐
│                   TypeScript (Engine)                    │
│  WasmBridge.physics_step(delta)   ← API haut niveau      │
└────────────┬────────────────────────────┬────────────────┘
             │                            │
    ┌────────▼────────┐        ┌──────────▼────────┐
    │  gwen_core.wasm │        │  physics2d.wasm    │
    │  ECS / GameLoop │        │  Rapier2D          │
    │                 │        │                    │
    │  ComponentStorage◄───────► RigidBodySet       │
    │  (positions,    │        │  (simulation)      │
    │   velocities)    │        │                    │
    └────────┬────────┘        └────────────────────┘
             │
     SharedArrayBuffer
     (shared memory — zero copy)
```

### Real overhead

| Approach                         | Overhead per frame (1000 entities) | Rust required by user    |
| -------------------------------- | ---------------------------------- | ------------------------ |
| Monolithic build                 | ~0 ms                              | ✅ **YES** — blocking    |
| Two WASM + JS copy               | ~10 ms                             | ❌ No — but **too slow** |
| **Two WASM + SharedArrayBuffer** | **~0.01 ms**                       | ❌ **No — chosen**       |

SharedArrayBuffer synchronization is negligible (< 0.1% of frame budget at 60 FPS).

---

## 4. The Configuration Pipeline

User project entry point — the **Composition Root**.

```typescript
// gwen.config.ts (User Project)
import { defineConfig } from '@gwenjs/gwen-cli';
import { physics2D } from '@gwenjs/gwen-plugin-physics2d'; // npm install@gwenjs/gwen-plugin-physics2d
import { Canvas2DRenderer } from '@gwenjs/gwen-renderer-canvas2d';
import { InputPlugin } from '@gwenjs/gwen-plugin-input';

export default defineConfig({
  core: {
    maxEntities: 10_000,
    targetFPS: 60,
    // loop: 'internal'  ← default: engine owns RAF
    // loop: 'external'  ← JS calls engine.advance(delta) each frame; delta capped at maxDeltaSeconds (default 0.1)
  },

  // WASM Plugins — pre-compiled artifacts in the npm package.
  // No Rust installation required. The CLI loads the .wasm at startup.
  wasm: [physics2D({ gravity: 9.81, friction: 0.9 })],

  // TypeScript Plugins — logic, DOM, Web APIs
  plugins: [new InputPlugin(), new Canvas2DRenderer({ width: 800, height: 600 })],
});
```

---

## 5. Anatomy of a WASM Plugin

A GWEN WASM plugin is composed of **two distinct parts**:

### A. The Rust crate (`crates/gwen-plugin-physics2d/`)

Compiled **once in CI**, artifact published in the npm package. The user never sees this code.

```rust
// crates/gwen-plugin-physics2d/src/lib.rs
use wasm_bindgen::prelude::*;
use rapier2d::prelude::*;

#[wasm_bindgen]
pub struct Physics2DPlugin {
    pipeline: PhysicsPipeline,
    rigid_body_set: RigidBodySet,
    // ...
    /// Pointer to shared memory with gwen-core (SharedArrayBuffer)
    shared_memory: *mut f32,
}

#[wasm_bindgen]
impl Physics2DPlugin {
    #[wasm_bindgen(constructor)]
    pub fn new(gravity: f32, shared_ptr: *mut f32) -> Self { ... }

    /// Advances the simulation. Reads/writes directly into shared_memory.
    /// Called by the TypeScript WasmBridge each frame.
    pub fn step(&mut self, delta: f32) { ... }

    /// Returns collision events (lightweight JSON).
    pub fn get_collision_events(&self) -> String { ... }
}
```

### B. The TypeScript package (`packages/@gwenjs/gwen-plugin-physics2d/`)

This is the **glue** — initializes shared memory, loads the `.wasm`, registers methods in the `WasmBridge`. Contains **zero simulation logic**.

```typescript
// packages/@gwenjs/gwen-plugin-physics2d/src/index.ts
import { GwenWasmPlugin, WasmBridge } from '@gwenjs/gwen-engine-core';

export class Physics2DPlugin implements GwenWasmPlugin {
  readonly name = 'Physics2D';

  async onInit(bridge: WasmBridge, sharedBuffer: SharedArrayBuffer) {
    // Loads the pre-compiled .wasm from the package — zero Rust required
    const wasm = await import('../wasm/gwen_physics2d.js');
    await wasm.default();

    // Mount shared memory with gwen-core
    const sharedPtr = bridge.getSharedMemoryPtr();
    this.physics = new wasm.Physics2DPlugin(this.options.gravity, sharedPtr);
  }

  onStep(delta: number) {
    this.physics.step(delta); // < 0.5ms, tout en Rust
  }

  getCollisionEvents(): CollisionEvent[] {
    return JSON.parse(this.physics.get_collision_events());
  }
}

// Config helper (pure descriptor object)
export const physics2D = (options = { gravity: 9.81 }) => new Physics2DPlugin(options);
```

---

## 6. TypeScript Plugin Architecture

Pure TS plugins implement `GwenPlugin` and use the **Query System** via `EngineAPI`:

```typescript
// src/systems/PlayerController.ts
import { GwenPlugin, EngineAPI } from '@gwenjs/gwen-engine-core';

export class PlayerController implements GwenPlugin {
  readonly name = 'PlayerController';

  constructor(private audio: IAudioService) {} // Pure constructor DI

  onUpdate(api: EngineAPI, deltaTime: number) {
    const players = api.query([PlayerInput, Velocity]);
    for (const id of players) {
      const input = api.component.get(id, PlayerInput);
      if (input.isJumping) {
        api.component.set(id, Velocity, { y: -500 }); // Write → WASM memory
        this.audio.playSound('jump.mp3');
      }
    }
  }
}
```

---

## 7. Game Loop Sequencing (60 FPS)

Two loop modes are supported. See [External Loop Contract](specs/rfc-v3/IMPLEMENTATION_PLAYBOOK_V2.md#3-final-runtime-contract-external-loop) for the authoritative specification.

### Mode `loop: 'internal'` (default)

The engine owns `requestAnimationFrame`. Delta is computed internally and capped at `maxDeltaSeconds` (default `0.1`).

```
RAF(now) → compute ΔT (capped) → onBeforeUpdate → engine.advance(ΔT) → onUpdate → onRender
```

### Mode `loop: 'external'`

JS controls timing. The engine never starts RAF. The caller must invoke `engine.advance(delta)` each frame.

```
JS tick → engine.advance(delta) → [onBeforeUpdate → Core reset channels → Rust step → onUpdate → onRender]
```

Frame sequence detail:

```
1. onBeforeUpdate  → TsPlugins: capture inputs, intentions             ~0.1ms
2. Core            → reset event channels (Data Bus protocol)         ~0.001ms
3. Rust/core step  → physics.step(), ai.step() (SharedMem)            ~0.5ms
4. onUpdate        → TsPlugins: business logic post-step              ~1ms
5. onRender        → TsPlugins: Canvas/WebGL drawing                  ~5ms
                                                         Total: ~7ms (60 FPS ✅)
```

**Golden rule:** WASM is **authoritative** over its data. After the Rust step, Rust physics positions overwrite everything. Never write from TypeScript to a component driven by Rust physics.

---

## 8. TypeScript ↔ Rust Bridge (WasmBridge)

```
Engine.createEntity()     → WasmBridge → Rust EntityAllocator
Engine.addComponent()     → DataView/SchemaLayout → WasmBridge → Rust ComponentStorage
Engine.query()            → WasmBridge → Rust QuerySystem (archetype cache)
Engine.tick(delta)        → WasmBridge → Rust GameLoop
Engine.physics_step()     → Physics2DPlugin.onStep() → Rust Rapier2D (SharedArrayBuffer)
```

**EntityId 64-bit**: `(BigInt(generation) << 32n) | BigInt(index)` — 32-bit index + 32-bit generation, `bigint` format aligned Rust/TS, zero conversion. Use `createEntityId(index, generation)` / `unpackEntityId(id)` from `@gwenjs/gwen-engine-core`.

**Binary serialization**: `computeSchemaLayout()` generates compiled `serialize`/`deserialize` from `defineComponent()`. Global 1 KB scratchpad — zero allocation per frame.

---

## 9. Data Management: Component DSL

```typescript
// src/components/Velocity.comp.ts
import { defineComponent, Types } from '@gwenjs/gwen-engine-core';

export const Velocity = defineComponent({
  name: 'Velocity',
  schema: { x: Types.f32, y: Types.f32 },
});
```

**Available types:** `f32, f64, i32, i64, u32, u64, bool, string`, **`vec2, vec3, vec4, quat, color`** (spatial and color primitives — present in core, do not redefine in plugins)

---

## 10. User Interface (HUD)

Direct DOM Binding, without Virtual DOM — zero micro-stutters:

```typescript
// src/ui/HealthBar.ui.ts
export const HealthBar = defineUI({
  name: 'HealthBar',
  onMount(api, entityId) {
    api.services.get('htmlUI').mount(entityId, `<div class="fill"></div>`);
  },
  render(api, entityId) {
    const hp = api.components.Health.getCurrent(entityId);
    api.services.get('htmlUI').style(entityId, 'fill', 'width', `${hp}%`);
  },
});
```

---

## 11. Dependency Injection & Service Locator

**Pure DI (constructor):** services instantiated in `gwen.config.ts`, passed to plugins.

**Service Locator (`api.services`):** `register` in `onInit` only, `get` in `onUpdate`.

```typescript
// Type inferred automatically from config — zero manual cast
api.services.get('keyboard'); // → KeyboardInput ✅
api.services.get('renderer'); // → Canvas2DRenderer ✅
api.services.get('physics'); // → Physics2DAPI ✅ (if wasm: [physics2D()])
```

---

## 12. Prefabs and Scenes

```typescript
// Prefab: declarative entity recipe
export const EnemyPrefab = definePrefab({
  name: 'Enemy',
  components: [Transform, Velocity, AI, Sprite],
  defaults: { Velocity: { x: 0, y: 50 } },
});

// Scene: global lifecycle, clears WASM memory on transition
export const GameScene = defineScene('Game', (scenes) => ({
  ui: [BackgroundUI, PlayerUI, ScoreUI],
  plugins: [MovementSystem, PlayerSystem, CollisionSystem],
  onEnter(api) {
    api.prefabs.instantiate('Enemy', { x: 100, y: 0 });
  },
  onExit(api) {
    /* cleanup */
  },
}));
```

---

## 13. Monorepo Topology

```
gwen/
├── Cargo.toml                          ← Rust workspace
├── pnpm-workspace.yaml                 ← pnpm workspace
│
├── crates/
│   ├── gwen-core/                      ← ECS + GameLoop + Transform (~150 KB WASM)
│   │   └── src/
│   │       ├── entity.rs               ← EntityAllocator with generations
│   │       ├── component.rs            ← ComponentStorage SoA
│   │       ├── query.rs                ← QuerySystem archetype cache
│   │       ├── allocator.rs            ← low-level allocator
│   │       ├── events.rs               ← EventBus pub/sub
│   │       ├── gameloop.rs             ← frame orchestration
│   │       ├── transform.rs            ← 2D Transform
│   │       ├── transform_math.rs       ← vector math
│   │       └── bindings.rs             ← wasm-bindgen exports
│   │
│   └── gwen-plugin-physics2d/          ← 🔜 Independent Rust crate (Rapier2D)
│       ├── Cargo.toml                  ← depends on rapier2d, NOT on gwen-core
│       └── src/
│           ├── lib.rs                  ← re-exports
│           ├── components.rs           ← RigidBody, Collider, PhysicsMaterial
│           ├── world.rs                ← Rapier2D pipeline + EntityId↔Handle mapping
│           └── bindings.rs             ← wasm-bindgen exports (Physics2DPlugin)
│
├── packages/
│   └──@gwenjs/gwen-
│       ├── engine-core/                ← TS Orchestrator (Engine, WasmBridge…)
│       │   └── wasm/                   ← gwen_core_bg.wasm pre-compiled (CI)
│       ├── cli/                        ← gwen dev/build/prepare
│       ├── vite-plugin/                ← virtual modules, HMR, WASM middleware
│       ├── renderer-canvas2d/          ← Canvas2DRenderer
│       ├── plugin-input/               ← keyboard/mouse/gamepad
│       ├── plugin-audio/               ← Web Audio API
│       ├── plugin-debug/               ← FPS tracker + overlay
│       ├── plugin-html-ui/             ← HTML UI per entity
│       └── plugin-physics2d/           ← 🔜 TS glue + pre-compiled wasm/
│           ├── wasm/                   ← gwen_physics2d_bg.wasm pre-compiled (CI)
│           └── src/
│               └── index.ts            ← Physics2DPlugin (glue) + physics2D() helper
│
└── playground/
    └── space-shooter/                  ← Complete demo
```

---

## 14. Target Developer Workflow

```bash
# Create a project — zero Rust required
npm create gwen-app my-game

# Add physics — simple npm install
npm install@gwenjs/gwen-plugin-physics2d

# Development
gwen dev     # Vite HMR + WASM served from node_modules

# Production
gwen build   # bundle TS + copy .wasm from node_modules → dist/wasm/

# Deployment
gwen preview
```

**The user never touches** Vite, Rust, `wasm-pack`, or the WASM bootstrap.

---

## 15. Performance Targets

| Metric                       | Target                             |
| ---------------------------- | ---------------------------------- |
| Stable FPS                   | 60 FPS with 10,000 active entities |
| Base WASM size               | < 150 KB (ECS + Transform)         |
| Physics WASM size            | < 400 KB (Rapier2D)                |
| SharedArrayBuffer overhead   | < 0.01 ms/frame                    |
| Physics step (1000 entities) | < 0.5 ms (native Rapier2D)         |
| TTI                          | < 2 s on a standard connection     |

---

## 16. Key Architectural Decisions (ADR)

| ADR       | Decision                                             | Reason                                                     |
| --------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| **ADR-1** | WASM Plugins = separate `.wasm` published in npm     | Rust never required on the user side — maximum DX          |
| **ADR-2** | Inter-WASM communication via SharedArrayBuffer       | Zero copy between WASM modules, ~0.01ms overhead           |
| **ADR-3** | TS Plugin = initialization glue, zero logic          | Simulation stays 100% in Rust, TS is just a wirer          |
| **ADR-4** | TS for game logic, Rust for the engine               | Clear separation, game developers never touch Rust         |
| **ADR-5** | Static compile-time configuration (`gwen.config.ts`) | Inferred typing, Tree-shaking, Nuxt-like DX                |
| **ADR-6** | `defineComponent()` DSL with `Types.*`               | Zero allocation per frame, compiled serialize/deserialize  |
| **ADR-7** | Pure DI + Service Locator (`api.services`)           | Testability, multi-instance, automatically inferred typing |

---

_This document is the authoritative architectural source of truth for GWEN. All technical decisions must be aligned with these principles._
