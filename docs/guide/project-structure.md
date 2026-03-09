# Project Structure

GWEN projects follow a consistent structure that keeps code organized as your game grows.

## Generated Structure

When you run `pnpm create gwen-app my-game`, you get:

```text
my-game/
├── src/
│   ├── components/
│   │   └── index.ts
│   ├── prefabs/
│   │   └── index.ts
│   ├── scenes/
│   │   ├── MainMenuScene.ts
│   │   └── GameScene.ts
│   ├── systems/
│   │   ├── MovementSystem.ts
│   │   └── PlayerSystem.ts
│   └── ui/
│       ├── PlayerUI.ts
│       └── ScoreUI.ts
├── gwen.config.ts
├── package.json
└── tsconfig.json
```

## Folder Purposes

### `src/components/`

**Purpose:** Define your game's data structures.

Components are pure data with no logic. They describe what entities *are*.

```typescript
// src/components/Position.ts
import { defineComponent, Types } from '@djodjonx/gwen-engine-core';

export const Position = defineComponent({
  name: 'position',
  schema: { x: Types.f32, y: Types.f32 }
});
```

```typescript
// src/components/Velocity.ts
import { defineComponent, Types } from '@djodjonx/gwen-engine-core';

export const Velocity = defineComponent({
  name: 'velocity',
  schema: { vx: Types.f32, vy: Types.f32 }
});
```

```typescript
// src/components/index.ts
export * from './Position';
export * from './Velocity';
export * from './Health';
```

**Best practices:**
- One component per file for maintainability
- Use `index.ts` to re-export all components
- Descriptive names (`Position`, not `Pos`)
- Flat schemas (avoid nesting)

**Structure:**
```text
components/
  Position.ts
  Velocity.ts
  Health.ts
  index.ts      // Re-exports all
```

---

### `src/prefabs/`

**Purpose:** Define reusable entity templates.

Prefabs encapsulate entity creation logic so you don't repeat yourself.

```typescript
// src/prefabs/Enemy.ts
import { definePrefab } from '@djodjonx/gwen-engine-core';
import { Position, Velocity, Health } from '../components';

export const EnemyPrefab = definePrefab({
  name: 'Enemy',
  create: (api, x: number, y: number) => {
    const id = api.createEntity();
    api.addComponent(id, Position, { x, y });
    api.addComponent(id, Velocity, { vx: 0, vy: 50 });
    api.addComponent(id, Health, { current: 3, max: 3 });
    return id;
  }
});
```

```typescript
// src/prefabs/index.ts
export * from './Player';
export * from './Enemy';
export * from './Bullet';
```

**Best practices:**
- One prefab per file for clarity
- Use `index.ts` to re-export all prefabs
- Accept parameters for variation
- Return the created entity ID

**Structure:**
```text
prefabs/
  Player.ts
  Enemy.ts
  Bullet.ts
  index.ts      // Re-exports all
```

---

### `src/scenes/`

**Purpose:** Orchestrate game flow and state.

Scenes control which systems run, what UI displays, and manage entity lifecycles.

```typescript
// src/scenes/GameScene.ts
import { defineScene } from '@djodjonx/gwen-engine-core';
import { MovementSystem, PlayerSystem } from '../systems';
import { PlayerUI, ScoreUI } from '../ui';
import { PlayerPrefab } from '../prefabs';

export const GameScene = defineScene('Game', () => ({
  ui: [PlayerUI, ScoreUI],
  systems: [MovementSystem, PlayerSystem],

  onEnter(api) {
    // Setup entities for this scene
    api.prefabs.register(PlayerPrefab);
    api.prefabs.instantiate('Player');
  },

  onExit(api) {
    // Cleanup (optional)
  }
}));
```

**Best practices:**
- One scene per file
- Descriptive names (`GameScene`, not `Scene1`)
- Clean up resources in `onExit`

---

### `src/systems/`

**Purpose:** Implement gameplay logic that runs every frame.

Systems query entities and update components based on game rules.

```typescript
// src/systems/MovementSystem.ts
import { defineSystem } from '@djodjonx/gwen-engine-core';
import { Position, Velocity } from '../components';

export const MovementSystem = defineSystem({
  name: 'MovementSystem',

  onUpdate(api, dt) {
    const entities = api.query(['position', 'velocity']);

    for (const id of entities) {
      const pos = api.getComponent(id, Position);
      const vel = api.getComponent(id, Velocity);

      api.addComponent(id, Position, {
        x: pos.x + vel.vx * dt,
        y: pos.y + vel.vy * dt
      });
    }
  }
});
```

