# Scene Router API Reference

The Scene Router API provides a declarative, type-safe way to manage scene transitions and overlays in GWEN.

---

## defineSceneRouter(options)

**Signature:**
```typescript
defineSceneRouter<TRoutes extends Record<string, RouteConfig>>(
  options: SceneRouterOptions<TRoutes>
): SceneRouterHandle<TRoutes>
```

**Parameters:**
| Name    | Type                                   | Description                                      |
|---------|----------------------------------------|--------------------------------------------------|
| options | SceneRouterOptions<TRoutes>            | Router configuration object                      |

**Returns:**
- `SceneRouterHandle<TRoutes>` — The router handle instance

**Throws:**
- `[GWEN] Invalid router configuration` if routes are missing or invalid

**Example:**
```typescript
const router = defineSceneRouter({
  initial: 'mainMenu',
  routes: {
    mainMenu: { on: { START: 'raceSelect' }, scene: MainMenu },
    raceSelect: { on: { SELECT: 'race', BACK: 'mainMenu' }, scene: RaceSelect },
    race: { on: { PAUSE: { target: 'pause', overlay: true }, FINISH: 'results' }, scene: Race },
    pause: { overlay: true, pauseUnderlying: true, on: { RESUME: { target: 'previous' } }, scene: PauseMenu },
    results: { on: { RETRY: 'race', QUIT: 'mainMenu' }, scene: ResultsScreen },
  },
});
```

---

## useSceneRouter(routerDef)

**Signature:**
```typescript
useSceneRouter<TRoutes>(
  routerDef: SceneRouterHandle<TRoutes>
): SceneRouterHandle<TRoutes>
```

**Parameters:**
| Name      | Type                        | Description                                 |
|-----------|-----------------------------|---------------------------------------------|
| routerDef | SceneRouterHandle<TRoutes>  | Router definition from `defineSceneRouter`  |

**Returns:**
- `SceneRouterHandle<TRoutes>` — The active router handle

**Throws:**
- `[GWEN] Must be called inside an actor or scene hook`

**Where to call:**
- Inside `defineActor()` factories
- Inside scene `onEnter`/`onExit` hooks

---

## SceneRouterHandle

| Property/Method | Type                                              | Description                                      |
|-----------------|---------------------------------------------------|--------------------------------------------------|
| `current`       | `string`                                          | Current state name                               |
| `params`        | `Record<string, unknown>`                         | Last transition parameters                       |
| `send`          | `(event: string, params?: object) => Promise<void>` | Trigger a transition                             |
| `can`           | `(event: string) => boolean`                      | Check if a transition is valid                   |
| `onTransition`  | `(handler: (info) => void) => () => void`         | Subscribe to transitions; returns unsubscribe fn |

---

## RouteConfig

| Field            | Type                                   | Description                                      |
|------------------|----------------------------------------|--------------------------------------------------|
| `scene`          | `SceneDefinition`                      | Scene to activate in this state                  |
| `on`             | `Record<string, string | RouteTarget>` | Event transitions from this state                |
| `overlay`        | `boolean` (optional)                   | If true, scene overlays previous                 |
| `pauseUnderlying`| `boolean` (optional)                   | If true, pauses underlying scene                 |

---

## SceneRouterOptions

| Field    | Type                                   | Description                                      |
|----------|----------------------------------------|--------------------------------------------------|
| `initial`| `string`                               | Initial state name                               |
| `routes` | `Record<string, RouteConfig>`           | All route definitions                            |

---

## Type Helpers

### EventsOf<TRoutes>
Extracts all event names from the router definition.

```typescript
type MyEvents = EventsOf<typeof router.routes>;
// "START" | "PAUSE" | ...
```

### StatesOf<TRoutes>
Extracts all state names from the router definition.

```typescript
type MyStates = StatesOf<typeof router.routes>;
// "mainMenu" | "race" | ...
```
