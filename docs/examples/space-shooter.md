# Space Shooter Walkthrough

The playground ships a complete Space Shooter game covering the full GWEN feature set.

## Overview

**Location:** `playground/space-shooter/`

**Source:** [View on GitHub](https://github.com/djodjonx/gwen/tree/main/playground/space-shooter)

## Running it locally

```bash
cd playground/space-shooter
pnpm install
pnpm dev
```

## Project layout

```text
space-shooter/src/
  components/       # Position, Velocity, Health, ShootTimer, Tag
  prefabs/          # Player, Enemy, PlayerBullet, EnemyBullet
  scenes/           # MainMenuScene, GameScene
  systems/          # MovementSystem, PlayerSystem, AISystem, SpawnerSystem, CollisionSystem
  ui/               # PlayerUI, EnemyUI, BulletUI, ScoreUI, BackgroundUI
```

## Key concepts demonstrated

### 1. Scene lifecycle

Two scenes manage the full game flow:

```typescript
// MainMenuScene — shows title and waits for input to start
export const MainMenuScene = defineScene('MainMenu', () => ({
  ui: [TitleUI],
  onEnter(api) {
    api.prefabs.register(BackgroundPrefab);
    api.prefabs.instantiate('Background');
  },
  onExit(api) {},
}));

// GameScene — runs all gameplay systems
export const GameScene = defineScene('Game', () => ({
  systems: [MovementSystem, PlayerSystem, AISystem, SpawnerSystem, CollisionSystem],
  ui: [PlayerUI, EnemyUI, BulletUI, ScoreUI, BackgroundUI],
  onEnter(api) {
    api.prefabs.register(PlayerPrefab);
    api.prefabs.register(EnemyPrefab);
    api.prefabs.register(PlayerBulletPrefab);
    api.prefabs.instantiate('Player');
  },
  onExit(api) {},
}));
```

### 2. ECS data flow

Pure components carry all game state:

```typescript
export const Tag = defineComponent({ name: 'tag', schema: { type: Types.string } });
export const ShootTimer = defineComponent({
  name: 'shootTimer',
  schema: { elapsed: Types.f32, cooldown: Types.f32 },
});
```

Systems read and write components — no shared mutable state outside ECS:

```typescript
export const PlayerSystem = defineSystem({
  name: 'PlayerSystem',
  onUpdate(api, dt) {
    const keyboard = api.services.get('keyboard');
    const players = api.query([Tag, Position, ShootTimer]);

    for (const id of players) {
      const tag = api.getComponent(id, Tag);
      if (tag?.type !== 'player') continue;

      // movement, shooting, clamping...
    }
  },
});
```

### 3. Prefab composition

Bullets reuse a single prefab with parameters:

```typescript
export const PlayerBulletPrefab = definePrefab({
  name: 'PlayerBullet',
  create: (api, x: number, y: number, vx: number, vy: number) => {
    const id = api.createEntity();
    api.addComponent(id, Tag, { type: 'player-bullet' });
    api.addComponent(id, Position, { x, y });
    api.addComponent(id, Velocity, { vx, vy });
    return id;
  },
});

// Spawning
api.prefabs.instantiate('PlayerBullet', pos.x, pos.y - 20, 0, -500);
```

### 4. Collision as an ECS system

```typescript
export const CollisionSystem = defineSystem({
  name: 'CollisionSystem',
  onUpdate(api) {
    const bullets = api.query([Tag, Position]);
    const enemies  = api.query([Tag, Position, Health]);

    for (const bulletId of bullets) {
      const bTag = api.getComponent(bulletId, Tag);
      if (bTag?.type !== 'player-bullet') continue;
      const bPos = api.getComponent(bulletId, Position);
      if (!bPos) continue;

      for (const enemyId of enemies) {
        const ePos = api.getComponent(enemyId, Position);
        const eHp  = api.getComponent(enemyId, Health);
        if (!ePos || !eHp) continue;

        const dist = Math.hypot(bPos.x - ePos.x, bPos.y - ePos.y);
        if (dist < 28) {
          api.destroyEntity(bulletId);
          if (eHp.current <= 1) api.destroyEntity(enemyId);
          else api.addComponent(enemyId, Health, { ...eHp, current: eHp.current - 1 });
        }
      }
    }
  },
});
```

### 5. Custom Canvas2D rendering

Every entity type has its own `defineUI`:

```typescript
export const EnemyUI = defineUI({
  name: 'EnemyUI',
  render(api, id) {
    const pos = api.getComponent(id, Position);
    if (!pos) return;
    const { ctx } = api.services.get('renderer');
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 14, 0, Math.PI * 2);
    ctx.fill();
  },
});
```

## Space Shooter 2 — with sprite animation

`playground/space-shooter-2/` extends the original with `@djodjonx/gwen-plugin-sprite-anim`:

```typescript
// Player uses a real spritesheet with idle, shoot, accelerate, decelerate clips
export const PlayerUI = defineUI({
  name: 'PlayerUI',
  extensions: {
    spriteAnim: {
      atlas: '/sprites/player.png',
      frame: { width: 352, height: 384, columns: 8 },
      clips: {
        idle: { frames: [1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2], fps: 9, loop: true },
        // ...
      },
    },
  },
  render(api, id) { /* ... */ },
});
```

## What to read next

- [Common Patterns](/examples/patterns)
- [Official Plugins](/plugins/official)
- [API Helpers](/api/helpers)
