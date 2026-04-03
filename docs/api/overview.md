# API Overview

GWEN's API is split across three packages depending on your role — game developer, plugin author, or module author.

| Package | Purpose |
|---|---|
| `@gwenjs/core` | ECS primitives, composables, engine factory |
| `@gwenjs/app` | Project bootstrap (`defineConfig`) |
| `@gwenjs/kit` | Plugin and module authoring (`definePlugin`, `defineGwenModule`) |

---

## Game Development Primitives

Define the building blocks of your game. All helpers are imported from `@gwenjs/core`.

| Helper | Description |
|---|---|
| [`defineComponent`](./helpers#definecomponent) | Create an ECS component schema |
| [`defineSystem`](./helpers#definesystem) | Create a composable system |
| [`defineScene`](./helpers#definescene) | Create a named scene |
| [`definePrefab`](./helpers#defineprefab) | Create a reusable entity template |
| [`defineActor`](./helpers#defineactor) | Create an instance-based entity controller |
| [`defineEvents`](./helpers#defineevents) | Declare typed custom game events |

See [Helpers (define*)](./helpers.md).

---

## Composables

Composables are called **inside** a `defineSystem()` or `defineActor()` setup function. They are resolved once synchronously and remain valid across all lifecycle callbacks.

| Composable | Description |
|---|---|
| [`useEngine()`](./composables#useengine) | Access the active `GwenEngine` instance |
| [`useQuery(components)`](./composables#usequery) | Subscribe to a live entity query |
| [`useService(name)`](./composables#useservice) | Inject a typed plugin service |
| [`useWasmModule(name)`](./composables#usewasmmodule) | Access a loaded WASM module handle |
| [`useActor(actorDef)`](./composables#useactor) | Spawn/despawn handle for an actor |
| [`usePrefab(prefabDef)`](./composables#useprefab) | Spawn/despawn handle for a prefab |
| [`useComponent(def)`](./composables#usecomponent) | Reactive component proxy (inside actors) |
| [`emit(name, ...args)`](./composables#emit) | Dispatch a named event |
| [`onUpdate(fn)`](./composables#onupdate) | Register a per-frame update callback |
| [`onBeforeUpdate(fn)`](./composables#onbeforeupdate) | Run before physics/WASM step |
| [`onAfterUpdate(fn)`](./composables#onafterupdate) | Run after physics/WASM step |
| [`onRender(fn)`](./composables#onrender) | Run during the render phase |
| [`onStart(fn)`](./composables#onstart) | Actor lifecycle — after entity created |
| [`onDestroy(fn)`](./composables#ondestroy) | Actor lifecycle — before entity removed |
| [`onEvent(name, fn)`](./composables#onevent) | Actor lifecycle — listen for an event |

See [Composables (use*)](./composables.md).

---

## Engine Runtime

Lower-level access to the engine instance and ECS. Used when building plugins or bootstrapping the engine manually.

| API | Description |
|---|---|
| [`createEngine(options?)`](./engine#engine-lifecycle) | Create a `GwenEngine` instance |
| [`engine.use(plugin)`](./engine#engine-lifecycle) | Register a plugin |
| [`engine.start()`](./engine#engine-lifecycle) | Start the game loop |
| [`engine.stop()`](./engine#engine-lifecycle) | Stop the game loop |
| [`engine.loadWasmModule(options)`](./engine#wasm-modules) | Load a WASM module |
| [`engine.provide / inject / getService`](./engine#service-registry) | Service registry |
| [`api.createEntity()` and friends](./engine#ecs-methods) | ECS operations |

See [Engine API](./engine.md).

---

::: tip Project entry point
Most projects never call `createEngine()` directly. Use [`defineConfig`](./helpers#defineconfig) from `@gwenjs/app` as the composition root, and let the GWEN CLI bootstrap the engine for you.
:::
