# Plugins

Plugins are the primary way to extend GWEN's runtime. Every official capability — physics, input, audio, rendering, UI — ships as an independent plugin. You compose the engine you need by registering only what your game uses.

## What Are Plugins?

A plugin implements the `GwenPlugin` interface: a `setup()` function that runs once when the engine initialises, and an optional `teardown()` for cleanup. During setup, plugins can:

- Register **services** (accessible anywhere via `useService()`)
- Subscribe to **frame-phase hooks** (`onUpdate`, `onRender`, etc.)
- Expose **composables** (`useInput()`, `usePhysics2D()`, …)
- Mount **WASM modules** into shared memory

Plugin code never runs at module-import time — only when the engine starts. This keeps startup deterministic and testable.

## Official Plugins

| Package | Purpose | Service key(s) |
|---------|---------|----------------|
| [`@gwenjs/input`](/plugins/input) | Keyboard, mouse, gamepad | `keyboard`, `mouse`, `gamepad`, `inputMapper` |
| [`@gwenjs/audio`](/plugins/audio) | Web Audio API wrapper | `audio` |
| [`@gwenjs/renderer-canvas2d`](/plugins/renderer-canvas2d) | Canvas2D renderer | `renderer` |
| [`@gwenjs/physics2d`](/plugins/physics2d) | 2D rigid-body physics (WASM) | `physics` |
| [`@gwenjs/physics3d`](/plugins/physics3d) | 3D physics (WASM) | `physics3d` |
| [`@gwenjs/sprite-anim`](/plugins/sprite-anim) | Sprite sheet animation | `spriteAnim` |
| [`@gwenjs/ui`](/plugins/ui) | HTML/CSS overlay UI | `ui` |
| [`@gwenjs/r3f`](/plugins/r3f) | React Three Fiber adapter | `r3f` |
| [`@gwenjs/debug`](/plugins/debug) | Debug overlay | `debug` |
| [`@gwenjs/vite`](/plugins/vite) | Vite build plugin | — (build-time) |

## Registering Plugins

Plugins fall into two categories in `gwen.config.ts`:

- **`plugins`** — standard TypeScript runtime plugins
- **`wasm`** — WASM modules (physics engines, custom native modules)

```typescript
// gwen.config.ts
import { defineConfig } from '@gwenjs/app'
import { InputPlugin } from '@gwenjs/input'
import { AudioPlugin } from '@gwenjs/audio'
import { Canvas2DRenderer } from '@gwenjs/renderer-canvas2d'
import { physics2D } from '@gwenjs/physics2d'
import { DebugPlugin } from '@gwenjs/debug'

export default defineConfig({
  core: {
    maxEntities: 10_000,
    targetFPS: 60,
  },
  wasm: [
    physics2D({ gravity: 9.81 }),
  ],
  plugins: [
    new InputPlugin(),
    new AudioPlugin(),
    new Canvas2DRenderer({ width: 800, height: 600 }),
    import.meta.env.DEV && new DebugPlugin(),
  ].filter(Boolean),
})
```

## Using Services

Once a plugin is registered, its service is available via `useService()` inside any `defineSystem` or `defineScene`:

```typescript
import { defineSystem, useService, onUpdate } from '@gwenjs/core'

export const audioSystem = defineSystem(() => {
  const audio = useService('audio')

  onUpdate(() => {
    if (someCondition) audio.play('coin-collect')
  })
})
```

Run `gwen prepare` (or keep `pnpm dev` running) to regenerate `.gwen/` type declarations. After that, every `useService('audio')` call returns the precise `AudioService` type — no casts needed.

::: tip Zero-config types
Service types flow from your config into `GwenDefaultServices` automatically after `gwen prepare`. You never need to write `as AudioService`.
:::

## Community Plugins

You can build and publish your own plugins using the same `GwenPlugin` interface. See the [Plugin Authoring guide](/kit/overview) for the full API contract and conventions.
