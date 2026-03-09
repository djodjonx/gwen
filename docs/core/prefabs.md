# Prefabs

Prefabs are reusable entity templates. They encapsulate entity creation logic so you don't repeat yourself.

## Defining a Prefab

Use `definePrefab()` to create entity templates. Two forms are supported.

### Form 1 — direct object (recommended)

```typescript
import { definePrefab } from '@djodjonx/gwen-engine-core';
import { Position, Velocity, Health } from '../components';

export const PlayerPrefab = definePrefab({
  name: 'Player',

  create: (api) => {
    const id = api.createEntity();

    api.addComponent(id, Position, { x: 400, y: 300 });
    api.addComponent(id, Velocity, { vx: 0, vy: 0 });
    api.addComponent(id, Health, { current: 10, max: 10 });

    return id;
  }
});
```

### Form 2 — factory (local constants or shared setup)

When you need local variables captured once (e.g. config values or derived constants):

```typescript
export const EnemyPrefab = definePrefab('Enemy', () => {
  const baseSpeed = 80; // captured once at module load

  return {
    create: (api, x: number, y: number) => {
      const id = api.createEntity();
      api.addComponent(id, Position, { x, y });
      api.addComponent(id, Velocity, { vx: 0, vy: baseSpeed });
      api.addComponent(id, Health, { current: 3, max: 3 });
      return id;
    }
  };
});
```

Both forms produce an identical `PrefabDefinition` object.

## Prefabs with Parameters

Prefabs can accept parameters for variation:

```typescript
export const EnemyPrefab = definePrefab({
  name: 'Enemy',

  create: (api, x: number, y: number) => {
    const id = api.createEntity();

    api.addComponent(id, Position, { x, y });
    api.addComponent(id, Velocity, { vx: 0, vy: 50 });
    api.addComponent(id, Health, { current: 3, max: 3 });
    api.addComponent(id, Tag, { type: 'enemy' });

    return id;
  }
});
```

## Registering Prefabs

Register prefabs in a scene's `onEnter`:

```typescript
export const GameScene = defineScene('Game', () => ({
  systems: [],

  onEnter(api) {
    // Register prefabs
    api.prefabs.register(PlayerPrefab);
    api.prefabs.register(EnemyPrefab);
    api.prefabs.register(BulletPrefab);
  },
  onExit(api) {},
}));
```

## Instantiating Prefabs

Once registered, instantiate anywhere:

```typescript
// In scene onEnter
api.prefabs.instantiate('Player');

// In a system
export const SpawnerSystem = defineSystem({
  name: 'SpawnerSystem',
  onUpdate(api, dt) {
    if (shouldSpawn) {
      api.prefabs.instantiate('Enemy', 100, 50);
    }
  }
});
```

## Real Examples from Space Shooter

### Player Prefab

```typescript
export const PlayerPrefab = definePrefab({
  name: 'Player',

  create: (api) => {
    const id = api.createEntity();

    api.addComponent(id, Position, { x: 240, y: 560 });
    api.addComponent(id, Velocity, { vx: 0, vy: 0 });
    api.addComponent(id, Tag, { type: 'player' });
    api.addComponent(id, Collider, { radius: 14 });
    api.addComponent(id, Health, { hp: 3 });
    api.addComponent(id, ShootTimer, { elapsed: 0, cooldown: 0.22 });
    api.addComponent(id, UIComponent, { uiName: 'PlayerUI' });

    return id;
  }
});
```

### Enemy Prefab

```typescript
export const EnemyPrefab = definePrefab({
  name: 'Enemy',

  create: (api, x: number, y: number) => {
    const id = api.createEntity();

    api.addComponent(id, Position, { x, y });
    api.addComponent(id, Velocity, { vx: 0, vy: 80 });
    api.addComponent(id, Tag, { type: 'enemy' });
    api.addComponent(id, Collider, { radius: 16 });
    api.addComponent(id, Health, { hp: 1 });
    api.addComponent(id, ShootTimer, {
      elapsed: Math.random() * 2,
      cooldown: 2.0 + Math.random()
    });
    api.addComponent(id, UIComponent, { uiName: 'EnemyUI' });

    return id;
  }
});
```

### Bullet Prefab

```typescript
export const BulletPrefab = definePrefab({
  name: 'Bullet',

  create: (api, x: number, y: number, vx: number, vy: number, tagType: string) => {
    const id = api.createEntity();

    api.addComponent(id, Position, { x, y });
    api.addComponent(id, Velocity, { vx, vy });
    api.addComponent(id, Tag, { type: tagType });
    api.addComponent(id, Collider, {
      radius: tagType === 'bullet' ? 5 : 4
    });
    api.addComponent(id, UIComponent, { uiName: 'BulletUI' });

    return id;
  }
});
```

## Usage in Scenes

```typescript
export const GameScene = defineScene('Game', () => ({
  systems: [MovementSystem, CollisionSystem],

  onEnter(api) {
    // Register all prefabs
    api.prefabs.register(PlayerPrefab);
    api.prefabs.register(EnemyPrefab);
    api.prefabs.register(BulletPrefab);

    // Create player
    api.prefabs.instantiate('Player');

    // Create enemies in a grid
    for (let i = 0; i < 5; i++) {
      api.prefabs.instantiate('Enemy', 60 + i * 90, -30 - i * 15);
    }
  },
  onExit(api) {},
}));
```

## Usage in Systems

