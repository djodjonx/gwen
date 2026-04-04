# Engine Context

GWEN uses an implicit engine context — powered by [`unctx`](https://github.com/unjs/unctx) — to make the active engine instance available to composables without threading it through every function call.

## What Is the Engine Context?

When your code calls `useQuery()`, `useService()`, or any other composable, it needs to know _which_ engine to resolve against. The engine context holds that reference.

The context is **active** in two situations:

1. During the synchronous `setup()` call inside `defineSystem()` and plugin `setup()` hooks.
2. During all 8 frame phases — callbacks registered with `onUpdate`, `onRender`, etc. run inside the context.

Outside these windows, the context is inactive and composables will throw.

## How It Works

When you call `engine.use(plugin)`, GWEN wraps the plugin's `setup()` inside a context call:

```
engine.use(plugin)
  └── ctx.call(engine, () => plugin.setup(api))
        └── useQuery(), useService(), ... all resolve correctly
```

The same wrapping happens for every frame-phase callback. You never manage the context manually.

## `useEngine()`

`useEngine()` is the base composable. It returns the active `GwenEngine` instance directly.

```ts
import { defineSystem, useEngine } from '@gwenjs/core';

const MySystem = defineSystem(() => {
  const engine = useEngine();
  // engine is the active GwenEngine instance
});
```

::: tip
Most developers use higher-level composables instead — `useInput()`, `usePhysics2D()`, `useQuery()`. Reach for `useEngine()` only when building custom plugins or low-level integrations.
:::

## Important Limitation

GWEN uses `unctx` in **sync mode**. This means:

- Only one engine instance can be active in a context at a time.
- Nested `ctx.call()` with a _different_ engine instance will overwrite the outer context.

::: warning Do not create multiple engines
Creating two `GwenEngine` instances and running them concurrently in the same JavaScript context is not supported. Composables will resolve to whichever context was last set, producing silent bugs.
:::

## Outside Setup — `GwenContextError`

Calling a composable at module top-level (outside any setup function) throws a `GwenContextError`:

```ts
// ✅ Correct — inside defineSystem setup
const MySystem = defineSystem(() => {
  const input = useInput(); // context is active here
  onUpdate((dt) => {
    /* ... */
  });
});

// ❌ Wrong — module top-level, no active context
const input = useInput(); // throws GwenContextError
```

::: warning
Do not call composables in module scope, inside `setTimeout`, or inside Promise callbacks that escape the setup phase. If you need deferred access, capture the result during setup and use it later.
:::

```ts
// ✅ Capture during setup, use in callback
const MySystem = defineSystem(() => {
  const input = useInput(); // resolved once, at setup
  onUpdate((dt) => {
    if (input.isDown('Space')) {
      // safe — captured reference
      // ...
    }
  });
});
```
