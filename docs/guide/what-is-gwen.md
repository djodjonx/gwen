# What is GWEN?

GWEN is a TypeScript-first web game framework built on a Rust/WASM core. The goal is simple: bring near-native performance to browser games without forcing game developers to leave the TypeScript ecosystem.

You write TypeScript. GWEN handles the rest.

## The Core Idea

Game engines need two things to be great: **performance** and **great DX**. These two goals are traditionally in tension — you either write close-to-metal code and sacrifice ergonomics, or you write expressive high-level code and pay a runtime cost.

GWEN resolves this tension by splitting responsibilities cleanly:

- **Rust/WASM** — ECS scheduling, entity storage, physics simulation, matrix math. Pre-compiled, versioned, shipped as npm packages.
- **TypeScript** — game systems, scenes, prefabs, UI, plugin orchestration, configuration. Everything you actually write.

No Rust knowledge required. No WASM build step in your project. Just `pnpm install` and go.

## Performance

GWEN's WASM modules use a **SharedArrayBuffer** as shared linear memory between `gwen-core.wasm` and plugin WASM binaries (e.g., `physics2d.wasm`). This eliminates cross-boundary copying entirely.

- Zero-copy entity data — the ECS uses a **Structure of Arrays (SoA)** layout in shared memory
- Frame overhead under **0.01ms** for 1000 entities
- Physics and game-logic WASM modules run independently, communicating through named memory regions and ring-buffer channels

The TypeScript layer reads and writes directly into those typed memory views — no serialization, no garbage pressure per frame.

## Extensible by Design

Every engine capability is a plugin. GWEN ships a full set of official plugins, and community plugins follow the same interface.

| Package | Role |
|---|---|
| `@gwenjs/input` | Keyboard and gamepad input |
| `@gwenjs/audio` | Web Audio playback |
| `@gwenjs/physics2d` | 2D physics (wraps the WASM physics module) |
| `@gwenjs/physics3d` | 3D physics |
| `@gwenjs/renderer-canvas2d` | Canvas 2D renderer |
| `@gwenjs/ui` | HTML/CSS overlay UI |
| `@gwenjs/debug` | Debug overlay |
| `@gwenjs/sprite-anim` | Sprite animation |
| `@gwenjs/r3f` | React Three Fiber integration |

Modules register themselves with GWEN by declaring them in `gwen.config.ts`. They expose services, inject frame-phase hooks, and integrate seamlessly with the composable system pattern.

```typescript
import { defineConfig } from '@gwenjs/app'

export default defineConfig({
  modules: [
    '@gwenjs/input',
    ['@gwenjs/physics2d', { gravity: 9.81 }],
  ],
})
```

## Zero-config Types

Run `gwen prepare` once — usually right after scaffolding or adding a plugin — and GWEN auto-generates TypeScript declarations into `.gwen/`. These declarations extend `GwenDefaultServices` so that every `useService()` call returns the exact type for that plugin's API, with no manual casting.

::: tip
You never write `as Physics2DAPI`. The types flow from your config automatically.
:::

## Composable Systems

Game logic lives in **systems**. Systems are defined with `defineSystem()` and use composables — `useQuery()`, `useService()`, `useInput()` — that are resolved once during a synchronous setup phase, then referenced in frame callbacks.

```typescript
import { defineSystem } from '@gwenjs/core'
import { useQuery, onUpdate } from '@gwenjs/core'
import { Position, Velocity } from '../components'

export const movementSystem = defineSystem(() => {
  const entities = useQuery([Position, Velocity])

  onUpdate((dt) => {
    for (const entity of entities) {
      entity.get(Position).x += entity.get(Velocity).x * dt
      entity.get(Position).y += entity.get(Velocity).y * dt
    }
  })
})
```

The 8-phase frame loop (`onBeforeUpdate` → `onUpdate` → `onAfterUpdate` → `onRender`, plus WASM step phases) is fully accessible via composable hooks.

## Next Steps

- [Quick Start](/guide/quick-start) — scaffold and run your first game
- [Installation](/guide/installation) — manual setup guide
- [Project Structure](/guide/project-structure) — understand the folder layout