```typescript
import { defineSystem } from '@djodjonx/gwen-engine-core';

export const PlayerSystem = defineSystem({
  name: 'PlayerSystem',

  onUpdate(api, dt) {
    const keyboard = api.services.get('keyboard');
    const players = api.query(['player', 'position']);

    for (const id of players) {
      const pos = api.getComponent(id, Position);

      // Shoot bullet
      if (keyboard.isPressed('Space')) {
        api.prefabs.instantiate('Bullet', pos.x, pos.y - 20, 0, -500, 'bullet');
      }
    }
  }
});
```

## Prefab Patterns

### Random Variation

```typescript
export const AsteroidPrefab = definePrefab({
  name: 'Asteroid',

  create: (api, x: number, y: number) => {
    const id = api.createEntity();

    // Random size
    const size = 20 + Math.random() * 30;

    // Random velocity
    const vx = -50 + Math.random() * 100;
    const vy = 50 + Math.random() * 100;

    api.addComponent(id, Position, { x, y });
    api.addComponent(id, Velocity, { vx, vy });
    api.addComponent(id, Collider, { radius: size });

    return id;
  }
});
```

### Conditional Components

```typescript
export const EnemyPrefab = definePrefab({
  name: 'Enemy',

  create: (api, x: number, y: number, isBoss: boolean = false) => {
    const id = api.createEntity();

    api.addComponent(id, Position, { x, y });
    api.addComponent(id, Tag, { type: 'enemy' });

    // Boss has more health
    if (isBoss) {
      api.addComponent(id, Health, { current: 50, max: 50 });
      api.addComponent(id, Tag, { type: 'boss' });
    } else {
      api.addComponent(id, Health, { current: 3, max: 3 });
    }

    return id;
  }
});

// Usage
api.prefabs.instantiate('Enemy', 100, 50, false); // Normal enemy
api.prefabs.instantiate('Enemy', 400, 50, true);  // Boss enemy
```

### Nested Prefabs

```typescript
export const TankPrefab = definePrefab({
  name: 'Tank',

  create: (api, x: number, y: number) => {
    // Create tank body
    const tankId = api.createEntity();
    api.addComponent(tankId, Position, { x, y });
    api.addComponent(tankId, Health, { current: 20, max: 20 });

    // Create tank turret (child entity)
    const turretId = api.createEntity();
    api.addComponent(turretId, Position, { x, y: y - 10 });
    api.addComponent(turretId, ParentEntity, { parentId: tankId });

    return tankId;
  }
});
```

## Typed Services in Prefabs

The `create` function receives `api: EngineAPI`. After `gwen prepare`, services are **fully typed automatically** — no annotation needed:

```typescript
// ✅ After gwen prepare — fully typed, no annotation needed
export const SpawnWithSoundPrefab = definePrefab({
  name: 'SpawnWithSound',
  create: (api, x: number, y: number) => {
    api.services.get('audio').play('spawn'); // → AudioPlugin ✅
    const id = api.createEntity();
    api.addComponent(id, Position, { x, y });
    return id;
  }
});
```

> In practice, most prefabs only call `api.createEntity()` and `api.addComponent()` which are always typed. Services are automatically typed after `gwen prepare`.

## Best Practices

### 1. Return Entity ID

Always return the created entity ID:

```typescript
// ✅ Good
create: (api) => {
  const id = api.createEntity();
  // ...
  return id;
}

// ❌ Bad
create: (api) => {
  const id = api.createEntity();
  // ... (no return)
}
```

### 2. Accept Parameters for Flexibility

```typescript
// ✅ Good - flexible
create: (api, x: number, y: number, speed: number = 100) => {
  // ...
}

// ❌ Less flexible - hardcoded values
create: (api) => {
  const x = 100;
  const y = 50;
  const speed = 100;
  // ...
}
```

### 3. Use Descriptive Names

```typescript
// ✅ Good
export const FastEnemyPrefab = definePrefab({ name: 'FastEnemy', ... });
export const SlowEnemyPrefab = definePrefab({ name: 'SlowEnemy', ... });

// ❌ Avoid
export const Enemy1 = definePrefab({ name: 'E1', ... });
export const Enemy2 = definePrefab({ name: 'E2', ... });
```

### 4. Group Related Prefabs

```typescript
// prefabs/enemies.ts
export const BasicEnemyPrefab = definePrefab({...});
export const FastEnemyPrefab = definePrefab({...});
export const TankEnemyPrefab = definePrefab({...});

// prefabs/player.ts
export const PlayerPrefab = definePrefab({...});

// prefabs/weapons.ts
export const BulletPrefab = definePrefab({...});
export const MissilePrefab = definePrefab({...});
```

## Common Prefabs

### Particle

```typescript
export const ParticlePrefab = definePrefab({
  name: 'Particle',

  create: (api, x: number, y: number) => {
    const id = api.createEntity();

    const angle = Math.random() * Math.PI * 2;
    const speed = 50 + Math.random() * 100;

    api.addComponent(id, Position, { x, y });
    api.addComponent(id, Velocity, {
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed
    });
    api.addComponent(id, Timer, { elapsed: 0, duration: 0.5 });

    return id;
  }
});
```

### Pickup

```typescript
export const HealthPickupPrefab = definePrefab({
  name: 'HealthPickup',

  create: (api, x: number, y: number) => {
    const id = api.createEntity();

    api.addComponent(id, Position, { x, y });
    api.addComponent(id, Tag, { type: 'pickup' });
    api.addComponent(id, Collider, { radius: 10 });
    api.addComponent(id, PickupData, { type: 'health', value: 25 });

    return id;
  }
});
```

## Next Steps

- [UI](/core/ui) - Render your prefabs
- [Scenes](/core/scenes) - Register and use prefabs
- [Examples](/examples/space-shooter) - See prefabs in action

