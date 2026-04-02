# Extending Vite

GWEN's Vite integration lives in `@gwenjs/vite`. It must be present in your `vite.config.ts` for the dev server and build pipeline to work correctly.

## The @gwenjs/vite plugin

`gwenPlugin()` is a standard Vite plugin that provides:

- **WASM hot-reload** — reloads `.wasm` binaries during `gwen dev` without a full page refresh
- **Auto-import transform** — injects `as const` assertions and resolves composable imports from `gwen.config.ts` modules
- **Build optimization** — configures Rollup/Rolldown to bundle and hash `.wasm` files correctly for production

## Minimal vite.config.ts

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { gwenPlugin } from '@gwenjs/vite'

export default defineConfig({
  plugins: [
    gwenPlugin(),
  ],
})
```

This is all you need to get started. `gwenPlugin()` reads your `gwen.config.ts` automatically.

## Plugin options

```ts
gwenPlugin({
  wasmDir: 'public/wasm',       // directory to scan for .wasm files
  autoImports: true,             // enable auto-import transform (default: true)
  configFile: 'gwen.config.ts', // path to gwen config (default: project root)
})
```

| Option | Type | Default | Description |
|---|---|---|---|
| `wasmDir` | `string` | `'public/wasm'` | Directory watched for WASM hot-reload |
| `autoImports` | `boolean` | `true` | Enables composable auto-import transform |
| `configFile` | `string` | `'gwen.config.ts'` | Path to the GWEN config file |

## Customizing Vite

`gwenPlugin()` is a regular Vite plugin — you can combine it freely with any other Vite plugins or config options:

```ts
import { defineConfig } from 'vite'
import { gwenPlugin } from '@gwenjs/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    gwenPlugin(),
    react(), // add other plugins alongside
  ],
  build: {
    target: 'esnext',
    outDir: 'dist',
  },
  server: {
    port: 3000,
  },
})
```

::: tip
You don't need to configure WASM MIME types or `SharedArrayBuffer` headers manually — `gwenPlugin()` handles both for dev and production.
:::

## WASM hot-reload

During `gwen dev`, the plugin watches the `wasmDir` for `.wasm` file changes. When a binary is updated (e.g., after a Rust recompile), the engine reloads the affected module in place — no full page refresh, game state is preserved where possible.

```
[gwen] WASM hot-reload: physics2d.wasm updated → reloading module
```

To trigger a manual reload in your own tooling, emit the `gwen:wasm-update` HMR event with the module name.

## Hooks via gwen.config.ts

Some Vite build behavior can be extended through lifecycle hooks in `gwen.config.ts` rather than in `vite.config.ts`. This keeps GWEN-specific logic separate from generic Vite config:

```ts
// gwen.config.ts
export default defineConfig({
  hooks: {
    'build:before': async (ctx) => {
      // Runs before Vite starts the production build
      await generateAssetManifest()
    },
    'build:done': async (ctx) => {
      // Runs after Vite finishes — ctx.outDir has the output path
      await uploadToCdn(ctx.outDir)
    },
  },
})
```

See the [Configuration overview](./overview.md#hooks) for the full list of available hook keys.
