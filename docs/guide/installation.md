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

The create wizard sets up Vite, TypeScript, the GWEN Vite plugin, and an initial scene for you. Skip to [Run gwen prepare](#run-gwen-prepare) when done.

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
pnpm add -D @gwenjs/vite vite typescript
```

### 3. Create `gwen.config.ts`

This is the framework entry point. Place it at the project root:

```typescript
import { defineConfig } from '@gwenjs/app'

export default defineConfig({
  core: {
    maxEntities: 10_000,
    targetFPS: 60,
  },
  plugins: [],
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

### 6. Create `vite.config.ts`

The `@gwenjs/vite` plugin handles WASM loading and hot-reload:

```typescript
import { defineConfig } from 'vite'
import gwen from '@gwenjs/vite'

export default defineConfig({
  plugins: [gwen()],
})
```

### 7. Add scripts to `package.json`

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "prepare": "gwen prepare"
  }
}
```

## Install Plugins

Install only the plugins your game needs. Each plugin is a separate package:

```sh
pnpm add @gwenjs/input @gwenjs/physics2d @gwenjs/renderer-canvas2d
```

Then register them in `gwen.config.ts`:

```typescript
import { InputPlugin } from '@gwenjs/input'
import { Physics2D } from '@gwenjs/physics2d'
import { Canvas2DRenderer } from '@gwenjs/renderer-canvas2d'

export default defineConfig({
  plugins: [
    new InputPlugin(),
    new Physics2D({ gravity: 9.81 }),
    new Canvas2DRenderer({ width: 800, height: 600 }),
  ],
})
```

See the [Plugins reference](/plugins/) for the full list of official plugins and their options.

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
