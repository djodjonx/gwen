# Modules & WASM Modules

GWEN distinguishes between two kinds of modules: **build-time modules** (Node.js) and **WASM modules** (runtime binaries). Both are registered in `gwen.config.ts` but serve very different purposes.

## What are modules?

Build-time modules are composition roots that run in **Node.js** — not in the browser. They are called during `gwen dev` and `gwen prepare` to:

- Install plugins programmatically
- Register auto-imports for composables
- Provide type metadata that `gwen prepare` uses to generate `.gwen/types/`

They are the extension point for library authors and kit packages that need to hook into the build pipeline.

## Defining a module

```ts
// modules/my-module.ts
import { defineGwenModule } from '@gwenjs/kit'

export const myModule = defineGwenModule({
  name: 'my-module',
  setup(options, kit) {
    kit.addPlugin(() => import('../plugins/my-runtime-plugin'))
    kit.addAutoImport({ from: '@myscope/composables', imports: ['useMyService'] })
  },
})
```

The `setup(options, kit)` callback receives a `kit` object with helpers:

| Helper | Description |
|---|---|
| `kit.addPlugin(factory)` | Registers a runtime plugin (lazy import) |
| `kit.addAutoImport(spec)` | Registers composables for auto-import |
| `kit.addTypes(path)` | Adds a `.d.ts` file to the generated type bundle |

Register your module in `gwen.config.ts`:

```ts
import { myModule } from './modules/my-module'

export default defineConfig({
  modules: [myModule()],
})
```

::: tip
If you're building a reusable kit (like `@gwenjs/kit-platformer`), ship it as a module so users only need one line in their config.
:::

## WASM modules

WASM modules are a **completely different concept** — they are compiled `.wasm` binaries loaded at **runtime** in the browser. They are listed in the `wasm: []` array in your config:

```ts
import { physics2D } from '@gwenjs/physics2d'
import { physics3D } from '@gwenjs/physics3d'

export default defineConfig({
  wasm: [
    physics2D({ gravity: 9.81 }),
    physics3D(),
  ],
})
```

GWEN's official WASM plugins (physics2D, physics3D) are pre-compiled and shipped as npm packages. You do not need Rust to use them.

## Loading WASM modules at runtime

For custom WASM binaries, use `engine.loadWasmModule()` inside a system or plugin:

```ts
const handle = await engine.loadWasmModule({
  name: 'my-sim',
  url: '/wasm/my-sim.wasm',
  memory: { pages: 16 },           // optional: initial SharedArrayBuffer size
  channels: ['events', 'results'], // optional: named ring-buffer channels
  step: (handle, dt) => {
    // Called every frame by the game loop
    handle.region('positions').read(/* ... */)
    const event = handle.channel('events').pop()
  },
})
```

| Option | Type | Description |
|---|---|---|
| `name` | `string` | Unique identifier for this WASM module |
| `url` | `string` | URL to the `.wasm` binary |
| `memory` | `object` | SharedArrayBuffer configuration |
| `channels` | `string[]` | Named ring-buffer channels to create |
| `step` | `(handle, dt) => void` | Per-frame callback, runs every game loop tick |

### Named memory regions

Use `handle.region(name)` to access typed views into a named slice of the shared buffer:

```ts
step: (handle, dt) => {
  const positions = handle.region('positions') // Float32Array view
  positions.read(myBuffer)
}
```

### Ring-buffer channels

Use `handle.channel(name)` for event-style communication between WASM and JS:

```ts
step: (handle, dt) => {
  const channel = handle.channel('collision-events')
  let event
  while ((event = channel.pop()) !== null) {
    handleCollision(event)
  }
}
```

## Shared memory

All WASM modules in a GWEN project share a `SharedArrayBuffer` with `gwen-core.wasm`. Data flows between them without copying — positions, velocities, and physics state are read directly from the same memory region.

::: warning Cross-Origin Isolation
`SharedArrayBuffer` requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` response headers. The `gwen dev` server sets these automatically. For production, configure your host accordingly.
:::
