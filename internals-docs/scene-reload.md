# Scene Reload System - Documentation

## Overview

The scene reload system lets you control whether a scene should be reloaded (destroyed and recreated) when returning to it.

**Default behavior**: `reloadOnReenter: true` (like Unity/Godot)

## API

### Scene Interface

```typescript
interface Scene {
  readonly name: string;

  /**
   * Controls whether the scene reloads when returning to it.
   *
   * - `true` (default): Full reload (like Unity/Godot)
   * - `false`: Keep state (like Phaser pause/resume)
   * - `function`: Dynamic decision based on context
   *
   * @default true
   */
  reloadOnReenter?: boolean | ReloadEvaluator;

  systems?: PluginEntry[];
  ui?: UIDefinition<any>[];
  layout?: string;
  onEnter(api: EngineAPI): void;
  onUpdate?(api: EngineAPI, deltaTime: number): void;
  onRender?(api: EngineAPI): void;
  onExit(api: EngineAPI): void;
}
```

### ReloadContext

```typescript
interface ReloadContext {
  /** Scene we are coming from */
  fromScene: string | null;

  /** Scene we are navigating to */
  toScene: string;

  /** True if this is a re-enter */
  isReenter: boolean;

  /** Number of times we have entered this scene */
  enterCount: number;

  /** Custom data passed via scene.load(name, data) */
  data?: Record<string, unknown>;
}
```

### ReloadEvaluator

```typescript
type ReloadEvaluator = (api: EngineAPI, context: ReloadContext) => boolean;
```

## Usage

### 1. Boolean Simple

```typescript
// Always reload (default - like Unity/Godot)
export const GameScene = defineScene('Game', () => ({
  reloadOnReenter: true,
  systems: [MovementSystem, PlayerSystem],
  onEnter(api) {
    // Setup entities
  },
  onExit(api) {},
}));
```

```typescript
// Never reload (like a pause menu)
export const PauseScene = defineScene('Pause', () => ({
  reloadOnReenter: false,
  systems: [PauseSystem],
  onEnter(api) {
    // Keeps state
  },
  onExit(api) {},
}));
```

### 2. Function Evaluator - Conditionnel

```typescript
// Reload only after game over
export const GameScene = defineScene('Game', () => ({
  reloadOnReenter: (api, ctx) => {
    return ctx.data?.reason === 'gameOver';
  },

  systems: [MovementSystem, PlayerSystem],
  onEnter(api) {},
  onExit(api) {},
}));

// Utilisation
if (lives <= 0) {
  api.scene.load('Game', { reason: 'gameOver' });
}
```

```typescript
// Reload after 3+ deaths
export const GameScene = defineScene('Game', () => ({
  reloadOnReenter: (api, ctx) => {
    return ctx.enterCount > 3;
  },

  systems: [MovementSystem, PlayerSystem],
  onEnter(api) {},
  onExit(api) {},
}));
```

```typescript
// Complex logic with services
export const BossScene = defineScene('Boss', () => ({
  reloadOnReenter: (api, ctx) => {
    const gameState = api.services.get('gameState');
    const shouldRestart = gameState.playerDied && !gameState.hasCheckpoint;
    return shouldRestart;
  },

  systems: [BossSystem],
  onEnter(api) {},
  onExit(api) {},
}));
```

## Hooks

### scene:willReload

Called before a scene is reloaded.

```typescript
api.hooks.hook('scene:willReload', (name, context) => {
  console.log(`Reloading ${name}`);
  console.log(`Reason: ${context.data?.reason}`);
  console.log(`Enter count: ${context.enterCount}`);

  // Save state before reload
  saveGameState();

  // Analytics
  analytics.track('scene_reload', {
    scene: name,
    enterCount: context.enterCount,
  });
});
```

## Detailed Behavior

### Reload (reloadOnReenter: true)

When a scene reloads:

