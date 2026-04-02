# Vite Plugin

**Package:** `@gwenjs/vite`
**Type:** Framework internal — used by the GWEN CLI, not installed by users

::: warning Not for user installation
`@gwenjs/vite` is an internal dependency of `@gwenjs/cli`. Game developers and plugin authors **never** install or import it directly. GWEN manages Vite entirely through `gwen.config.ts`. This page is for **framework contributors** only.
:::

The GWEN CLI runs Vite with `configFile: false` and builds the Vite configuration programmatically from your `gwen.config.ts`. There is no `vite.config.ts` in a GWEN project.

## What it does

`@gwenjs/vite` provides the internal Vite plugin that the CLI injects automatically when running `gwen dev` or `gwen build`:

- **WASM hot-reload** — reloads `.wasm` binaries during `gwen dev` without a full page refresh
- **Auto-import transform** — injects `as const` assertions and resolves composable imports from `gwen.config.ts` modules
- **Build optimization** — configures Rollup/Rolldown to bundle and hash `.wasm` files correctly for production
- **`SharedArrayBuffer` headers** — sets the required COOP/COEP headers in dev and preview servers automatically

## Extending Vite from `gwen.config.ts`

If you need to extend the Vite configuration (advanced cases only), use the `vite:` key in `gwen.config.ts`:

```ts
import { defineConfig } from '@gwenjs/app'

export default defineConfig({
  modules: ['@gwenjs/input'],
  vite: {
    // extend Vite config here
    define: { '__MY_FLAG__': 'true' },
    build: { target: 'esnext' },
  },
})
```

See [Extending Vite](/config/vite-extend) for the full guide.

## Module-level Vite plugins

Modules can register additional Vite plugins via `kit.addVitePlugin()` inside their `setup()`. This is the correct place for third-party integrations (e.g. React, Solid) rather than a user-facing `vite.config.ts`.

## WASM hot-reload

During `gwen dev`, the plugin watches `*.wasm` files for changes. When a binary is updated (e.g., after a Rust recompile), the engine reloads the affected module in place — no full page refresh, game state is preserved where possible.

```
[gwen] WASM hot-reload: physics2d.wasm updated → reloading module
```

## Related

- [Extending Vite](/config/vite-extend) — how to customise Vite from `gwen.config.ts`
- [Extending Vite](/config/vite-extend) — how to customise Vite from `gwen.config.ts`
- [Physics 2D](/plugins/physics2d) — WASM module that benefits from hot-reload in dev
- [Debug Plugin](/plugins/debug) — `import.meta.env.DEV` is injected at build time
