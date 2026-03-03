# Quick Start

Get your first GWEN game running in under 5 minutes.

## Prerequisites

- Node.js 18+ ([download](https://nodejs.org/))
- pnpm ([install](https://pnpm.io/installation))

No Rust, no Vite config, no WASM setup needed. Everything is handled for you.

## Create a New Project

```bash
pnpm create gwen-app my-game
cd my-game
```

This scaffolds a complete game project with:
- Pre-configured `gwen.config.ts`
- Example components, scenes, systems
- TypeScript setup
- Development server ready

## Start Development

```bash
pnpm dev
```

Open `http://localhost:3000` in your browser. You should see your game running.

## Project Structure

Your generated project looks like this:

```text
my-game/
├── src/
│   ├── components/     # Data definitions (Position, Velocity, etc.)
│   ├── prefabs/        # Reusable entities (Player, Enemy, Bullet)
│   ├── scenes/         # Game flow (MainMenu, GameScene)
│   ├── systems/        # Gameplay logic (Movement, Collision, etc.)
│   └── ui/             # Custom rendering (PlayerUI, ScoreUI, etc.)
├── gwen.config.ts      # Engine & plugins configuration
├── package.json
└── tsconfig.json
```

## What's Next?

### 1. Explore the Code

Open `src/scenes/GameScene.ts` to see how a scene is defined:

```typescript
export const GameScene = defineScene('Game', () => ({
  systems: [MovementSystem, PlayerSystem, CollisionSystem],
  onEnter(api) {
    // Create initial entities
  },
  onExit() {},
}));
```

### 2. Modify a Component

Edit `src/components/Position.ts`:

```typescript
export const Position = defineComponent({
  name: 'position',
  schema: {
    x: Types.f32,
    y: Types.f32,
    z: Types.f32  // Add a third dimension
  }
});
```

Save and watch the hot-reload in action.

### 3. Create a System

Add `src/systems/GravitySystem.ts`:

```typescript
import { defineSystem } from '@gwen/engine-core';
import { Position, Velocity } from '../components';

export const GravitySystem = defineSystem({
  name: 'GravitySystem',
  onUpdate(api, dt) {
    const entities = api.query(['position', 'velocity']);
    for (const id of entities) {
      const vel = api.getComponent(id, Velocity);
      api.addComponent(id, Velocity, {
        vx: vel.vx,
        vy: vel.vy + 980 * dt  // Apply gravity
      });
    }
  }
});
```

Register it in your scene:

```typescript
export const GameScene = defineScene('Game', () => ({
  systems: [MovementSystem, GravitySystem], // Add here
  // ...
}));
```

## Build for Production

```bash
pnpm build
```

Your game is compiled to `dist/` and ready to deploy anywhere (Netlify, Vercel, GitHub Pages, etc.).

## Common Commands

```bash
# Development
pnpm dev

# Production build
pnpm build

# Preview production build
pnpm preview

# Lint code
pnpm lint

# Format code
pnpm format
```

## Next Steps

- [Understand the Philosophy](/guide/philosophy) - Why GWEN works this way
- [Learn Core Concepts](/core/components) - Deep dive into components, scenes, systems
- [Explore Examples](/examples/space-shooter) - Walk through a complete Space Shooter