1. ✅ `scene:willReload` hook called
2. ✅ `scene:beforeUnload` hook called
3. ✅ `onExit()` called
4. ✅ Systems destroyed (onDestroy)
5. ✅ `scene:unload` hook called
6. ✅ All entities purged
7. ✅ `scene:unloaded` hook called
8. ✅ `scene:beforeLoad` hook called
9. ✅ Systems recreated (factories called)
10. ✅ `scene:load` hook called
11. ✅ `onEnter()` called
12. ✅ `scene:loaded` hook called

**Result**: Completely fresh state, as if the scene was loaded for the first time.

### No Reload (reloadOnReenter: false)

When a scene does NOT reload:

1. ❌ No hooks called
2. ❌ onExit/onEnter NOT called
3. ❌ Systems keep their state (closures)
4. ❌ Entities persist
5. ✅ The scene continues exactly where it left off

**Result**: Preserved state, like a "pause/resume".

## Use Cases

### Game Scene - Default Reload

```typescript
export const GameScene = defineScene('Game', () => ({
  // Default true → always reload
  ui: [BackgroundUI, PlayerUI, EnemyUI],
  systems: [MovementSystem, PlayerSystem, SpawnerSystem],

  onEnter(api) {
    // Setup initial entities
    api.prefabs.instantiate('Player');
    for (let i = 0; i < 5; i++) {
      api.prefabs.instantiate('Enemy', 100 + i * 50, 100);
    }
  },

  onExit(api) {},
}));

// Dans CollisionSystem
if (lives <= 0) {
  api.scene.load('MainMenu'); // Sort vers menu
}

// Pour retry
if (keyboard.isPressed('R')) {
  api.scene.load('Game'); // Reload automatique !
}
```

### Pause Menu - No reload

```typescript
export const PauseScene = defineScene('Pause', () => ({
  reloadOnReenter: false, // Keeps state

  ui: [PauseUI],

  onEnter(api) {
    // Pause le jeu
  },

  onExit(api) {
    // Resume le jeu
  },
}));
```

### Conditional - Game Over vs Retry

```typescript
export const GameScene = defineScene('Game', () => ({
  reloadOnReenter: (api, ctx) => {
    // Reload only on game over
    // No reload for a quick retry
    return ctx.data?.reason === 'gameOver';
  },

  systems: [MovementSystem, PlayerSystem],
  onEnter(api) {},
  onExit(api) {},
}));

// Game over → reload
if (lives <= 0) {
  api.scene.load('Game', { reason: 'gameOver' });
}

// Quick retry → no reload
if (keyboard.isPressed('R')) {
  api.scene.load('Game', { reason: 'retry' });
}
```

## Comparison with Other Engines

| Engine     | Behavior                   | GWEN Equivalent                   |
| ---------- | -------------------------- | --------------------------------- |
| **Unity**  | Always reload              | `reloadOnReenter: true` (default) |
| **Godot**  | Always reload              | `reloadOnReenter: true` (default) |
| **Phaser** | start/restart/pause/resume | `reloadOnReenter: boolean`        |
| **Unreal** | Always reload              | `reloadOnReenter: true` (default) |

## Best Practices

### ✅ DO

```typescript
// Use default (true) for game scenes
export const GameScene = defineScene('Game', () => ({
  // reloadOnReenter not specified → true by default
  systems: [MovementSystem],
  onEnter(api) {},
  onExit(api) {},
}));

// Utiliser false pour menus/pause
export const PauseScene = defineScene('Pause', () => ({
  reloadOnReenter: false,
  ui: [PauseUI],
  onEnter(api) {},
  onExit(api) {},
}));

// Utiliser function pour logique complexe
export const BossScene = defineScene('Boss', () => ({
  reloadOnReenter: (api, ctx) => {
    return ctx.data?.playerDied === true;
  },
  systems: [BossSystem],
  onEnter(api) {},
  onExit(api) {},
}));
```

### ❌ DON'T

