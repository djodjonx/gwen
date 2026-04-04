# Example: Space Shooter

A conceptual walkthrough showing how GWEN patterns fit together to build a minimal space shooter — player ship, bullets, enemies, and a score counter. This is not a complete implementation; each section highlights the relevant pattern.

## Overview

What we're building:

- A **player ship** that moves horizontally and fires bullets
- **Enemy ships** that drift downward
- **Collision detection** via the 2D physics plugin
- A **score counter** that increments on each kill

The game runs as a single scene with four systems.

## Components

Define each component with `defineComponent`. The `schema` drives both the TypeScript type and the WASM memory layout.

```typescript
// src/components/index.ts
import { defineComponent } from '@gwenjs/core';

export const Position = defineComponent({ name: 'Position', schema: { x: 'f32', y: 'f32' } });
export const Velocity = defineComponent({ name: 'Velocity', schema: { x: 'f32', y: 'f32' } });
export const Health = defineComponent({ name: 'Health', schema: { value: 'i32' } });

// Tag components carry no data — they exist purely for queries
export const PlayerTag = defineComponent({ name: 'PlayerTag', schema: {} });
export const EnemyTag = defineComponent({ name: 'EnemyTag', schema: {} });
export const BulletTag = defineComponent({ name: 'BulletTag', schema: {} });
```

::: tip Tag components
Zero-schema components like `PlayerTag` cost almost nothing. Use them to group entities and keep queries fast.
:::

## Prefabs

`definePrefab` bundles a set of components and default values into a reusable template.

```typescript
// src/prefabs/index.ts
import { definePrefab } from '@gwenjs/core';
import { Position, Velocity, Health, PlayerTag, EnemyTag, BulletTag } from '../components';

export const PlayerPrefab = definePrefab({
  name: 'Player',
  components: [
    [Position, { x: 400, y: 550 }],
    [Velocity, { x: 0, y: 0 }],
    [Health, { value: 3 }],
    [PlayerTag],
  ],
});

export const BulletPrefab = definePrefab({
  name: 'Bullet',
  components: [[Position, { x: 0, y: 0 }], [Velocity, { x: 0, y: -600 }], [BulletTag]],
});

export const EnemyPrefab = definePrefab({
  name: 'Enemy',
  components: [
    [Position, { x: 0, y: -20 }],
    [Velocity, { x: 0, y: 120 }],
    [Health, { value: 1 }],
    [EnemyTag],
  ],
});
```

Spawn an entity with `api.instantiate(prefab, overrides)`. Override values are shallow-merged per component:

```typescript
api.instantiate(EnemyPrefab, { [Position]: { x: Math.random() * 800, y: -20 } });
```

See [Prefabs API](/core/prefabs) for the full override signature.

## Systems

### MovementSystem

Queries all entities with both `Position` and `Velocity` and integrates their position each frame.

```typescript
// src/systems/movement.ts
import { defineSystem, useQuery, onUpdate } from '@gwenjs/core';
import { Position, Velocity } from '../components';

export const movementSystem = defineSystem(() => {
  const entities = useQuery([Position, Velocity]);

  onUpdate((dt) => {
    for (const e of entities) {
      e.get(Position).x += e.get(Velocity).x * dt;
      e.get(Position).y += e.get(Velocity).y * dt;
    }
  });
});
```

### InputSystem

Reads keyboard state each frame and fires a bullet when Space is pressed.

```typescript
// src/systems/input.ts
import { defineSystem, useQuery, onUpdate } from '@gwenjs/core';
import { useInput } from '@gwenjs/input';
import { Position, Velocity, PlayerTag } from '../components';
import { BulletPrefab } from '../prefabs';

export const inputSystem = defineSystem((api) => {
  const { keyboard } = useInput();
  const players = useQuery([Position, PlayerTag]);

  onUpdate((dt) => {
    for (const e of players) {
      const pos = e.get(Position);
      const vel = e.get(Velocity);

      vel.x = (keyboard.isDown('ArrowRight') ? 1 : 0) - (keyboard.isDown('ArrowLeft') ? 1 : 0);
      vel.x *= 300;

      if (keyboard.justPressed('Space')) {
        api.instantiate(BulletPrefab, { [Position]: { x: pos.x, y: pos.y } });
      }
    }
  });
});
```

