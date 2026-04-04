# 🎮 GWEN Framework — AI Agent Skill

Gwen is an ultra-performant hybrid ECS (Entity Component System) game engine, using **Rust (Wasm)** for the engine core and **TypeScript** for the API, tooling, and rendering.

## 🏗️ Architecture & Directory Structure

Gwen follows a strict "Convention over Configuration" approach:

- `gwen.config.ts`: Configuration entry point (plugins, engine, html).
- `src/components/`: Data definitions (Schemas).
- `src/systems/`: Game logic (Update loop).
- `src/scenes/`: Orchestration (Levels, Menus).
- `src/prefabs/`: Reusable entity templates.
- `src/ui/`: Visual rendering (Canvas 2D or HTML/CSS).

## 🛠️ Core API (TypeScript)

### 1. Components (`defineComponent`)

Components are pure data structures.

```typescript
import { defineComponent, Types } from '@djodjonx/gwen-engine-core';

export const Position = defineComponent({
  name: 'position',
  schema: { x: Types.f32, y: Types.f32 },
});
```

### 2. Systems (`defineSystem`)

Systems run every frame.

```typescript
export const MovementSystem = defineSystem({
  name: 'MovementSystem',
  onUpdate(api, dt) {
    const entities = api.query([Position, Velocity]);
    for (const id of entities) {
      const pos = api.getComponent(id, Position);
      api.addComponent(id, Position, { x: pos.x + 10 });
    }
  },
});
```

### 3. Scenes (`defineScene`)

Manage the lifecycle and activation of systems/UI.

```typescript
export const GameScene = defineScene('Game', () => ({
  systems: [MovementSystem, CollisionSystem],
  ui: [PlayerUI, ScoreUI],
  onEnter(api) {
    api.prefabs.register(PlayerPrefab);
    api.prefabs.instantiate('Player');
  },
}));
```

### 4. UI (`defineUI`)

Entity-specific rendering for entities with a `UIComponent`.

```typescript
export const PlayerUI = defineUI({
  name: 'PlayerUI',
  render(api, id) {
    const { ctx } = api.services.get('renderer'); // Auto-typed service
    const pos = api.getComponent(id, Position);
    ctx.fillRect(pos.x, pos.y, 20, 20);
  },
});
```

## 🔌 Plugins & Services

Gwen is extensible via plugins. Services exposed by plugins are accessible via `api.services.get('name')`.

- **Keyboard**: `api.services.get('keyboard')` -> `isPressed(key)`
- **Renderer**: `api.services.get('renderer')` -> `ctx` (CanvasRenderingContext2D)
- **Audio**: `api.services.get('audio')` -> `play(sound, options)`
- **Physics2D**: Native Rust integration for collisions.

## 🚀 Development Workflow

1. **Configuration**: Add plugins in `gwen.config.ts`.
2. **Preparation**: Run `gwen prepare` (or `pnpm dev`) to generate automatic service types.
3. **Entities**: Use `api.createEntity()` or `api.prefabs.instantiate()`.
4. **Scenes**: Load via `api.scene.load('SceneName')`.

## 💡 Patterns & Best Practices

- **Typed Services**: Never manually type services. Gwen generates them dynamically in `GwenDefaultServices` during `gwen prepare`.
- **No Service Casts**: Writing `api.services.get('physics') as Physics2DAPI` in apps/playgrounds is forbidden.
  - Bad: `const physics = api.services.get('physics') as Physics2DAPI;`
  - Good: `const physics = api.services.get('physics');`
  - Prerequisite: run `gwen prepare` (or `pnpm dev`) to have up-to-date types.
- **Prefabs over Manual Creation**: Always prefer prefabs for creating complex entities.
- **Scene State**: Use `api.services.register()` to share persistent data between scenes.
- **Hybrid Rendering**: You can mix `Canvas2DRenderer` for the game and `HtmlUIPlugin` for menus/overlays.
