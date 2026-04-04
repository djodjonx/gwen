# Configuration

GWEN projects are configured through a single `gwen.config.ts` file at the project root. The CLI and Vite plugin both read this file to set up your game.

## The config file

```ts
// gwen.config.ts
import { defineConfig } from '@gwenjs/app';

export default defineConfig({
  // ...
});
```

The file must be at the project root and export a default config object. Both `gwen dev` and `gwen build` automatically locate it there. You can override the path with `--config`.

## `defineConfig()`

`defineConfig` is imported from `@gwenjs/app`. It provides full TypeScript inference and IntelliSense across all config fields — no manual type casting required.

## Engine options

```ts
engine: {
  maxEntities: 10_000,      // default
  targetFPS: 60,            // default
  variant: 'physics2d',     // 'light' | 'physics2d' | 'physics3d'
  loop: 'internal',         // 'internal' | 'external'
  maxDeltaSeconds: 0.1,     // default
}
```

| Option            | Type                                    | Default      | Description                            |
| ----------------- | --------------------------------------- | ------------ | -------------------------------------- |
| `maxEntities`     | `number`                                | `10_000`     | ECS entity pool size allocated in WASM |
| `targetFPS`       | `number`                                | `60`         | Target frame rate for the game loop    |
| `variant`         | `'light' \| 'physics2d' \| 'physics3d'` | `'light'`    | WASM core variant to load              |
| `loop`            | `'internal' \| 'external'`              | `'internal'` | Frame loop driver                      |
| `maxDeltaSeconds` | `number`                                | `0.1`        | Maximum clamped delta time per frame   |

## Modules

Modules are the primary way to add capabilities to GWEN. Each entry is either a package name string (no options) or a `[name, options]` tuple:

```ts
export default defineConfig({
  modules: [
    '@gwenjs/input', // string = no options
    '@gwenjs/audio',
    ['@gwenjs/physics2d', { gravity: 9.81 }], // tuple = with options
    ['@gwenjs/renderer-canvas2d', { width: 800, height: 600 }],
  ],
});
```

::: tip
Order matters. Modules are initialised in array order. Place rendering modules after logic modules.
:::

## Advanced: direct plugin registration

For cases where you need to directly register a `GwenPlugin` instance (without a module wrapper), use `plugins: []`:

```ts
export default defineConfig({
  plugins: [myCustomPlugin],
});
```

This is an advanced escape hatch. For all official `@gwenjs/*` packages, use `modules: []` instead.

## Hooks

```ts
export default defineConfig({
  hooks: {
    'build:before': async (ctx) => {
      console.log('Build starting…', ctx);
    },
    'prepare:done': async (ctx) => {
      console.log('Types generated at', ctx.outDir);
    },
  },
});
```

Hooks let you tap into the GWEN build lifecycle. They are async and receive a context object with build metadata.

See [Extending Vite](./vite-extend.md) for extending Vite build behavior via hooks.

## Full example

```ts
import { defineConfig } from '@gwenjs/app';

export default defineConfig({
  engine: {
    maxEntities: 5_000,
    targetFPS: 60,
  },

  modules: [
    '@gwenjs/input',
    ['@gwenjs/renderer-canvas2d', { width: 800, height: 600 }],
    ['@gwenjs/physics2d', { gravity: 9.81 }],
    '@gwenjs/audio',
    ...(import.meta.env.DEV ? ['@gwenjs/debug'] : []),
  ],

  hooks: {
    'build:before': async (ctx) => {
      console.log('Building GWEN project…');
    },
  },
});
```
