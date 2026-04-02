# Building a TypeScript Plugin

## Overview

A **pure TypeScript plugin** is the simplest kind of GWEN extension — no Rust, no `.wasm`, no native dependencies. It runs in the browser as part of the engine lifecycle, optionally exposes a typed service API to game code, and can compose other plugins beneath it.

Start here before reaching for the [WASM plugin pattern](./wasm-plugin).

---

## `definePlugin()`

```ts
import { definePlugin } from '@gwenjs/kit'

const plugin = definePlugin({
  name: 'my-plugin',          // unique name, kebab-case
  setup(engine) { /* ... */ },
  teardown?(engine) { /* ... */ },
})
```

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | ✓ | Unique identifier for this plugin |
| `setup` | `(engine: EngineContext) => void` | ✓ | Called once when the engine starts |
| `teardown` | `(engine: EngineContext) => void` | — | Called when the engine shuts down |

The `engine` parameter passed to `setup` and `teardown` is the live engine context. Use it to provide services, install sub-plugins, and subscribe to frame hooks.

---

## Providing a Service

Inside `setup()`, call `engine.provide(name, service)` to expose an API that game code can consume.

```ts
import { definePlugin } from '@gwenjs/kit'

interface ScoreService {
  get(): number
  add(points: number): void
  reset(): void
}

export const scorePlugin = definePlugin({
  name: 'score',
  setup(engine) {
    let score = 0

    const service: ScoreService = {
      get: () => score,
      add: (points) => { score += points },
      reset: () => { score = 0 },
    }

    engine.provide('score', service)
  },
})
```

After running `gwen prepare`, game code gets a typed `useService('score')` with no manual casting:

```ts
// game code (not plugin code)
const score = useService('score')
score.add(10)
```

::: info Type generation
Service types flow into `GwenDefaultServices` automatically when you [wrap your plugin in a module](#wrapping-with-a-module) and add a type template via `kit.addTypeTemplate()`. You never write `as ScoreService` by hand.
:::

---

## Registering Sub-Plugins

A plugin can install other plugins during its own `setup()` by calling `engine.use()`. This lets you compose complex functionality from smaller, focused pieces.

```ts
import { definePlugin } from '@gwenjs/kit'
import { storagePlugin } from './storage-plugin'
import { analyticsPlugin } from './analytics-plugin'

export const telemetryPlugin = definePlugin({
  name: 'telemetry',
  setup(engine) {
    // install dependencies first
    engine.use(storagePlugin)
    engine.use(analyticsPlugin)

    // then set up this plugin's own logic
    engine.provide('telemetry', {
      track(event: string) { /* ... */ },
    })
  },
})
```

Sub-plugins are deduplicated by name — installing the same plugin twice is safe.

---

## Teardown

Use the optional `teardown` hook to clean up resources when the engine stops: remove event listeners, cancel timers, close connections.

```ts
export const clockPlugin = definePlugin({
  name: 'clock',
  setup(engine) {
    const interval = setInterval(() => tick(), 1000)

    engine.provide('clock', {
      now: () => Date.now(),
    })

    // store cleanup reference somewhere accessible to teardown
    ;(engine as any).__clockInterval = interval
  },
  teardown(engine) {
    clearInterval((engine as any).__clockInterval)
  },
})
```

::: tip
Avoid side-effectful globals in teardown. Prefer storing cleanup references on a plugin-scoped object or closure variable, not on the engine instance.
:::

---

## Complete Example: ScorePlugin

```ts
// packages/score/src/index.ts
import { definePlugin } from '@gwenjs/kit'

export interface ScoreService {
  get(): number
  add(points: number): void
  reset(): void
  onScoreChange(listener: (score: number) => void): () => void
}

export const scorePlugin = definePlugin({
  name: 'score',
  setup(engine) {
    let score = 0
    const listeners = new Set<(score: number) => void>()

    const notify = () => listeners.forEach((fn) => fn(score))

    const service: ScoreService = {
      get: () => score,
      add(points) {
        score += points
        notify()
      },
      reset() {
        score = 0
        notify()
      },
      onScoreChange(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    }

    engine.provide('score', service)
  },
})
```

---

## Packaging for Distribution

Export the plugin from your package's main entry point:

```ts
// packages/score/src/index.ts
export { scorePlugin } from './plugin'
export type { ScoreService } from './plugin'
```

Game developers install your plugin with:

```sh
gwen add @my-org/gwen-score
```

This installs the package and registers it in their `gwen.config.ts` automatically.

---

## Wrapping with a Module

For the best developer experience — auto-imports and generated types — wrap your plugin in a `defineGwenModule`. This runs at build time and tells `gwen prepare` what to generate.

```ts
// packages/score/src/module.ts
import { defineGwenModule } from '@gwenjs/kit'
import { scorePlugin } from './plugin'
import type { ScoreService } from './plugin'

export default defineGwenModule({
  meta: { name: 'score' },
  setup(_options, kit) {
    // install the runtime plugin
    kit.addPlugin(scorePlugin)

    // add auto-imports so game code can write `useService('score')` without imports
    kit.addAutoImport({
      from: '@my-org/gwen-score',
      imports: ['scorePlugin'],
    })

    // generate type augmentation for GwenDefaultServices
    kit.addTypeTemplate({
      filename: 'types/score.d.ts',
      getContents: () => `
        import type { ScoreService } from '@my-org/gwen-score'
        declare module '@gwenjs/core' {
          interface GwenDefaultServices {
            score: ScoreService
          }
        }
      `,
    })
  },
})
```

Users then reference the module in `gwen.config.ts` instead of the raw plugin, and `gwen prepare` handles the rest.

---

## Next Steps

- [Building a WASM Plugin](./wasm-plugin) — add a Rust simulation layer beneath your TypeScript plugin
- [WASM Shared Memory](./shared-memory) — understand `WasmRegionView` and `WasmRingBuffer` before writing WASM plugins
