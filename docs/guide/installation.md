# Installation

## Prerequisites

- **Node.js** 18 or later — [nodejs.org](https://nodejs.org)
- **pnpm** 8 or later — `npm install -g pnpm`

::: info
You do **not** need Rust, `wasm-pack`, or any WASM toolchain. The pre-compiled binaries are bundled inside the `@gwenjs/*` npm packages.
:::

## Create a New Project (Recommended)

The fastest way to get started is the official scaffolding tool:

```sh
pnpm create @gwenjs/create my-game
cd my-game
pnpm install
pnpm dev
```

The create wizard sets up Vite, TypeScript, and an initial scene for you. Skip to [Run gwen prepare](#run-gwen-prepare) when done.

## Manual Setup

If you're integrating GWEN into an existing Vite project, or want full control over the setup, follow these steps.

### 1. Initialize your project

```sh
mkdir my-game && cd my-game
pnpm init
```

### 2. Install core packages

```sh
pnpm add @gwenjs/core @gwenjs/app
pnpm add -D @gwenjs/cli vite typescript
```

### 3. Create `gwen.config.ts`

This is the framework entry point. Place it at the project root:

```typescript
import { defineConfig } from '@gwenjs/app'

export default defineConfig({
  engine: {
    maxEntities: 10_000,
    targetFPS: 60,
  },
  modules: [],
})
```

### 4. Create `src/main.ts`

```typescript
import { createEngine } from '@gwenjs/core'
import config from '../gwen.config'

const engine = await createEngine(config)
engine.start()
```

### 5. Create `index.html`

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>My Game</title>
  </head>
  <body>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

::: info No `vite.config.ts` needed
GWEN manages Vite internally — like Nuxt does. The CLI reads `gwen.config.ts` and builds the Vite config programmatically. You never create a `vite.config.ts`. Advanced Vite customisation is done via the [`vite:` key in `gwen.config.ts`](/config/vite-extend).
:::

### 6. Add scripts to `package.json`

```json
{
  "scripts": {
    "dev": "gwen dev",
    "build": "gwen build",
    "prepare": "gwen prepare"
  }
}
```

## Add Modules

Use the `gwen add` command to add a module. It installs the package with your detected package manager **and** registers it in `gwen.config.ts` automatically:

```sh
gwen add @gwenjs/input
gwen add @gwenjs/physics2d
gwen add @gwenjs/renderer-canvas2d
```

You can also pass `--dev` to install as a dev dependency:

```sh
gwen add @gwenjs/debug --dev
```

See the [Plugins reference](/plugins/) for the full list of official modules and their options.

## Run gwen prepare

After setting up your config, run:

```sh
pnpm gwen prepare
```

This generates service type declarations in `.gwen/` and merges them into `GwenDefaultServices`. From this point on, all `useService()` calls are fully typed with no manual casting required.

::: tip
Add `.gwen/` to your `.gitignore` — it is a generated artifact and should be regenerated locally by each developer.
:::

## Next Steps

- [Quick Start](/guide/quick-start) — walk through your first game
- [Project Structure](/guide/project-structure) — understand the folder layout
- [CLI Reference](/cli/overview) — full `gwen` CLI documentation
