# Engine API

The `GwenEngine` instance is the central runtime object. Most projects interact with it only via `defineConfig` and composables — but direct engine access is available for plugin authors and advanced use cases.

```ts
import { createEngine } from '@gwenjs/core'

const engine = createEngine(options?)
```

::: info
`createEngine()` is for advanced / manual bootstrapping. Standard projects use [`defineConfig`](./helpers#defineconfig) and let the `gwen` CLI create the engine automatically.
:::

---

## Engine Lifecycle

```ts
engine.use(plugin: GwenPlugin): GwenEngine
engine.start(): Promise<void>
engine.stop(): void
```

| Method | Description |
|---|---|
| `engine.use(plugin)` | Register a plugin. Returns `engine` for chaining. Must be called before `engine.start()`. |
| `engine.start()` | Initialise all plugins and begin the game loop. Returns a `Promise` that resolves once the loop is running. |
| `engine.stop()` | Halt the game loop and tear down plugins. |

**Example:**

```ts
const engine = createEngine()

// Advanced: directly register plugins
// (most projects use modules in gwen.config.ts instead)
engine
  .use(inputPlugin)
  .use(canvas2DRenderer)
  .use(movementSystem)

await engine.start()
```

::: tip Module-first pattern
In standard projects, plugins are registered by listing their package names in the `modules` array in `gwen.config.ts`. Direct `engine.use()` calls are available for advanced / manual bootstrapping.
:::

---

## WASM Modules

Load and interact with pre-compiled WASM modules via the engine.

```ts
engine.loadWasmModule(options: WasmModuleOptions): Promise<WasmModuleHandle>
```

```ts
interface WasmModuleOptions {
  name: string               // unique identifier, used with useWasmModule()
  url: string                // URL to the .wasm binary
  memory?: WebAssembly.Memory
  channels?: ChannelDef[]    // ring-buffer channels
  step?: (handle: WasmModuleHandle, dt: number) => void  // per-frame callback
}
```

### WasmModuleHandle

```ts
handle.region(name: string): TypedArrayView   // named shared memory region
handle.channel(name: string): RingBufferChannel  // ring-buffer channel
```

**Example:**

```ts
const handle = await engine.loadWasmModule({
  name: 'my-physics',
  url: '/wasm/my-physics.wasm',
  channels: [{ name: 'collisions', size: 256 }],
  step(handle, dt) {
    handle.channel('collisions').flush()
  },
})
```

::: tip Zero-copy access
`handle.region()` returns a `TypedArray` view directly into `SharedArrayBuffer` — no copying. Reads and writes are visible to both JS and WASM immediately.
:::

---

## Service Registry

Plugins use the service registry to expose APIs to systems and other plugins.

```ts
// In a plugin's setup():
engine.provide(name: string, value: unknown): void

// Anywhere:
engine.inject(name: string): unknown
engine.getService(name: string): unknown  // alias for inject
```

| Method | Description |
|---|---|
| `engine.provide(name, value)` | Register a service by name. Call this inside a plugin's `setup()`. |
| `engine.inject(name)` | Retrieve a registered service. Throws if not found. |
| `engine.getService(name)` | Alias for `inject`. |

**Example:**

```ts
// In plugin setup:
engine.provide('audio', new AudioService())

// In another plugin or system (without type generation):
const audio = engine.getService('audio') as AudioService
```

::: tip Typed services
After running `gwen prepare`, use the [`useService()`](./composables#useservice) composable inside systems for fully typed access — no manual casting.
:::

---

## ECS Methods (api.*)

The `api` object exposes ECS operations. It is available as a parameter in system callbacks, scene `onEnter` / `onExit`, and plugin `setup()`.

```ts
api.createEntity(): EntityId
api.destroyEntity(id: EntityId): void
api.addComponent(id: EntityId, def: ComponentDef, data: object): void
api.getComponent(id: EntityId, def: ComponentDef): ComponentData | undefined
api.removeComponent(id: EntityId, def: ComponentDef): void
api.hasComponent(id: EntityId, def: ComponentDef): boolean
api.query(defs: ComponentDef[]): EntityId[]
api.instantiate(prefab: PrefabDef, overrides?: Partial<PrefabData>): EntityId
api.loadScene(sceneDef: SceneDef): void
```

| Method | Description |
|---|---|
| `createEntity()` | Allocate a new entity. Returns its `EntityId`. |
| `destroyEntity(id)` | Destroy an entity and remove all its components. |
| `addComponent(id, def, data)` | Attach a component with initial data. |
| `getComponent(id, def)` | Read a component. Returns `undefined` if not present. |
| `removeComponent(id, def)` | Detach a component from an entity. |
| `hasComponent(id, def)` | Check if an entity has a component. |
| `query(defs)` | One-shot query — returns a snapshot array of matching `EntityId`s. |
| `instantiate(prefab, overrides?)` | Spawn an entity from a [`definePrefab`](./helpers#defineprefab) template. |
| `loadScene(sceneDef)` | Transition to a new scene (tears down current, enters new). |

**Example:**

```ts
const gameScene = defineScene({
  name: 'game',
  systems: [movementSystem],
  onEnter(api) {
    const id = api.instantiate(playerPrefab, {
      Position: { x: 100, y: 200 },
    })
    api.addComponent(id, CameraTarget, {})
  },
  onExit(api) {
    for (const e of api.query([PlayerTag])) {
      api.destroyEntity(e)
    }
  },
})
```

::: tip Live queries in systems
Inside systems, prefer [`useQuery()`](./composables#usequery) over `api.query()`. `useQuery` returns a live set that updates automatically; `api.query()` is a one-shot snapshot best suited for `onEnter` / `onExit` callbacks.
:::
