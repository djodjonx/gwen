# Extending Vite

GWEN manages Vite internally — there is no `vite.config.ts` in a GWEN project. The CLI reads `gwen.config.ts` and builds the Vite configuration programmatically. For advanced use cases, you can extend that configuration via the `vite:` key in `gwen.config.ts`.

## The `vite:` key

```ts
import { defineConfig } from '@gwenjs/app';

export default defineConfig({
  modules: ['@gwenjs/input'],
  vite: {
    // extend Vite config here (for advanced cases)
    define: { __MY_FLAG__: 'true' },
    build: {
      target: 'esnext',
      outDir: 'dist',
    },
    server: {
      port: 3000,
    },
  },
});
```

The `vite:` object is deep-merged with the configuration the CLI generates. You can override most Vite options here, but GWEN-managed settings (WASM loading, COOP/COEP headers, HMR) are always applied regardless.

::: tip
Most projects never need the `vite:` key. Reach for it only when you need to customise the Vite build pipeline beyond what GWEN configures by default.
:::

## Adding Vite plugins via modules

Modules can register additional Vite plugins via `kit.addVitePlugin()` inside their `setup()`. This is the correct pattern for framework-level integrations (e.g. React, Solid, SVG loading) rather than the `vite:` key:

```ts
// packages/my-module/src/module.ts
import { defineGwenModule } from '@gwenjs/kit';
import react from '@vitejs/plugin-react';

export default defineGwenModule({
  meta: { name: 'my-module' },
  setup(_options, kit) {
    kit.addVitePlugin(react());
  },
});
```

## WASM hot-reload

During `gwen dev`, the CLI watches `.wasm` files for changes. When a binary is updated (e.g., after a Rust recompile), the affected WASM module is hot-reloaded without a full page refresh.

```
[gwen] WASM hot-reload: physics2d.wasm updated → reloading module
```

## Hooks via gwen.config.ts

Some Vite build behavior can be extended through lifecycle hooks in `gwen.config.ts`:

```ts
// gwen.config.ts
export default defineConfig({
  hooks: {
    'build:before': async (ctx) => {
      // Runs before Vite starts the production build
      await generateAssetManifest();
    },
    'build:done': async (ctx) => {
      // Runs after Vite finishes — ctx.outDir has the output path
      await uploadToCdn(ctx.outDir);
    },
  },
});
```

See the [Configuration overview](./overview.md#hooks) for the full list of available hook keys.
