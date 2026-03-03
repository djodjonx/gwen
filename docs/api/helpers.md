# API Helpers

GWEN provides several `define*` helpers for creating game elements.

Each helper (except `defineConfig`) supports **two syntaxes**:

| Syntax | When to use |
|--------|-------------|
| **Form 1 — direct object** | Simple case, no local state needed |
| **Form 2 — factory** (`name, () => …`) | Local state in closure, or dynamic setup |

---

## defineComponent

Define ECS components.

**Form 1 — direct object** (recommended):
```typescript
import { defineComponent, Types } from '@gwen/engine-core';

export const Position = defineComponent({
  name: 'position',
  schema: { x: Types.f32, y: Types.f32 }
});
```

**Form 2 — factory** (dynamic schema or local constants):
```typescript
export const Position = defineComponent('position', () => ({
  schema: { x: Types.f32, y: Types.f32 }
}));
```

[Learn more](/core/components)

---

## defineScene

Define game scenes.

**Form 1 — direct object** (no external dependencies):
```typescript
import { defineScene } from '@gwen/engine-core';

export const PauseScene = defineScene({
  name: 'Pause',
  systems: [],
  ui: [],
  onEnter(api) { },
  onExit(api) { }
});
```

**Form 2 — factory** (typed dependencies injected at call site):
```typescript
export const GameScene = defineScene('Game', () => ({
  systems: [MovementSystem, PlayerSystem],
  ui: [PlayerUI, ScoreUI],
  onEnter(api) {
    api.prefabs.register(PlayerPrefab);
    api.prefabs.instantiate('Player');
    api.services.get('audio').play('bgm'); // ✅ Typed after gwen prepare
  },
  onExit(api) { }
}));
```

> After `gwen prepare`, `api` is fully typed automatically — no annotation needed.

> With Form 2, `defineScene` returns a **callable factory** — call it to get the `Scene` object:
> ```typescript
> scenes.register(GameScene); // GameScene is already a Scene (factory called with no args)
> ```

> With Form 2, `defineScene` returns a **callable factory** — call it to get the `Scene` object:
> ```typescript
> scenes.register(GameScene); // GameScene is already a Scene (factory called with no args)
> ```

[Learn more](/core/scenes)

---

## definePrefab

Define reusable entity templates.

**Form 1 — direct object**:
```typescript
import { definePrefab } from '@gwen/engine-core';

export const PlayerPrefab = definePrefab({
  name: 'Player',
  create: (api) => {
    const id = api.createEntity();
    api.addComponent(id, Position, { x: 240, y: 560 });
    return id;
  }
});
```

**Form 2 — factory** (local constants or shared state in closure):
```typescript
export const EnemyPrefab = definePrefab('Enemy', () => {
  const baseSpeed = 80; // captured once

  return {
    create: (api, x: number, y: number) => {
      const id = api.createEntity();
      api.addComponent(id, Position, { x, y });
      api.addComponent(id, Velocity, { vx: 0, vy: baseSpeed });
      return id;
    }
  };
});
```

[Learn more](/core/prefabs)

---

## defineUI

Define renderer-agnostic UI components.

After `gwen prepare`, `api.services.get()` is **fully typed automatically** — no generic needed.

```typescript
// ✅ After gwen prepare — fully typed, no generic needed
export const BulletUI = defineUI({
  name: 'BulletUI',
  render(api, id) {
    const { ctx } = api.services.get('renderer'); // → Canvas2DRenderer ✅
  }
});
```

**Form 1 — direct object** (stateless rendering):
```typescript
import { defineUI } from '@gwen/engine-core';

export const BulletUI = defineUI({
  name: 'BulletUI',
  render(api, id) {
    const pos = api.getComponent(id, Position);
    if (!pos) return;
    const { ctx } = api.services.get('renderer'); // ✅ typed automatically
    ctx.fillStyle = '#fff';
    ctx.fillRect(pos.x - 2, pos.y - 6, 4, 12);
  }
});
```

**Form 2 — factory** (local state in closure, e.g. animation counter):
```typescript
export const PlayerUI = defineUI('PlayerUI', () => {
  // Local state — not shared between entities
  let animFrame = 0;

  return {
    onMount(api, id) {
      animFrame = 0;
    },
    render(api, id) {
      animFrame++;
      const pos = api.getComponent(id, Position);
      if (!pos) return;
      const { ctx } = api.services.get('renderer'); // ✅ typed automatically
      ctx.fillStyle = '#4fffb0';
      ctx.fillRect(pos.x - 16, pos.y - 16, 32, 32);
    },
    onUnmount(api, id) { }
  };
});
```

