# Scenes

Scenes orchestrate your game's flow. A scene controls which systems run, what UI displays, and manages entity lifecycles.

## Defining a Scene

Use `defineScene()` to create a scene. Two forms are supported.

### Form 1 — direct object

No external dependencies, simplest syntax:

```typescript
import { defineScene } from '@djodjonx/gwen-engine-core';

export const PauseScene = defineScene({
  name: 'Pause',
  systems: [],
  ui: [],

  onEnter(api) {
    console.log('Entered pause');
  },

  onExit(api) {
    console.log('Leaving pause');
  }
});
```

### Form 2 — factory

Returns a callable that produces a `Scene`. Use this when you need typed dependencies or want to capture local variables in a closure:

```typescript
export const GameScene = defineScene('Game', () => ({
  systems: [MovementSystem, PlayerSystem],
  ui: [PlayerUI, ScoreUI],

  onEnter(api) {
    api.prefabs.register(PlayerPrefab);
    api.prefabs.instantiate('Player');
  },

  onExit(api) {
    console.log('Leaving game');
  }
}));
```

Both forms produce a `Scene` object ready to register on a `SceneManager`.

## Scene Lifecycle

```text
┌─────────────────────┐
│  Scene.onEnter()    │ ← Setup entities, register prefabs
└─────────┬───────────┘
          │
          ↓
┌─────────────────────┐
│  Game Loop Running  │ ← Systems update, UI renders
│  (systems execute)  │
└─────────┬───────────┘
          │
          ↓
┌─────────────────────┐
│  Scene.onExit()     │ ← Cleanup, unload resources
└─────────────────────┘
```

## Scene Structure

A scene definition returns an object with:

```typescript
{
  ui: UIDefinition[],       // UI components to render
  systems?: PluginEntry[],  // Systems to run each frame
  onEnter(api): void,       // Setup callback
  onExit(api): void,        // Cleanup callback
  onUpdate?(api, dt): void, // Optional per-frame callback
  layout?: string,          // Optional HTML layout
}
```

## Real Example: Game Scene

From the playground Space Shooter:

```typescript
import { defineScene } from '@djodjonx/gwen-engine-core';
import { PlayerSystem } from '../systems/PlayerSystem';
import { MovementSystem } from '../systems/MovementSystem';
import { CollisionSystem } from '../systems/CollisionSystem';
import { PlayerUI, ScoreUI, EnemyUI } from '../ui';
import { PlayerPrefab, EnemyPrefab } from '../prefabs';

export const GameScene = defineScene('Game', () => ({
  // UI components that render entities
  ui: [
    PlayerUI,
    EnemyUI,
    ScoreUI
  ],

  // Systems that run each frame
  systems: [
    MovementSystem,
    PlayerSystem,
    CollisionSystem
  ],

  // Scene setup
  onEnter(api) {
    // Register prefabs
    api.prefabs.register(PlayerPrefab);
    api.prefabs.register(EnemyPrefab);

    // Create player
    api.prefabs.instantiate('Player');

    // Spawn enemies
    for (let i = 0; i < 5; i++) {
      api.prefabs.instantiate('Enemy', 100 + i * 80, 50);
    }
  },

  onExit(api) {
    // Cleanup if needed
  }
}));
```

## Loading Scenes

Scenes are registered on a `SceneManager` and loaded by name:

```typescript
// src/main.ts
import { createEngine, initWasm } from '@djodjonx/gwen-engine-core';
import gwenConfig from '../gwen.config';
import { MainMenuScene } from './scenes/MainMenuScene';

await initWasm();
const { engine, scenes } = createEngine(gwenConfig);

// Register and load initial scene
scenes.register(MainMenuScene);
scenes.loadSceneImmediate('MainMenu', engine.getAPI());

engine.start();
```

## Scene Transitions

Switch between scenes at runtime:

```typescript
// In a system
export const GameOverSystem = defineSystem({
  name: 'GameOverSystem',
  onUpdate(api, dt) {
    const player = api.query(['player', 'health'])[0];
    const health = api.getComponent(player, Health);

    if (health?.current <= 0) {
      api.scene?.load('GameOver');
    }
  }
});
```

## Scene Data Sharing

### Via Services

Register data in a service that persists across scenes:

```typescript
// In onEnter
api.services.register('gameState', {
  score: 0,
  level: 1
});

// Later, in another scene
const state = api.services.get('gameState');
console.log(state.score);
```

### Via Component on Persistent Entity

Create an entity in one scene and mark it as persistent:

