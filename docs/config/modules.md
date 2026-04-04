# Modules & WASM Modules

## Using modules in gwen.config.ts

The `modules` array is the primary way to add capabilities to your GWEN project. Each entry is either a package name string (no options) or a `[name, options]` tuple:

```ts
// gwen.config.ts
import { defineConfig } from '@gwenjs/app';

export default defineConfig({
  modules: [
    '@gwenjs/input', // string = no options
    '@gwenjs/audio',
    '@gwenjs/debug',
    ['@gwenjs/physics2d', { gravity: 9.81 }], // tuple = with options
    ['@gwenjs/physics3d', { gravity: { x: 0, y: -9.81, z: 0 } }],
    ['@gwenjs/renderer-canvas2d', { width: 800, height: 600 }],
  ],
});
```

WASM-backed modules (like `@gwenjs/physics2d`) are registered the same way as pure TypeScript modules — there is no separate `wasm: []` array.

## What are build-time modules?

Behind the scenes, each `@gwenjs/*` package ships a **build-time module** — a Node.js composition root that runs during `gwen dev` and `gwen prepare` to:

- Install the runtime plugin
- Register auto-imports for composables
- Provide type metadata that `gwen prepare` uses to generate `.gwen/types/`

As a game developer you never write these — you just list the package name in `modules: []`.

## Authoring a module (plugin authors only)

If you're publishing a reusable GWEN plugin, wrap it in `defineGwenModule` so consumers get auto-imports and generated types:

```ts
// modules/my-module.ts
import { defineGwenModule } from '@gwenjs/kit';

export const myModule = defineGwenModule({
  name: 'my-module',
  setup(options, kit) {
    kit.addPlugin(() => import('../plugins/my-runtime-plugin'));
    kit.addAutoImport({ from: '@myscope/composables', imports: ['useMyService'] });
  },
});
```

The `setup(options, kit)` callback receives a `kit` object with helpers:

| Helper                    | Description                                      |
| ------------------------- | ------------------------------------------------ |
| `kit.addPlugin(factory)`  | Registers a runtime plugin (lazy import)         |
| `kit.addAutoImport(spec)` | Registers composables for auto-import            |
| `kit.addTypes(path)`      | Adds a `.d.ts` file to the generated type bundle |

Register your module in `gwen.config.ts`:

```ts
import { myModule } from './modules/my-module';

export default defineConfig({
  modules: [myModule()],
});
```

::: tip
If you're building a reusable kit (like `@gwenjs/kit-platformer`), ship it as a module so users only need one line in their config.
:::

## Loading custom WASM binaries at runtime

For custom WASM binaries (not npm packages), use `engine.loadWasmModule()` inside a system or plugin:

```ts
const handle = await engine.loadWasmModule({
  name: 'my-sim',
  url: '/wasm/my-sim.wasm',
  memory: { pages: 16 }, // optional: initial SharedArrayBuffer size
  channels: ['events', 'results'], // optional: named ring-buffer channels
  step: (handle, dt) => {
    // Called every frame by the game loop
    handle.region('positions').read(/* ... */);
    const event = handle.channel('events').pop();
  },
});
```

| Option     | Type                   | Description                                   |
| ---------- | ---------------------- | --------------------------------------------- |
| `name`     | `string`               | Unique identifier for this WASM module        |
| `url`      | `string`               | URL to the `.wasm` binary                     |
| `memory`   | `object`               | SharedArrayBuffer configuration               |
| `channels` | `string[]`             | Named ring-buffer channels to create          |
| `step`     | `(handle, dt) => void` | Per-frame callback, runs every game loop tick |

### Named memory regions

Use `handle.region(name)` to access typed views into a named slice of the shared buffer:

```ts
step: (handle, dt) => {
  const positions = handle.region('positions'); // Float32Array view
  positions.read(myBuffer);
};
```

### Ring-buffer channels

Use `handle.channel(name)` for event-style communication between WASM and JS:

```ts
step: (handle, dt) => {
  const channel = handle.channel('collision-events');
  let event;
  while ((event = channel.pop()) !== null) {
    handleCollision(event);
  }
};
```

## Shared memory

All WASM modules in a GWEN project share a `SharedArrayBuffer` with `gwen-core.wasm`. Data flows between them without copying — positions, velocities, and physics state are read directly from the same memory region.

::: warning Cross-Origin Isolation
`SharedArrayBuffer` requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` response headers. The `gwen dev` server sets these automatically. For production, configure your host accordingly.
:::
