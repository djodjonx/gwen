# Scenes

Scenes represent discrete game states — Main Menu, Gameplay, Pause, Game Over. Each scene owns its own set of systems and optional UI. GWEN starts and stops systems as scenes transition.

## What Are Scenes?

Think of a scene as a self-contained slice of your game. When a scene is active, its systems run every frame. When the scene exits, its systems stop and their resources are released.

Scenes are also the right unit for lifecycle logic — loading assets, spawning initial entities, cleaning up on exit.

## `defineScene()`

```ts
import { defineScene } from '@gwenjs/core';
import { MovementSystem, EnemySystem, RenderSystem } from './systems';
import { HUD } from './ui';

export const GameScene = defineScene({
  name: 'Game',
  systems: [MovementSystem, EnemySystem, RenderSystem],
  ui: HUD,

  onEnter(api) {
    // Runs when this scene becomes active
    // Good place to spawn entities, load level data
    api.instantiate(PlayerPrefab, { [Position]: { x: 400, y: 300 } });
  },

  onExit(api) {
    // Runs when leaving this scene
    // Good place to clean up entities or save state
  },
});
```

| Field          | Type                 | Description                                |
| -------------- | -------------------- | ------------------------------------------ |
| `name`         | `string`             | Unique scene identifier                    |
| `systems`      | `SystemDef[]`        | Systems active while this scene runs       |
| `ui`           | Component (optional) | UI component mounted while scene is active |
| `onEnter(api)` | function (optional)  | Called when scene becomes active           |
| `onExit(api)`  | function (optional)  | Called when scene is deactivated           |

## Scene Lifecycle

```
loadScene(GameScene)
  │
  ├── onExit() of the previous scene
  ├── Systems from previous scene are stopped
  │
  ├── Systems from GameScene are set up (setup() runs)
  └── onEnter(api) of GameScene
        └── frame loop begins
```

`onEnter` is the right place to spawn initial entities, kick off async asset loads, or reset state. `onExit` is where you destroy scene-owned entities and clean up.

::: warning
Do not call composables (`useQuery`, `useService`) inside `onEnter` or `onExit`. These are plain functions, not system setups — the composable context is not active. Access entities directly via the `api` argument instead.
:::

## Switching Scenes

Call `api.loadScene(SceneDef)` from anywhere you have access to the API — a system callback, an event handler, or `onEnter`/`onExit`:

```ts
import { defineSystem, onUpdate } from '@gwenjs/core';
import { GameScene } from './scenes';

export const MainMenuSystem = defineSystem(() => {
  const input = useInput();

  onUpdate(() => {
    if (input.isJustDown('Enter')) {
      api.loadScene(GameScene);
    }
  });
});
```

The transition is deferred to the end of the current frame, so any in-progress callbacks complete cleanly.

## Multiple Active Scenes

GWEN supports running more than one scene simultaneously. This is useful for overlays like a pause screen or an HUD that lives independently of the game world:

```ts
// Pause the world but keep game scene running underneath
api.loadScene(PauseScene, { additive: true });

// Resume — remove the pause overlay
api.unloadScene(PauseScene);
```

::: tip
Use additive scenes for UI overlays, debug panels, or any layer that doesn't replace the main game state — it avoids redundant `onEnter`/`onExit` round-trips and keeps system lifecycles clean.
:::

## Full Example: Game + Pause

```ts
// scenes/game.ts
export const GameScene = defineScene({
  name: 'Game',
  systems: [MovementSystem, EnemySystem],
  onEnter(api) {
    api.instantiate(PlayerPrefab);
  },
});

// scenes/pause.ts
export const PauseScene = defineScene({
  name: 'Pause',
  systems: [PauseMenuSystem],
  ui: PauseOverlay,
});

// Inside a system — toggle pause
onUpdate(() => {
  if (input.isJustDown('Escape')) {
    if (api.isSceneActive(PauseScene)) {
      api.unloadScene(PauseScene);
    } else {
      api.loadScene(PauseScene, { additive: true });
    }
  }
});
```

::: info Related

- [Systems](./systems.md) — define logic that runs inside a scene
- [Prefabs](./prefabs.md) — spawn entities in `onEnter`
- [Components](./components.md) — data attached to entities
  :::