```typescript
// GameScene onEnter
const scoreEntity = api.createEntity();
api.addComponent(scoreEntity, Score, { value: 0 });
api.addComponent(scoreEntity, Persistent, {}); // Custom marker

// In onExit, don't destroy persistent entities
```

## Multiple Scenes

You typically have:

```typescript
// scenes/MainMenuScene.ts
export const MainMenuScene = defineScene('MainMenu', () => ({
  ui: [MenuUI],
  systems: [MenuInputSystem],
  onEnter(api) {
    // Show menu
  }
}));

// scenes/GameScene.ts
export const GameScene = defineScene('Game', () => ({
  ui: [PlayerUI, EnemyUI, ScoreUI],
  systems: [MovementSystem, CollisionSystem, PlayerSystem],
  onEnter(api) {
    // Start game
  }
}));

// scenes/GameOverScene.ts
export const GameOverScene = defineScene('GameOver', () => ({
  ui: [GameOverUI],
  systems: [GameOverInputSystem],
  onEnter(api) {
    const finalScore = api.services.get('gameState').score;
    // Display final score
  }
}));
```

## Scene Best Practices

### 1. Clean Setup in onEnter

```typescript
onEnter(api) {
  // Register all prefabs first
  api.prefabs.register(PlayerPrefab);
  api.prefabs.register(EnemyPrefab);

  // Then create entities
  api.prefabs.instantiate('Player');

  // Setup UI state
  const scoreEntity = api.createEntity();
  api.addComponent(scoreEntity, Score, { value: 0, lives: 3 });
}
```

### 2. Cleanup in onExit

```typescript
onExit(api) {
  // Destroy non-persistent entities
  const entities = api.query(['enemy']);
  for (const id of entities) {
    api.destroyEntity(id);
  }

  // Stop audio
  const audio = api.services.get('audio');
  audio.stopAll();
}
```

### 3. Register Systems in Scene

Systems only run when the scene is active:

```typescript
export const GameScene = defineScene('Game', () => ({
  systems: [
    MovementSystem,    // Only runs during GameScene
    CollisionSystem,   // Only runs during GameScene
  ],
  // ...
}));
```

### 4. Use Descriptive Names

```typescript
// Good
export const GameScene = defineScene('Game', () => ({...}));
export const PauseMenuScene = defineScene('PauseMenu', () => ({...}));

// Avoid
export const Scene1 = defineScene('S1', () => ({...}));
```

## Real-World Pattern: Menu → Game → GameOver

```typescript
// MainMenuScene.ts
export const MainMenuScene = defineScene('MainMenu', () => ({
  ui: [MenuUI],
  systems: [MenuSystem],

  onEnter(api) {
    // Listen for start button
    api.services.register('menuState', {
      onStartGame: () => api.scene?.load('Game')
    });
  }
}));

// GameScene.ts
export const GameScene = defineScene('Game', () => ({
  ui: [PlayerUI, EnemyUI, ScoreUI],
  systems: [MovementSystem, PlayerSystem, CollisionSystem],

  onEnter(api) {
    api.services.register('gameState', { score: 0, lives: 3 });
    api.prefabs.instantiate('Player');
  }
}));

// GameOverScene.ts
export const GameOverScene = defineScene('GameOver', () => ({
  ui: [GameOverUI],
  systems: [GameOverSystem],

  onEnter(api) {
    const state = api.services.get('gameState');
    console.log('Final score:', state.score);
  }
}));
```

## Typed Services in Scenes

`onEnter`, `onExit` and `onUpdate` all receive an `api: EngineAPI` parameter. After `gwen prepare`, `api.services.get(...)` is **fully typed automatically** — no annotation needed.

**`GwenDefaultServices` is a global interface** enriched by `gwen prepare` with your project's services. It is the default generic for `EngineAPI`.

```typescript
// ✅ After gwen prepare — fully typed with zero annotation
import type { EngineAPI } from '@djodjonx/gwen-engine-core';

export const GameScene = defineScene('Game', () => ({
  systems: [],
  onEnter(api) {
    const kb       = api.services.get('keyboard'); // → KeyboardInput ✅
    const renderer = api.services.get('renderer'); // → Canvas2DRenderer ✅
  },
  onExit(api) {},
}));
```

> `gwen prepare` is called automatically by `gwen dev` and `gwen build`. Run it once after adding or removing plugins.

> The same automatic typing applies across `defineSystem`, `defineScene`, `defineUI` and `definePrefab` — always up to date, no imports to maintain.


## Next Steps

- [Systems](/core/systems) - Implement gameplay logic
- [Prefabs](/core/prefabs) - Reuse entity creation
- [UI](/core/ui) - Render your game