**Best practices:**
- One system per file
- Focus on single responsibility
- Use `dt` (delta time) for frame-independent logic
- Systems are registered in scenes, not globally

---

### `src/ui/`

**Purpose:** Custom rendering with full Canvas2D control.

UI components handle how entities are drawn to the screen.

```typescript
// src/ui/PlayerUI.ts
import { defineUI } from '@djodjonx/gwen-engine-core';
import { Position } from '../components';

export const PlayerUI = defineUI({
  name: 'PlayerUI',

  render(api, entityId) {
    const pos = api.getComponent(entityId, Position);
    if (!pos) return;

    const { ctx } = api.services.get('renderer');

    ctx.fillStyle = '#00ff00';
    ctx.fillRect(pos.x - 16, pos.y - 16, 32, 32);
  }
});
```

**Best practices:**
- One UI component per file
- Check component existence (`if (!pos) return`)
- Use services for renderer access
- Keep rendering logic simple

---

### `gwen.config.ts`

**Purpose:** Configure the engine and plugins.

This is the single source of truth for your game's setup.

```typescript
import { defineConfig } from '@djodjonx/gwen-kit';
import { InputPlugin } from '@djodjonx/gwen-plugin-input';
import { AudioPlugin } from '@djodjonx/gwen-plugin-audio';
import { Canvas2DRenderer } from '@djodjonx/gwen-renderer-canvas2d';

export default defineConfig({
  engine: {
    maxEntities: 5000,
    targetFPS: 60,
    debug: false
  },

  html: {
    title: 'My Awesome Game',
    background: '#000000'
  },

  plugins: [
    new InputPlugin(),
    new AudioPlugin({ masterVolume: 0.8 }),
    new Canvas2DRenderer({ width: 800, height: 600 })
  ]
});
```

**Best practices:**
- Keep config minimal
- Use environment variables for dev vs prod settings
- Register all plugins here

---

## Workflow

### 1. Define Data (Components)

```typescript
// components/Score.ts
export const Score = defineComponent({
  name: 'score',
  schema: { value: Types.i32 }
});
```

### 2. Create Reusable Entities (Prefabs)

```typescript
// prefabs/Player.ts
export const PlayerPrefab = definePrefab({
  name: 'Player',
  create: (api) => {
    const id = api.createEntity();
    api.addComponent(id, Position, { x: 400, y: 300 });
    api.addComponent(id, Score, { value: 0 });
    return id;
  }
});
```

### 3. Implement Logic (Systems)

```typescript
// systems/ScoreSystem.ts
import { defineSystem } from '@djodjonx/gwen-engine-core';

export const ScoreSystem = defineSystem({
  name: 'ScoreSystem',
  onUpdate(api, dt) {
    // Update score logic
  }
});
```

### 4. Render (UI)

```typescript
// ui/ScoreUI.ts
export const ScoreUI = defineUI({
  name: 'ScoreUI',
  render(api, id) {
    const score = api.getComponent(id, Score);
    // Draw score
  }
});
```

### 5. Orchestrate (Scene)

```typescript
// scenes/GameScene.ts
export const GameScene = defineScene('Game', () => ({
  systems: [ScoreSystem],
  ui: [ScoreUI],
  onEnter(api) {
    api.prefabs.instantiate('Player');
  },
  onExit(api) {},
}));
```

## Scaling Patterns

### Any Size Game

Always use one file per component/prefab/system:
```text
components/
  Position.ts
  Velocity.ts
  index.ts          // Re-exports

prefabs/
  Player.ts
  Enemy.ts
  index.ts          // Re-exports

systems/
  MovementSystem.ts
  CollisionSystem.ts
  index.ts          // Re-exports (optional)
```

This prevents "god files" and makes code easier to:
- Navigate
- Review in PRs
- Refactor
- Test individually

### Medium Game (1K-5K LOC)

Split by feature:
```
systems/
  player/
    PlayerMovement.ts
    PlayerAttack.ts
  enemies/
    EnemyAI.ts
    EnemySpawner.ts
```

### Large Game (5K+ LOC)

Use module boundaries:
```
src/
  modules/
    player/
      components.ts
      prefabs.ts
      systems.ts
      ui.ts
    enemies/
      components.ts
      prefabs.ts
      systems.ts
      ui.ts
```

## Next Steps

- [Components](/core/components) - Learn component definition
- [Scenes](/core/scenes) - Master scene lifecycle
- [Systems](/core/systems) - Write game logic
