# Kit Overview

## What is @gwenjs/kit?

`@gwenjs/kit` is the **authoring toolkit** for building GWEN extensions. It gives you the primitives to create runtime plugins and build-time modules that integrate cleanly with the GWEN engine and toolchain.

::: tip Who is this for?
`@gwenjs/kit` is for **plugin and module authors** — people building reusable extensions for the GWEN ecosystem. If you're writing a game, you want [`@gwenjs/core`](/core/architecture) instead.
:::

```bash
npm install @gwenjs/kit
# or
pnpm add @gwenjs/kit
```

---

## Two Kinds of Extensions

GWEN extensions come in two forms, and you'll often build both together.

### Runtime Plugins

Runtime plugins run **in the browser** as part of the game loop. They can:

- Implement game-loop logic (per-frame updates, event handling)
- Expose typed service APIs to game code
- Bridge a compiled `.wasm` binary to the engine's shared memory

Use [`definePlugin()`](./typescript-plugin) to create a runtime plugin.

```ts
import { definePlugin } from '@gwenjs/kit';

export const myPlugin = definePlugin({
  name: 'my-plugin',
  setup(engine) {
    engine.provide('myService', {
      /* ... */
    });
  },
});
```

### Build-Time Modules

Build-time modules run **in Node.js** during `gwen prepare` and `gwen build`. They can:

- Install one or more runtime plugins
- Register auto-imports so game code doesn't need manual `import` statements
- Add type declaration templates that feed into `GwenDefaultServices`

Use [`defineGwenModule()`](./typescript-plugin#wrapping-with-a-module) to create a build-time module.

```ts
import { defineGwenModule } from '@gwenjs/kit';

export default defineGwenModule({
  meta: { name: 'my-module' },
  setup(options, kit) {
    kit.addPlugin(myPlugin);
    kit.addAutoImport({ from: 'my-package', imports: ['useMyService'] });
  },
});
```

---

## When to Use the Kit

Reach for `@gwenjs/kit` when you are:

- **Building a reusable plugin** for distribution on npm
- **Creating a game engine extension** — physics adapter, renderer, input handler, audio backend
- **Wrapping a WASM binary** — compiling Rust logic and exposing it to game code via a typed TypeScript API
- **Integrating a third-party library** — wrapping it in a plugin so it participates in the engine lifecycle

You do _not_ need the kit to write a game. Game code uses `@gwenjs/core` directly.

---

## Kit vs Core

|                      | `@gwenjs/kit`                      | `@gwenjs/core`                                |
| -------------------- | ---------------------------------- | --------------------------------------------- |
| **Audience**         | Plugin / module authors            | Game developers                               |
| **Primary APIs**     | `definePlugin`, `defineGwenModule` | `defineSystem`, `defineScene`, `createEngine` |
| **Runtime**          | Browser + Node.js (modules)        | Browser only                                  |
| **Publishes to npm** | Yes — reusable packages            | No — game-specific                            |

Don't import game primitives like `defineSystem` or `defineScene` from `@gwenjs/kit` — those live in `@gwenjs/core` and are for game code. Your plugin's `setup()` receives the engine instance and should work through it.

---

## Next Steps

- [Building a TypeScript Plugin](./typescript-plugin) — pure TS plugins, services, and sub-plugin composition
- [Building a WASM Plugin](./wasm-plugin) — loading `.wasm` binaries and wiring shared memory
- [WASM Shared Memory](./shared-memory) — `WasmRegionView`, `WasmRingBuffer`, alignment, and performance
