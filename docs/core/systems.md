# Systems

Systems contain the gameplay logic that runs every frame. They query entities, read components, and update game state.

## Creating a System

Use `createPlugin()` to define a system:

```typescript
import { createPlugin } from '@gwen/engine-core';

export const MovementSystem = createPlugin({
  name: 'MovementSystem',

  onUpdate(api, dt) {
    // Runs every frame
    // dt = delta time in seconds
  }
});
```

## System Lifecycle

Systems have three hooks:

```typescript
export const MySystem = createPlugin({
  name: 'MySystem',

  // Called once when scene loads
  onInit(api) {
    console.log('System initialized');
  },

  // Called every frame
  onUpdate(api, dt) {
    // Main game logic
  },

  // Called when scene unloads
  onDestroy(api) {
    console.log('System cleanup');
  }
});
```

## Querying Entities

Systems query entities by component names:

```typescript
export const MovementSystem = createPlugin({
  name: 'MovementSystem',

  onUpdate(api, dt) {
    // Get all entities with 'position' and 'velocity'
    const entities = api.query(['position', 'velocity']);

    for (const id of entities) {
      const pos = api.getComponent(id, Position);
      const vel = api.getComponent(id, Velocity);

      if (!pos || !vel) continue;

      // Update position
      api.addComponent(id, Position, {
        x: pos.x + vel.vx * dt,
        y: pos.y + vel.vy * dt
      });
    }
  }
});
```

## Real Example: Player System

From the playground Space Shooter:

```typescript
import { createPlugin } from '@gwen/engine-core';
import type { EngineAPI } from '@gwen/engine-core';
import { Tag, Position, Velocity, ShootTimer } from '../components';

const SPEED = 260;
const W = 480, H = 640;

export const PlayerSystem = createPlugin({
  name: 'PlayerSystem',

  onUpdate(api: EngineAPI<GwenServices>, dt: number) {
    // Get keyboard service
    const keyboard = api.services.get('keyboard');

    // Query players
    const players = api.query([Tag.name, Position.name, Velocity.name, ShootTimer.name]);

    for (const id of players) {
      const tag = api.getComponent(id, Tag);
      if (tag?.type !== 'player') continue;

      const pos = api.getComponent(id, Position);
      const timer = api.getComponent(id, ShootTimer);
      if (!pos || !timer) continue;

      // Movement
      let vx = 0, vy = 0;
      if (keyboard.isPressed('ArrowLeft')) vx = -SPEED;
      if (keyboard.isPressed('ArrowRight')) vx = SPEED;
      if (keyboard.isPressed('ArrowUp')) vy = -SPEED;
      if (keyboard.isPressed('ArrowDown')) vy = SPEED;

      // Clamp to canvas bounds
      const nx = Math.max(20, Math.min(W - 20, pos.x + vx * dt));
      const ny = Math.max(20, Math.min(H - 20, pos.y + vy * dt));

      api.addComponent(id, Position, { x: nx, y: ny });
      api.addComponent(id, Velocity, { vx, vy });

      // Shooting
      const elapsed = timer.elapsed + dt;
      if (keyboard.isPressed('Space') && elapsed >= timer.cooldown) {
        api.prefabs.instantiate('Bullet', pos.x, pos.y - 20, 0, -500, 'bullet');
        api.addComponent(id, ShootTimer, { ...timer, elapsed: 0 });
      } else {
        api.addComponent(id, ShootTimer, { ...timer, elapsed });
      }
    }
  }
});
```

## Accessing Services

Services provide access to plugin functionality:

```typescript
export const InputSystem = createPlugin({
  name: 'InputSystem',

  onUpdate(api, dt) {
    // Get keyboard
    const keyboard = api.services.get('keyboard');

    // Get audio
    const audio = api.services.get('audio');

    // Get renderer
    const renderer = api.services.get('renderer');

    if (keyboard.isPressed('Space')) {
      audio.play('jump');
    }
  }
});
```

## Delta Time (dt)

Always use `dt` (delta time) for frame-independent movement:

```typescript
// ✅ Good: Frame-independent
api.addComponent(id, Position, {
  x: pos.x + velocity * dt,
  y: pos.y
});

// ❌ Bad: Frame-dependent (breaks at different FPS)
api.addComponent(id, Position, {
  x: pos.x + velocity,
  y: pos.y
});
```

`dt` is in **seconds**, so:
- 60 FPS → dt ≈ 0.016 (16ms)
- 30 FPS → dt ≈ 0.033 (33ms)

## Common System Patterns

### Movement