> See [GwenServices — the global type](#gwenservices--the-global-type) for how automatic typing works.

[Learn more](/core/ui)

---

## defineSystem

Define game systems (pure gameplay logic).

**Form 1 — direct object** (no local state):
```typescript
import { defineSystem } from '@gwen/engine-core';

export const MovementSystem = defineSystem({
  name: 'MovementSystem',
  onUpdate(api, dt) {
    const entities = api.query([Position, Velocity]);
    for (const id of entities) {
      const pos = api.getComponent(id, Position);
      const vel = api.getComponent(id, Velocity);
      if (!pos || !vel) continue;
      api.addComponent(id, Position, {
        x: pos.x + vel.vx * dt,
        y: pos.y + vel.vy * dt,
      });
    }
  }
});
```

> After `gwen prepare`, `api.services.get(...)` is fully typed — no annotation needed.

**Form 2 — factory** (local state in closure, avoids global variables):
```typescript
export const SpawnerSystem = defineSystem('SpawnerSystem', () => {
  let timer = 0; // private state

  return {
    onInit() { timer = 0; },
    onUpdate(api, dt) {
      timer += dt;
      if (timer >= 2.0) {
        timer = 0;
        api.prefabs.instantiate('Enemy', Math.random() * 800, 0);
      }
    }
  };
});

// Registration — call the factory to get an instance
export const GameScene = defineScene('Game', () => ({
  systems: [MovementSystem, SpawnerSystem()], // SpawnerSystem() ← factory call
  onEnter(api) { },
  onExit(api) { }
}));
```

Systems are for game mechanics, entity processing, and state management.

[Learn more](/core/systems)

---

## defineConfig

Configure the engine and register plugins.

> `defineConfig` has only **one form** — a direct configuration object.
> The service types are automatically inferred from `tsPlugins`.

```typescript
import { defineConfig } from '@gwen/engine-core';

export const gwenConfig = defineConfig({
  engine: { maxEntities: 5000, targetFPS: 60, debug: false },
  html: { title: 'My Game', background: '#000000' },
  tsPlugins: [
    new InputPlugin(),
    new AudioPlugin({ masterVolume: 0.8 }),
    new Canvas2DRenderer({ width: 800, height: 600 })
  ]
});
```

The generic parameter `Services` is automatically inferred from the declared `tsPlugins`, enabling type-safe `api.services.get()` calls everywhere.

[Learn more](/core/configuration)

---

## GwenServices — the global type

`GwenServices` is a **global TypeScript type** automatically generated by `gwen prepare` (called automatically by `gwen dev` and `gwen build`).

It is inferred from the `tsPlugins` declared in your `gwen.config.ts` and written into `.gwen/gwen.d.ts` — **no export, no import required anywhere in your project**.

```typescript
// gwen.config.ts — just declare your plugins
import { defineConfig } from '@gwen/engine-core';
import { InputPlugin } from '@gwen/plugin-input';
import { AudioPlugin } from '@gwen/plugin-audio';

export const gwenConfig = defineConfig({
  tsPlugins: [new InputPlugin(), new AudioPlugin({ masterVolume: 0.8 })],
});
```

```typescript
// systems/PlayerSystem.ts — GwenServices available globally, no import
import type { EngineAPI } from '@gwen/engine-core';

export const PlayerSystem = defineSystem({
  name: 'PlayerSystem',
  onUpdate(api: EngineAPI<GwenServices>, dt) {
    const kb = api.services.get('keyboard'); // ✅ Fully typed
  }
});
```

The generated `.gwen/gwen.d.ts` looks like:

```typescript
// .gwen/gwen.d.ts — auto-generated by `gwen prepare`, do not edit
import type { GwenConfigServices } from '@gwen/engine-core';
import type _cfg from '../gwen.config';

declare global {
  type GwenServices = GwenConfigServices<typeof _cfg>;
  // → { keyboard: KeyboardInput; audio: AudioManager; … }
}
```

> Run `gwen prepare` once after adding or removing plugins to refresh the type.

## GwenConfigServices

`GwenConfigServices<T>` is the utility type used internally by `gwen prepare` to extract the merged services map from a `defineConfig()` result. You can also use it directly if you need the services type as a named export (e.g. for a shared library or a custom plugin):

```typescript
import { defineConfig, GwenConfigServices } from '@gwen/engine-core';
import { InputPlugin } from '@gwen/plugin-input';

export const gwenConfig = defineConfig({
  tsPlugins: [new InputPlugin()],
});

// Manual extraction — useful for library authors or advanced use cases
export type MyProjectServices = GwenConfigServices<typeof gwenConfig>;
// → { keyboard: KeyboardInput; mouse: MouseInput; gamepad: GamepadInput }
```

For normal game development, rely on the global `GwenServices` generated by `gwen prepare` instead.

---

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

---

## Quick Comparison

| Helper | Form 1 (object) | Form 2 (factory) | Local state | Services typing |
|--------|----------------|------------------|-------------|-----------------|
| `defineComponent` | ✅ `{ name, schema }` | ✅ `('name', () => ({ schema }))` | — | ✗ no `api` |
| `defineScene` | ✅ `{ name, onEnter, onExit }` | ✅ `('name', () => ({ onEnter, onExit }))` | — | ✅ automatic after `gwen prepare` |
| `definePrefab` | ✅ `{ name, create }` | ✅ `('name', () => ({ create }))` | ✅ closure | ✅ automatic after `gwen prepare` |
| `defineUI` | ✅ `{ name, render }` | ✅ `('name', () => ({ render }))` | ✅ closure | ✅ automatic after `gwen prepare` |
| `defineSystem` | ✅ `{ name, onUpdate }` | ✅ `('name', () => ({ onUpdate }))` | ✅ closure | ✅ automatic after `gwen prepare` |
| `defineConfig` | ✅ `{ engine, tsPlugins }` | ✗ not applicable | — | ✗ inferred from plugins |

**After `gwen prepare` — zero annotations required:**
```typescript
// All of these are fully typed with no annotation
defineSystem({ onUpdate(api, dt) { api.services.get('keyboard') /* → KeyboardInput */ } })
defineUI({ render(api, id) { api.services.get('renderer') /* → Canvas2DRenderer */ } })
defineScene('Game', () => ({ onEnter(api) { api.services.get('audio') /* → AudioManager */ } }))
definePrefab({ create(api) { api.services.get('audio') /* → AudioManager */ } })
```

---

## Next Steps

- [Engine API](/api/engine-api) - Runtime API
- [Types](/api/types) - Type definitions
- [Creating Plugins](/plugins/creating) - Build your own plugins
