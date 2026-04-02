# Vite Plugin

**Package:** `@gwenjs/vite`
**Type:** Build-time Vite plugin — not a runtime plugin, not registered in `gwen.config.ts`

Vite plugin that enables first-class GWEN support in a Vite project: WASM hot-reload during development, AST-based code transforms, and an optimised WASM build cache. Compatible with both Rollup and Rolldown bundlers.

## Install

```bash
pnpm add @gwenjs/vite --save-dev
```

## Register

Add `gwenPlugin()` to your `vite.config.ts` — this is separate from your `gwen.config.ts`:

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { gwenPlugin } from '@gwenjs/vite'

export default defineConfig({
  plugins: [
    gwenPlugin(),
  ],
})
```

That is all that is required for a standard project scaffolded with `create-gwen-app`. Advanced options are documented below.

## Features

### WASM hot-reload

In `vite dev`, the plugin watches `*.wasm` files (including those rebuilt by `cargo watch`) via Chokidar. When a WASM binary changes on disk it triggers a minimal HMR update — only the affected WASM module is reloaded, not the full page.

### `gwenTransform`

An AST-based transform pass powered by [oxc-parser](https://oxc.rs/). It runs on every `.ts` / `.tsx` file in the project and handles:

- **Auto-import injection** — `defineSystem`, `defineScene`, `useService`, and other GWEN composables are injected automatically if used but not explicitly imported.
- **`as const` hoisting** — component schema literals and config objects are transformed to `as const` at compile time, enabling full literal-type inference without hand-annotating every object.

### WASM build cache

During production builds, WASM binaries are base64-encoded and inlined. The plugin caches the encoding step keyed by the binary's hash, so rebuilds only re-encode changed modules.

### `gwen prepare` integration

Running `gwen prepare` (or starting `pnpm dev`) invokes the plugin's type-generation pipeline to write `.gwen/*.d.ts`. The Vite plugin wires this into the dev-server startup sequence automatically — you rarely need to run `gwen prepare` manually.

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `configPath` | `string` | `'gwen.config.ts'` | Path to your `gwen.config.ts` relative to `vite.root`. |
| `wasmDirs` | `string[]` | `['node_modules/@gwenjs']` | Directories watched for `.wasm` changes in dev mode. |
| `hotReload` | `boolean` | `true` | Enable WASM hot-reload in dev mode. |
| `transform` | `boolean \| GwenTransformOptions` | `true` | Enable/configure the `gwenTransform` AST pass. |
| `autoImport` | `boolean` | `true` | Inject missing GWEN imports automatically (part of transform). |
| `inlineWasm` | `boolean` | `true` | Base64-inline WASM in production builds. Set `false` to emit separate `.wasm` files. |
| `wasmCacheDir` | `string` | `'.gwen/cache'` | Directory for the WASM encoding cache. |

### `GwenTransformOptions`

```typescript
interface GwenTransformOptions {
  autoImport?:    boolean   // default true
  asConstHoist?:  boolean   // default true
  include?:       string[]  // glob patterns to include (default: ['**/*.ts', '**/*.tsx'])
  exclude?:       string[]  // glob patterns to exclude
}
```

## Example

```typescript
// vite.config.ts — typical project setup
import { defineConfig } from 'vite'
import { gwenPlugin } from '@gwenjs/vite'
import react from '@vitejs/plugin-react'   // only if using @gwenjs/r3f

export default defineConfig({
  plugins: [
    gwenPlugin({
      wasmDirs:  ['node_modules/@gwenjs', 'crates/'],
      inlineWasm: false,   // emit separate .wasm files for better caching
    }),
    react(),
  ],
  server: {
    headers: {
      // Required for SharedArrayBuffer (WASM shared memory)
      'Cross-Origin-Opener-Policy':   'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
```

::: warning COOP/COEP headers required
`SharedArrayBuffer` — used by GWEN's zero-copy WASM memory — requires the `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers on the document. The example above shows how to set them in the Vite dev server. For production, configure them on your CDN or server.
:::

## Related

- [Extending Vite](/config/vite-extend) — full guide to advanced Vite configuration for GWEN
- [Physics 2D](/plugins/physics2d) — WASM module that benefits from hot-reload in dev
- [Debug Plugin](/plugins/debug) — `import.meta.env.DEV` is injected by this plugin
