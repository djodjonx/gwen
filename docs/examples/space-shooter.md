# Space Shooter Walkthrough

The playground includes a complete Space Shooter game that demonstrates all of GWEN's features.

## Overview

**Location:** `playground/`

**Source:** [View on GitHub](https://github.com/djodjonx/gwen/tree/main/playground)

## Running the Example

```bash
cd playground
pnpm dev
```

Open `http://localhost:5173`

## Game Structure

```text
playground/src/
  components/    # Position, Velocity, Health, etc.
  prefabs/       # Player, Enemy, Bullet
  scenes/        # MainMenu, GameScene
  systems/       # Movement, Collision, Player, AI, Spawner
  ui/            # PlayerUI, EnemyUI, ScoreUI, etc.
```

## Key Learnings

### 1. Scene-Driven Flow

Two scenes orchestrate the game:

```typescript
// MainMenuScene - Start screen
// GameScene - Actual gameplay
```

### 2. Prefab Reuse

Enemies and bullets are spawned via prefabs:

```typescript
api.prefabs.instantiate('Enemy', x, y);
api.prefabs.instantiate('Bullet', x, y, vx, vy, type);
```

### 3. System Composition

Five systems handle gameplay:
- MovementSystem
- PlayerSystem
- AISystem
- SpawnerSystem
- CollisionSystem

### 4. Custom UI Rendering

Each entity type has custom Canvas2D rendering.

## Code Highlights

See the source code for full implementation:
- [Components](https://github.com/djodjonx/gwen/tree/main/playground/src/components)
- [Systems](https://github.com/djodjonx/gwen/tree/main/playground/src/systems)
- [Scenes](https://github.com/djodjonx/gwen/tree/main/playground/src/scenes)
- [Prefabs](https://github.com/djodjonx/gwen/tree/main/playground/src/prefabs)
- [UI](https://github.com/djodjonx/gwen/tree/main/playground/src/ui)

## Next Steps

- [Common Patterns](/examples/patterns) - Reusable techniques
- [API Reference](/api/helpers) - Full API docs

