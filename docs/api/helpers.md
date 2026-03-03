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

## defineSystem

Define game systems (pure gameplay logic):

```typescript
import { defineSystem } from '@gwen/engine-core';

export const MovementSystem = defineSystem({
  name: 'MovementSystem',
  onUpdate(api, dt) {
    // Logic
  }
});
```

Systems are for game mechanics, entity processing, and state management.

[Learn more](/core/systems)

## createPlugin

Create framework plugins (integrations with services):

```typescript
import { createPlugin } from '@gwen/engine-core';

export const InputPlugin = createPlugin({
  name: 'InputPlugin',
  provides: { keyboard: {} as KeyboardInput },
  onInit(api) {
    // Setup
  }
});
```

Plugins provide services and features to other systems.

[Learn more](/plugins/official)

## defineConfig

Configure the engine:

```typescript
import { defineConfig } from '@gwen/engine-core';

export default defineConfig({
  engine: { maxEntities: 5000 },
  plugins: [
    new InputPlugin(),
    new AudioPlugin(),
    new Canvas2DRenderer()
  ]
});
```

[Learn more](/core/configuration)

## Next Steps

- [Engine API](/api/engine-api) - Runtime API
- [Types](/api/types) - Type definitions
