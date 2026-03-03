# Scenes

Scenes orchestrate your game's flow. A scene controls which systems run, what UI displays, and manages entity lifecycles.

## Defining a Scene

Use `defineScene()` to create a scene:

```typescript
import { defineScene } from '@gwen/engine-core';

export const MainMenuScene = defineScene('MainMenu', () => ({
  ui: [],
  plugins: [],

  onEnter(api) {
    console.log('Entered main menu');
  },

  onExit(api) {
    console.log('Leaving main menu');
  }
}));
```

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
  ui: UIComponent[],        // UI components to render
  plugins: Plugin[],        // Systems to run each frame
  onEnter?: (api) => void,  // Setup callback
  onExit?: (api) => void    // Cleanup callback
}
```

## Real Example: Game Scene

From the playground Space Shooter:

```typescript
import { defineScene } from '@gwen/engine-core';
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

Scenes are loaded in your main entry point:

```typescript
// src/main.ts
import { getEngine } from '@gwen/engine-core';
import config from '../gwen.config';
import { MainMenuScene } from './scenes/MainMenuScene';

const engine = getEngine(config);

// Load initial scene
engine.scene.load(MainMenuScene);

// Start engine
engine.start();
```

## Scene Transitions

Switch between scenes at runtime:

```typescript
// In a system
export const GameOverSystem = createPlugin({
  name: 'GameOverSystem',
  onUpdate(api, dt) {
    const player = api.query(['player', 'health'])[0];
    const health = api.getComponent(player, Health);

    if (health?.current <= 0) {
      api.scene.load(GameOverScene);
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
  plugins: [
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
      onStartGame: () => api.scene.load(GameScene)
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

## Type Safety with Services

Define your services type for autocompletion:

```typescript
// types/services.ts
export interface GwenServices {
  keyboard: KeyboardInput;
  renderer: Canvas2DRenderer;
  audio: AudioPlugin;
  gameState: {
    score: number;
    lives: number;
  };
}

// scenes/GameScene.ts
import type { EngineAPI } from '@gwen/engine-core';
import type { GwenServices } from '../types/services';

export const GameScene = defineScene('Game', () => ({
  plugins: [],

  onEnter(api: EngineAPI<GwenServices>) {
    const keyboard = api.services.get('keyboard'); // ✅ Typed!
    const audio = api.services.get('audio');       // ✅ Typed!
  }
}));
```

## Next Steps

- [Systems](/core/systems) - Implement gameplay logic
- [Prefabs](/core/prefabs) - Reuse entity creation
- [UI](/core/ui) - Render your game

