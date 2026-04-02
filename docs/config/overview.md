# Configuration

GWEN projects are configured through a single `gwen.config.ts` file at the project root. The CLI and Vite plugin both read this file to set up your game.

## The config file

```ts
// gwen.config.ts
import { defineConfig } from '@gwenjs/app'

export default defineConfig({
  // ...
})
```

The file must be at the project root and export a default config object. Both `gwen dev` and `gwen build` automatically locate it there. You can override the path with `--config`.

## `defineConfig()`

`defineConfig` is imported from `@gwenjs/app`. It provides full TypeScript inference and IntelliSense across all config fields — no manual type casting required.

## Core options

```ts
core: {
  maxEntities: 10_000, // default
  targetFPS: 60,       // default
  debug: false,        // default
}
```

| Option | Type | Default | Description |
|---|---|---|---|
| `maxEntities` | `number` | `10_000` | ECS entity pool size allocated in WASM |
| `targetFPS` | `number` | `60` | Target frame rate for the game loop |
| `debug` | `boolean` | `false` | Enables verbose logging and debug overlays |

## Plugins

```ts
import { InputPlugin } from '@gwenjs/input'
import { Canvas2DRenderer } from '@gwenjs/renderer-canvas2d'

export default defineConfig({
  plugins: [
    new InputPlugin(),
    new Canvas2DRenderer({ width: 800, height: 600 }),
  ],
})
```

Plugins are runtime instances that run in the browser. They integrate with the 8-phase frame loop and can expose services via `useMyService()` composables.

::: tip
Order matters. Plugins are initialized in array order. Place rendering plugins after logic plugins.
:::

## WASM modules

```ts
import { physics2D } from '@gwenjs/physics2d'

export default defineConfig({
  wasm: [
    physics2D({ gravity: 9.81 }),
  ],
})
```

WASM modules are separate `.wasm` binaries loaded at runtime. They communicate with `gwen-core.wasm` via a `SharedArrayBuffer` — zero-copy, zero JS overhead per frame.

See [Modules & WASM Modules](./modules.md) for loading custom WASM modules and working with shared memory.

## Modules

```ts
import { myBuildModule } from './modules/my-module'

export default defineConfig({
  modules: [
    myBuildModule(),
  ],
})
```

Modules are **build-time** composition roots that run in Node.js during `gwen dev` and `gwen prepare`. They install plugins, register auto-imports, and produce type metadata. They never run in the browser.

See [Modules & WASM Modules](./modules.md) for defining your own modules.

## Hooks

```ts
export default defineConfig({
  hooks: {
    'build:before': async (ctx) => {
      console.log('Build starting…', ctx)
    },
    'prepare:done': async (ctx) => {
      console.log('Types generated at', ctx.outDir)
    },
  },
})
```

Hooks let you tap into the GWEN build lifecycle. They are async and receive a context object with build metadata.

See [Extending Vite](./vite-extend.md) for extending Vite build behavior via hooks.

## Full example

```ts
import { defineConfig } from '@gwenjs/app'
import { physics2D } from '@gwenjs/physics2d'
import { InputPlugin } from '@gwenjs/input'
import { Canvas2DRenderer } from '@gwenjs/renderer-canvas2d'
import { AudioPlugin } from '@gwenjs/audio'
import { DebugPlugin } from '@gwenjs/debug'

export default defineConfig({
  core: {
    maxEntities: 5_000,
    targetFPS: 60,
    debug: true,
  },

  wasm: [
    physics2D({ gravity: 9.81 }),
  ],

  plugins: [
    new InputPlugin(),
    new Canvas2DRenderer({ width: 800, height: 600 }),
    new AudioPlugin(),
    new DebugPlugin(),
  ],

  hooks: {
    'build:before': async (ctx) => {
      console.log('Building GWEN project…')
    },
  },
})
```