### CollisionSystem

Subscribes to physics collision events and destroys the bullet and enemy on contact.

```typescript
// src/systems/collision.ts
import { defineSystem } from '@gwenjs/core';
import { usePhysics2D } from '@gwenjs/physics2d';
import { BulletTag, EnemyTag } from '../components';

export const collisionSystem = defineSystem((api) => {
  const physics = usePhysics2D();

  physics.onCollision((a, b) => {
    const bullet = a.has(BulletTag) ? a : b.has(BulletTag) ? b : null;
    const enemy = a.has(EnemyTag) ? a : b.has(EnemyTag) ? b : null;

    if (bullet && enemy) {
      api.destroy(bullet);
      api.destroy(enemy);
      api.emit('enemy:killed');
    }
  });
});
```

### ScoreSystem

Listens for the `enemy:killed` event and increments a score counter.

```typescript
// src/systems/score.ts
import { defineSystem, onEvent } from '@gwenjs/core';

export const scoreSystem = defineSystem(() => {
  let score = 0;

  onEvent('enemy:killed', () => {
    score += 1;
    console.log(`Score: ${score}`);
  });
});
```

## Scene

`defineScene` composes systems and an optional UI layer into a single named scene.

```typescript
// src/scenes/game.ts
import { defineScene } from '@gwenjs/core';
import { movementSystem } from '../systems/movement';
import { inputSystem } from '../systems/input';
import { collisionSystem } from '../systems/collision';
import { scoreSystem } from '../systems/score';
import { PlayerPrefab, EnemyPrefab } from '../prefabs';

export const GameScene = defineScene({
  name: 'Game',
  systems: [movementSystem, inputSystem, collisionSystem, scoreSystem],

  onEnter(api) {
    api.instantiate(PlayerPrefab);

    // Spawn a small wave of enemies
    for (let i = 0; i < 5; i++) {
      api.instantiate(EnemyPrefab, {
        [Position]: { x: 80 + i * 140, y: -20 },
      });
    }
  },
});
```

See [Scenes](/core/scenes) and [Systems](/core/systems) for the full API.

## Config

Wire everything together in `gwen.config.ts` at the project root.

```typescript
// gwen.config.ts
import { defineConfig } from '@gwenjs/app';
import { GameScene } from './src/scenes/game';

export default defineConfig({
  engine: { maxEntities: 1_000, targetFPS: 60 },

  modules: [
    '@gwenjs/input',
    ['@gwenjs/renderer-canvas2d', { width: 800, height: 600 }],
    ['@gwenjs/physics2d', { gravity: 0 }], // top-down shooter — no gravity
  ],

  initialScene: GameScene,
});
```

After editing the config, run `pnpm gwen prepare` to regenerate service types.

## Recap

| Pattern                      | Where used                        |
| ---------------------------- | --------------------------------- |
| `defineComponent`            | Shared data schema for ECS + WASM |
| `defineSystem` + composables | All four systems                  |
| `definePrefab`               | Player, Bullet, Enemy             |
| `useInput()`                 | `InputSystem`                     |
| `usePhysics2D()`             | `CollisionSystem`                 |
| `api.instantiate`            | Spawning entities                 |
| `api.emit` / `onEvent`       | Score counter                     |
| `defineScene` + `onEnter`    | Initial wave spawn                |
| `defineConfig`               | Module registration               |

**Further reading**

- [ECS Concepts](/core/components) — components, queries, entities
- [Systems](/core/systems) — frame phases, composables
- [Physics 2D Plugin](/plugins/physics2d)
- [Input Plugin](/plugins/input)
- [Canvas 2D Renderer](/plugins/renderer-canvas2d)
- [Common Patterns](./patterns)