```typescript
export const MovementSystem = createPlugin({
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

### Collision

```typescript
export const CollisionSystem = createPlugin({
  name: 'CollisionSystem',
  onUpdate(api, dt) {
    const entities = api.query(['position', 'collider']);

    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const idA = entities[i];
        const idB = entities[j];

        const posA = api.getComponent(idA, Position);
        const posB = api.getComponent(idB, Position);
        const colA = api.getComponent(idA, Collider);
        const colB = api.getComponent(idB, Collider);

        const dx = posA.x - posB.x;
        const dy = posA.y - posB.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < colA.radius + colB.radius) {
          // Collision detected
          api.emit('collision', { idA, idB });
        }
      }
    }
  }
});
```

### Timer

```typescript
export const TimerSystem = createPlugin({
  name: 'TimerSystem',
  onUpdate(api, dt) {
    const entities = api.query(['timer']);

    for (const id of entities) {
      const timer = api.getComponent(id, Timer);
      const elapsed = timer.elapsed + dt;

      if (elapsed >= timer.duration) {
        // Timer finished
        api.emit('timer-complete', { id });
        api.removeComponent(id, Timer);
      } else {
        api.addComponent(id, Timer, { ...timer, elapsed });
      }
    }
  }
});
```

### Spawner

```typescript
export const SpawnerSystem = createPlugin({
  name: 'SpawnerSystem',

  onInit(api) {
    this.spawnTimer = 0;
    this.spawnInterval = 2.0; // seconds
  },

  onUpdate(api, dt) {
    this.spawnTimer += dt;

    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      api.prefabs.instantiate('Enemy', Math.random() * 800, 0);
    }
  }
});
```

## Filtering by Tag

Use tag components to filter entities:

```typescript
export const EnemyAISystem = createPlugin({
  name: 'EnemyAISystem',
  onUpdate(api, dt) {
    const entities = api.query(['tag', 'position']);

    for (const id of entities) {
      const tag = api.getComponent(id, Tag);
      if (tag?.type !== 'enemy') continue; // Skip non-enemies

      // Enemy-specific logic
      const pos = api.getComponent(id, Position);
      // ...
    }
  }
});
```

## System Order

Systems run in the order they're registered in the scene:

```typescript
export const GameScene = defineScene('Game', () => ({
  plugins: [
    InputSystem,       // 1st
    MovementSystem,    // 2nd
    CollisionSystem,   // 3rd
    RenderSystem       // 4th (last)
  ]
}));
```

**Best practice:** Input → Logic → Physics → Rendering

## Entity Creation in Systems

Systems can create entities:

```typescript
export const BulletSpawnerSystem = createPlugin({
  name: 'BulletSpawnerSystem',

  onUpdate(api, dt) {
    const players = api.query(['player', 'position']);

    for (const id of players) {
      const pos = api.getComponent(id, Position);

      // Spawn bullet
      const bullet = api.createEntity();
      api.addComponent(bullet, Position, { x: pos.x, y: pos.y - 20 });
      api.addComponent(bullet, Velocity, { vx: 0, vy: -500 });
      api.addComponent(bullet, Tag, { type: 'bullet' });
    }
  }
});
```

Or use prefabs:

```typescript
api.prefabs.instantiate('Bullet', pos.x, pos.y);
```

## State in Systems

Systems can maintain internal state:

```typescript
export const WaveSystem = createPlugin({
  name: 'WaveSystem',

  onInit(api) {
    this.currentWave = 1;
    this.enemiesRemaining = 0;
  },

  onUpdate(api, dt) {
    if (this.enemiesRemaining === 0) {
      this.currentWave++;
      this.spawnWave(api, this.currentWave);
    }

    // Check enemy count
    const enemies = api.query(['enemy']);
    this.enemiesRemaining = enemies.length;
  },

  spawnWave(api, wave) {
    for (let i = 0; i < wave * 3; i++) {
      api.prefabs.instantiate('Enemy', Math.random() * 800, 0);
    }
  }
});
```

## Type-Safe Systems

Define your services interface for autocomplete:

```typescript
import type { EngineAPI } from '@gwen/engine-core';
import type { GwenServices } from '../types/services';

export const PlayerSystem = createPlugin({
  name: 'PlayerSystem',

  onUpdate(api: EngineAPI<GwenServices>, dt: number) {
    const keyboard = api.services.get('keyboard'); // ✅ Typed
    const audio = api.services.get('audio');       // ✅ Typed
  }
});
```

## Best Practices

### 1. Single Responsibility

Each system should do one thing well:

```typescript
// ✅ Good
MovementSystem    // Only handles position + velocity
CollisionSystem   // Only detects collisions
DamageSystem      // Only applies damage

// ❌ Avoid
GameplaySystem    // Does everything (movement + collision + damage + UI)
```

### 2. Check Component Existence

Always validate components:

```typescript
const pos = api.getComponent(id, Position);
if (!pos) continue; // Skip if missing
```

### 3. Use dt for Movement

```typescript
// ✅ Frame-independent
pos.x += velocity * dt;

// ❌ Frame-dependent
pos.x += velocity;
```

### 4. Avoid Global State

Use services or component data instead:

```typescript
// ❌ Bad
let globalScore = 0;

// ✅ Good
const scoreEntity = api.query(['score'])[0];
const score = api.getComponent(scoreEntity, Score);
```

## Next Steps

- [Prefabs](/core/prefabs) - Reuse entity creation
- [UI](/core/ui) - Render your game
- [Examples](/examples/space-shooter) - See systems in action

