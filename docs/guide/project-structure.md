# Project Structure

When you scaffold a project with `pnpm create @gwenjs/create`, you get a well-organized layout designed to scale from a game jam prototype to a full production title.

## Overview

```
my-game/
├── src/
│   ├── components/      # Component schemas
│   ├── prefabs/         # Entity templates
│   ├── scenes/          # Scene definitions
│   ├── systems/         # Game logic
│   ├── ui/              # UI layers
│   └── main.ts          # Engine bootstrap
├── .gwen/               # Generated — do not edit
├── gwen.config.ts        # Framework entry point
├── vite.config.ts        # Vite + @gwenjs/vite plugin
├── package.json
└── tsconfig.json
```

## Source Folders

### `src/components/`

Component schemas defined with `defineComponent()`. A component is a plain data type — no logic, just structure. Every entity property that needs to participate in ECS queries lives here.

```
src/components/
├── position.ts
├── velocity.ts
└── index.ts    # re-exports all components
```

### `src/prefabs/`

Entity templates created with `definePrefab()`. A prefab bundles a set of components and default values into a reusable factory. Prefer prefabs over calling `createEntity()` directly — they keep entity creation consistent and type-safe.

```
src/prefabs/
├── player.ts
├── enemy.ts
└── index.ts
```

### `src/scenes/`

Scene definitions created with `defineScene()`. A scene declares which systems are active, which entities are spawned on load, and how the scene transitions to other scenes.

```
src/scenes/
├── game.ts
├── menu.ts
└── index.ts
```

### `src/systems/`

Game logic lives here, organized into `defineSystem()` files. Each system subscribes to a set of components via `useQuery()` and registers frame-phase callbacks (`onUpdate`, `onRender`, etc.).

```
src/systems/
├── movement.ts
├── collision.ts
├── player-input.ts
└── index.ts
```

### `src/ui/`

UI layer definitions created with `defineUI()`. GWEN's UI system renders HTML/CSS overlays via the `@gwenjs/ui` plugin, keeping game-world rendering and UI rendering cleanly separated.

```
src/ui/
├── hud.ts
├── menu.ts
└── index.ts
```

### `src/main.ts`

The engine bootstrap. This file creates the engine from your config and starts the game loop:

```typescript
import { createEngine } from '@gwenjs/core'
import config from '../gwen.config'

const engine = await createEngine(config)
engine.start()
```

## Config & Tooling Files

### `gwen.config.ts`

The single entry point for all framework configuration: target FPS, max entities, WASM modules, and the plugin list. See [Installation](/guide/installation) for a full example.

### `vite.config.ts`

Standard Vite config with the `@gwenjs/vite` plugin added. The plugin handles WASM asset loading, hot-reload for WASM binaries, and the manifest used by `gwen build`.

## The `.gwen/` Directory

Running `gwen prepare` generates this directory. It contains auto-generated TypeScript declarations that extend `GwenDefaultServices` with the types for each registered plugin's service API.

::: warning Do not edit `.gwen/` manually
Its contents are fully regenerated every time you run `gwen prepare`. Add it to `.gitignore`.
:::

```
.gwen/
└── types/
    └── services.d.ts    # Auto-generated service types
```

Once generated, service types flow through the entire codebase automatically — `useService('physics')` returns the `Physics2DAPI` type with no casting required.

## Conventions

- **One export per file** — each component, system, prefab, and scene lives in its own file and is re-exported from an `index.ts` in its folder.
- **Prefabs over raw entity creation** — always use `definePrefab` + `engine.instantiate(prefab)` for complex entities.
- **Systems are stateless** — composable state lives in the composables (`useQuery`, `useService`), not in module-level variables.

## Next Steps

- [Core Concepts](/core/architecture) — deep dive into ECS, scenes, and the frame loop
- [Plugins](/plugins/) — add capabilities to your engine
- [CLI Reference](/cli/overview) — `gwen dev`, `gwen build`, `gwen prepare`