```typescript
// ❌ Do not use manual factories
export const GameScene = defineScene('Game', () => ({
  systems: [
    () => MovementSystem, // ❌ Not needed!
    () => PlayerSystem, // ❌ reloadOnReenter handles this
  ],
  onEnter(api) {},
  onExit(api) {},
}));

// ✅ Use reloadOnReenter instead
export const GameScene = defineScene('Game', () => ({
  reloadOnReenter: true, // ✅ Systems recreated automatically
  systems: [MovementSystem, PlayerSystem],
  onEnter(api) {},
  onExit(api) {},
}));
```

## Troubleshooting

### Problem: Systems keep state after game over

**Cause**: `reloadOnReenter` is `false` or absent on an old scene.

**Solution**: Add `reloadOnReenter: true` (or leave as default).

```typescript
export const GameScene = defineScene('Game', () => ({
  reloadOnReenter: true, // ← Add this
  systems: [MovementSystem],
  onEnter(api) {},
  onExit(api) {},
}));
```

### Problem: Hook scene:willReload not called

**Cause**: The reload is not happening (reloadOnReenter is false).

**Solution**: Check the value of `reloadOnReenter`.

```typescript
// Debug
export const GameScene = defineScene('Game', () => ({
  reloadOnReenter: (api, ctx) => {
    console.log('Evaluating reload:', ctx);
    return true; // Force true to test
  },
  systems: [MovementSystem],
  onEnter(api) {},
  onExit(api) {},
}));
```

### Problem: enterCount does not increment

**Cause**: Normal — `enterCount` is cumulative for the whole session.

**Solution**: If you want to reset, use data:

```typescript
let sessionDeaths = 0;

export const GameScene = defineScene('Game', () => ({
  reloadOnReenter: (api, ctx) => {
    sessionDeaths++;
    return sessionDeaths > 3;
  },
  systems: [MovementSystem],
  onEnter(api) {},
  onExit(api) {},
}));
```

## Migrating from Existing Code

### Before (with manual factories)

```typescript
export const GameScene = defineScene('Game', () => ({
  systems: [() => MovementSystem, () => PlayerSystem, () => SpawnerSystem],
  onEnter(api) {},
  onExit(api) {},
}));
```

### After (with reloadOnReenter)

```typescript
export const GameScene = defineScene('Game', () => ({
  reloadOnReenter: true, // ← New!
  systems: [
    MovementSystem, // ← No more factories
    PlayerSystem,
    SpawnerSystem,
  ],
  onEnter(api) {},
  onExit(api) {},
}));
```

**Benefits**:

- ✅ Simpler code
- ✅ Clear intent
- ✅ Fine-grained control with function evaluator
- ✅ Hooks to observe reloads

## Testing

```typescript
import { describe, it, expect } from 'vitest';
import { SceneManager, defineScene } from '@djodjonx/gwen-engine-core';

it('should reload scene when reloadOnReenter is true', () => {
  let enterCount = 0;

  const TestScene = defineScene({
    name: 'Test',
    reloadOnReenter: true,
    onEnter() {
      enterCount++;
    },
    onExit() {},
  });

  sceneManager.register(TestScene);
  sceneManager.loadSceneImmediate('Test', api);
  expect(enterCount).toBe(1);

  sceneManager.loadSceneImmediate('Test', api);
  expect(enterCount).toBe(2); // Reloaded!
});
```

## Performance

**Reload** (default):

- ⚠️ Cost: Medium (destruction + recreation)
- ✅ Benefit: Guaranteed fresh state, no state bugs

**No Reload** (false):

- ✅ Cost: Zero (no operations)
- ⚠️ Risk: State can be corrupted

**Recommendation**: Use the default (reload) unless performance is critical AND you have full control over state management.

---

**Status** : ✅ Stable depuis v0.2.0
**Tested** : 13 tests pass
**Inspired by** : Unity, Godot, Phaser
