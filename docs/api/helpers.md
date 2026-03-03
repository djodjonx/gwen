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

## defineConfig

Configure the engine and register plugins:

```typescript
import { defineConfig } from '@gwen/engine-core';

export default defineConfig({
  engine: { maxEntities: 5000 },
  plugins: [
    new InputPlugin(),
    new AudioPlugin({ masterVolume: 0.8 }),
    new Canvas2DRenderer({ width: 800, height: 600 })
  ]
});
```

[Learn more](/core/configuration)

## GwenPlugin Interface

Create plugins by implementing `GwenPlugin<N, P>`:

```typescript
import type { GwenPlugin, EngineAPI } from '@gwen/engine-core';

export class MyPlugin implements GwenPlugin<'MyPlugin', { myService: MyService }> {
  readonly name = 'MyPlugin' as const;
  readonly provides = { myService: {} as MyService };

  onInit(api: EngineAPI) {
    api.services.register('myService', { /* ... */ });
  }
}
```

[Learn more](/plugins/creating)

## Next Steps

- [Engine API](/api/engine-api) - Runtime API
- [Types](/api/types) - Type definitions
- [Creating Plugins](/plugins/creating) - Build your own plugins
