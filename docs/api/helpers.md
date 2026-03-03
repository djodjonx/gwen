# API Helpers

GWEN provides several `define*` helpers for creating game elements.

## defineComponent

Define ECS components:

```typescript
import { defineComponent, Types } from '@gwen/engine-core';

export const Position = defineComponent({
  name: 'position',
  schema: { x: Types.f32, y: Types.f32 }
});
```

[Learn more](/core/components)

## defineScene

Define game scenes:

```typescript
import { defineScene } from '@gwen/engine-core';

export const GameScene = defineScene('Game', () => ({
  ui: [],
  plugins: [],
  onEnter(api) { },
  onExit(api) { }
}));
```

[Learn more](/core/scenes)

## definePrefab

Define reusable entities:

```typescript
import { definePrefab } from '@gwen/engine-core';

export const PlayerPrefab = definePrefab({
  name: 'Player',
  create: (api) => {
    const id = api.createEntity();
    // Add components
    return id;
  }
});
```

[Learn more](/core/prefabs)

## defineUI

Define custom rendering:

```typescript
import { defineUI } from '@gwen/engine-core';

export const PlayerUI = defineUI({
  name: 'PlayerUI',
  render(api, id) {
    const { ctx } = api.services.get('renderer');
    // Draw
  }
});
```

[Learn more](/core/ui)

## createPlugin

Create systems:

```typescript
import { createPlugin } from '@gwen/engine-core';

export const MovementSystem = createPlugin({
  name: 'MovementSystem',
  onUpdate(api, dt) {
    // Logic
  }
});
```

[Learn more](/core/systems)

## defineConfig

Configure the engine:

```typescript
import { defineConfig } from '@gwen/engine-core';

export default defineConfig({
  engine: { maxEntities: 5000 },
  plugins: []
});
```

[Learn more](/core/configuration)

## Next Steps

- [Engine API](/api/engine-api) - Runtime API
- [Types](/api/types) - Type definitions

