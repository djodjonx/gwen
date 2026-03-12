# Project Structure

GWEN projects follow a consistent structure so gameplay code stays maintainable as your game grows.

## Generated structure

When you run `npx @djodjonx/create-gwen-app my-game`, you get a layout similar to:

```text
my-game/
├── src/
│   ├── components/
│   ├── prefabs/
│   ├── scenes/
│   ├── systems/
│   └── ui/
├── gwen.config.ts
├── package.json
└── tsconfig.json
```

## Folder responsibilities

## `src/components/`

Define pure ECS data.

```ts
import { defineComponent, Types } from '@djodjonx/gwen-engine-core';

export const Position = defineComponent({
  name: 'position',
  schema: { x: Types.f32, y: Types.f32 },
});
```

## `src/systems/`

Implement gameplay logic (queries + component updates).

```ts
import { defineSystem } from '@djodjonx/gwen-engine-core';

export const MovementSystem = defineSystem({
  name: 'MovementSystem',
  onUpdate(api, dt) {
    // gameplay loop logic
  },
});
```

## `src/scenes/`

Compose systems, UI, and lifecycle (`onEnter`, `onExit`).

```ts
import { defineScene } from '@djodjonx/gwen-engine-core';

export const GameScene = defineScene('Game', () => ({
  systems: [MovementSystem],
  ui: [PlayerUI],
  onEnter(api) {},
  onExit(api) {},
}));
```

## `src/prefabs/`

Reusable entity templates.

```ts
import { definePrefab } from '@djodjonx/gwen-engine-core';

export const EnemyPrefab = definePrefab({
  name: 'Enemy',
  create: (api, x: number, y: number) => {
    const id = api.createEntity();
    api.addComponent(id, Position, { x, y });
    return id;
  },
});
```

## `src/ui/`

Rendering layer (Canvas, HTML UI, plugin-driven UI, etc.).

```ts
import { defineUI } from '@djodjonx/gwen-engine-core';

export const PlayerUI = defineUI({
  name: 'PlayerUI',
  render(api, entityId) {
    // draw entity
  },
});
```

## `gwen.config.ts`

Central app configuration (engine + plugins).

```ts
import { defineConfig } from '@djodjonx/gwen-kit';
import { InputPlugin } from '@djodjonx/gwen-plugin-input';
import { AudioPlugin } from '@djodjonx/gwen-plugin-audio';
import { Canvas2DRenderer } from '@djodjonx/gwen-renderer-canvas2d';

export default defineConfig({
  engine: { maxEntities: 5000, targetFPS: 60, debug: false },
  plugins: [
    new InputPlugin(),
    new AudioPlugin(),
    new Canvas2DRenderer({ width: 800, height: 600 }),
  ],
});
```

## Naming conventions

- Components: `Position`, `Velocity`, `Health`
- Systems: `MovementSystem`, `CombatSystem`
- Scenes: `MainMenuScene`, `GameScene`
- Prefabs: `PlayerPrefab`, `EnemyPrefab`
- UI: `PlayerUI`, `HUDUI`

## Recommended workflow

1. Define data in `components`
2. Implement logic in `systems`
3. Register systems in `scenes`
4. Add reusable entities in `prefabs`
5. Render in `ui`

## Next steps

- [Philosophy](/guide/philosophy)
- [Quick Start](/guide/quick-start)
- [Helpers API](/api/helpers)
