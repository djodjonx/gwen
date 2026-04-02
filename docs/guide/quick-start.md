# Quick Start

Get a GWEN project running in under five minutes.

## Prerequisites

- **Node.js** 18 or later
- **pnpm** 8 or later (`npm install -g pnpm`)

::: info No Rust required
The Rust/WASM binaries ship pre-compiled inside the npm packages. You don't need a Rust toolchain.
:::

## Create a Project

Scaffold a new project with the official create tool:

```sh
pnpm create @gwenjs/create my-game
```

The CLI will ask a few questions (project name, renderer, starter template) and generate a ready-to-run project in the `my-game/` directory.

## Install & Run

```sh
cd my-game
pnpm install
pnpm dev
```

Open `http://localhost:5173` in your browser. The dev server supports hot module replacement for all TypeScript files, and hot WASM reload when plugins are updated.

## Project Structure

After scaffolding, your project will look like this:

```
my-game/
├── src/
│   ├── components/      # Component schemas (defineComponent)
│   ├── prefabs/         # Entity templates (definePrefab)
│   ├── scenes/          # Scene definitions (defineScene)
│   ├── systems/         # Game logic (defineSystem)
│   ├── ui/              # UI layers (defineUI)
│   └── main.ts          # Engine bootstrap
├── gwen.config.ts        # Framework entry point
├── package.json
└── tsconfig.json
```

See [Project Structure](/guide/project-structure) for a full explanation of each folder.

## Write Your First System

Systems are the building blocks of game logic. Open `src/systems/movement.ts`:

```typescript
import { defineSystem, onUpdate, useQuery } from '@gwenjs/core'
import { Position, Velocity } from '../components'

export const movementSystem = defineSystem(() => {
  // Composables are resolved once at setup, not every frame
  const entities = useQuery([Position, Velocity])

  onUpdate((dt) => {
    for (const entity of entities) {
      entity.get(Position).x += entity.get(Velocity).x * dt
      entity.get(Position).y += entity.get(Velocity).y * dt
    }
  })
})
```

Then register it in your scene or `main.ts`:

```typescript
engine.use(movementSystem)
```

## Add a Module

Modules extend the engine with services like input, physics, audio, and rendering. Run `gwen add` to install a module and register it in `gwen.config.ts` automatically:

```sh
gwen add @gwenjs/input
```

Now `useInput()` is available inside any system.

## Run gwen prepare

After adding or changing plugins, run:

```sh
pnpm gwen prepare
```

This generates TypeScript declarations in `.gwen/` that extend `GwenDefaultServices` — so every `useService()` call returns the correct type automatically, with no manual casting.

::: tip
Run `gwen prepare` once after scaffolding, and again whenever you add or remove a plugin.
:::

## Next Steps

- [Core Concepts](/core/architecture) — ECS, components, queries, scenes
- [Plugins](/plugins/) — full plugin reference
- [CLI Reference](/cli/overview) — `gwen dev`, `gwen build`, `gwen prepare`
- [API Reference](/api/overview) — TypeScript API docs
