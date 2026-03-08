# 🔗 API Reference

Complete API documentation for GWEN Engine.

> **Note:** For the VitePress documentation site, see the `/api/` section.
> This file is the exhaustive technical reference.

## Table of Contents

1. [Engine Setup](#engine-setup)
2. [defineComponent](#definecomponent)
3. [defineScene](#definescene)
4. [defineSystem](#definesystem)
5. [definePrefab](#defineprefab)
6. [defineUI](#defineui)
7. [defineConfig](#defineconfig)
8. [EngineAPI](#engineapi)
9. [GwenPlugin Interface](#gwenplugin-interface)
10. [Types](#types)

---

## Engine Setup

The recommended entry point for game projects is `createEngine()`:

```typescript
import { createEngine, initWasm } from '@gwen/engine-core';
import gwenConfig from '../gwen.config';

await initWasm();
const { engine, scenes } = createEngine(gwenConfig);

scenes.register(GameScene);
scenes.loadSceneImmediate('Game', engine.getAPI());

engine.start();
```

### Engine Lifecycle Methods

```typescript
engine.start(): void     // Start the game loop
engine.stop(): void      // Stop the game loop
engine.getAPI(): EngineAPI  // Get the EngineAPI (for manual use)
engine.registerSystem(plugin: TsPlugin): this  // Register a plugin manually
```

---

## defineComponent

Define a reusable ECS component with a typed schema.

```typescript
import { defineComponent, Types } from '@gwen/engine-core';

// Form 1 — direct object (recommended)
export const Position = defineComponent({
  name: 'position',
  schema: {
    x: Types.f32,
    y: Types.f32,
  },
});

// Form 2 — factory (for dynamic schemas)
export const Health = defineComponent('health', () => ({
  schema: {
    current: Types.f32,
    max: Types.f32,
  },
}));
```

### Schema Types

```typescript
Types.f32     // 32-bit float (recommended for positions, velocities)
Types.f64     // 64-bit float (double precision)
Types.i32     // 32-bit signed integer
Types.i64     // 64-bit signed integer (bigint in JS)
Types.u32     // 32-bit unsigned integer
Types.u64     // 64-bit unsigned integer (bigint in JS)
Types.bool    // Boolean
Types.string  // String (stored as UTF-8 intern ID)
```

### InferComponent

Extract the TypeScript type from a component definition:

```typescript
import { InferComponent } from '@gwen/engine-core';

export type PositionData = InferComponent<typeof Position>;
// → { x: number; y: number }
```

---

## defineScene

Define a game scene with systems, UI, and lifecycle hooks.

```typescript
import { defineScene } from '@gwen/engine-core';

// Form 1 — direct object
export const PauseScene = defineScene({
  name: 'Pause',
  systems: [],
  ui: [],
  onEnter(api) { /* setup */ },
  onExit(api)  { /* cleanup */ },
});

// Form 2 — factory (with typed dependencies)
export const GameScene = defineScene('Game', () => ({
  systems: [MovementSystem, CollisionSystem, PlayerSystem],
  ui: [PlayerUI, EnemyUI, ScoreUI],
  layout: `<div id="hud"></div>`,  // Optional HTML injected into #gwen-ui
  onEnter(api) {
    api.prefabs.register(PlayerPrefab);
    api.prefabs.instantiate('Player');
  },
  onExit(api) { /* cleanup */ },
}));
// GameScene is a factory — call it with no args to get the Scene:
// scenes.register(GameScene()); // or scenes.register(GameScene) if no-arg factory
```

### Scene Interface

```typescript
interface Scene {
  readonly name: string;
  systems?: PluginEntry[];           // Systems run each frame
  ui?: UIDefinition[];               // UI rendered each frame
  layout?: string;                   // Optional HTML for #gwen-ui
  onEnter(api: EngineAPI): void;     // Called when scene becomes active
  onExit(api: EngineAPI): void;      // Called before scene is replaced
  onUpdate?(api: EngineAPI, dt: number): void;  // Optional per-frame logic
  onRender?(api: EngineAPI): void;              // Optional per-frame render
}
```

### Scene Navigation

```typescript
// Inside a system — schedule transition at next frame
api.scene?.load('GameOver');

// At startup — immediate transition
scenes.loadSceneImmediate('MainMenu', engine.getAPI());
```

---

## defineSystem

Define a gameplay system with optional local state.

```typescript
import { defineSystem } from '@gwen/engine-core';

// Form 1 — direct object (no local state)
export const MovementSystem = defineSystem({
  name: 'MovementSystem',
  onInit(api) { /* setup */ },
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
  },
  onDestroy() { /* cleanup */ },
});

// Form 2 — factory (with local state in closure)
export const SpawnerSystem = defineSystem('SpawnerSystem', () => {
  let timer = 0;
  return {
    onInit() { timer = 0; },
    onUpdate(api, dt) {
      timer += dt;
      if (timer >= 2.0) {
        timer = 0;
        api.prefabs.instantiate('Enemy', Math.random() * 800, 0);
      }
    },
  };
});
```

---

## definePrefab

Define a reusable entity template.

```typescript
import { definePrefab } from '@gwen/engine-core';

export const PlayerPrefab = definePrefab({
  name: 'Player',
  create: (api) => {
    const id = api.createEntity();
    api.addComponent(id, Position, { x: 240, y: 560 });
    api.addComponent(id, Health, { current: 3, max: 3 });
    return id;
  },
});

// With parameters
export const EnemyPrefab = definePrefab({
  name: 'Enemy',
  create: (api, x: number, y: number) => {
    const id = api.createEntity();
    api.addComponent(id, Position, { x, y });
    return id;
  },
});
```

---

## defineUI

Define a renderer-agnostic UI component.

```typescript
import { defineUI } from '@gwen/engine-core';

export const PlayerUI = defineUI<GwenServices>({
  name: 'PlayerUI',
  onMount(api, entityId) { /* allocate DOM / canvas resources */ },
  render(api, entityId) {
    const pos = api.getComponent(entityId, Position);
    if (!pos) return;
    const { ctx } = api.services.get('renderer');
    ctx.fillStyle = '#4fffb0';
    ctx.fillRect(pos.x - 16, pos.y - 16, 32, 32);
  },
  onUnmount(api, entityId) { /* release resources */ },
});
```

Link a UI to an entity with `UIComponent`:

```typescript
import { UIComponent } from '@gwen/engine-core';

const player = api.createEntity();
api.addComponent(player, UIComponent, { uiName: 'PlayerUI' });
```

---

## defineConfig

Configure the engine and register plugins. Returns a `TypedEngineConfig` with inferred services.

```typescript
import { defineConfig } from '@gwen/kit';
import { InputPlugin } from '@gwen/plugin-input';
import { AudioPlugin } from '@gwen/plugin-audio';
import { Canvas2DRenderer } from '@gwen/renderer-canvas2d';

export const gwenConfig = defineConfig({
  engine: {
    maxEntities: 5000,   // default: 5000
    targetFPS: 60,       // default: 60
    debug: false,
  },
  html: {
    title: 'My Game',
    background: '#000000',
  },
  tsPlugins: [
    new InputPlugin(),
    new AudioPlugin({ masterVolume: 0.8 }),
    new Canvas2DRenderer({ width: 800, height: 600 }),
  ],
  wasmPlugins: [],
  mainScene: 'MainMenu',   // Optional: scene to load at startup
  scenes: 'auto',          // 'auto' | false
});

// After running `gwen prepare` (automatic with gwen dev / gwen build),
// GwenServices is available globally — no import needed anywhere.
```

---

## EngineAPI

The runtime API available inside all systems, scenes, plugins, prefabs and UI components.

```typescript
interface EngineAPI<M extends Record<string, unknown> = Record<string, unknown>> {
  // Entity
  createEntity(): EntityId;
  destroyEntity(id: EntityId): boolean;

  // Components
  addComponent<T>(id: EntityId, type: ComponentType, data: T): void;
  addComponent<D extends ComponentDefinition<ComponentSchema>>(
    id: EntityId, type: D, data: InferComponent<D>
  ): void;
  getComponent<T>(id: EntityId, type: ComponentType): T | undefined;
  getComponent<D extends ComponentDefinition<ComponentSchema>>(
    id: EntityId, type: D
  ): InferComponent<D> | undefined;
  hasComponent(id: EntityId, type: ComponentType | ComponentDefinition<any>): boolean;
  removeComponent(id: EntityId, type: ComponentType | ComponentDefinition<any>): boolean;

  // Queries — returns EntityId[]
  query(componentTypes: Array<ComponentType | ComponentDefinition<any>>): EntityId[];

  // Services
  services: TypedServiceLocator<M>;

  // Prefabs
  prefabs: PrefabManager;

  // Scene navigator (null in headless contexts)
  scene: SceneNavigator | null;

  // Frame state
  readonly deltaTime: number;
  readonly frameCount: number;
}
```

**Not in EngineAPI:**
- `entityExists()` — not exposed
- `emit()` / `on()` — use plugin/service patterns instead

---

## GwenPlugin Interface

Create typed plugins that expose services to `api.services`.

```typescript
import type { GwenPlugin, EngineAPI } from '@gwen/engine-core';

export interface MyService {
  doSomething(): void;
}

export class MyPlugin implements GwenPlugin<'MyPlugin', { myService: MyService }> {
  readonly name = 'MyPlugin' as const;
  readonly provides = { myService: {} as MyService };

  onInit(api: EngineAPI): void {
    api.services.register('myService', { doSomething: () => console.log('Hello!') });
  }

  onBeforeUpdate?(api: EngineAPI, dt: number): void { /* input capture */ }
  onUpdate?(api: EngineAPI, dt: number): void { /* per-frame logic */ }
  onRender?(api: EngineAPI): void { /* rendering */ }
  onDestroy?(): void { /* cleanup */ }
}
```

Register in config:

```typescript
export const gwenConfig = defineConfig({
  tsPlugins: [new MyPlugin()],
});
```

---

## Types

### EngineConfig

```typescript
interface EngineConfig {
  maxEntities: number;   // Max entities (default: 5000)
  targetFPS: number;     // Target FPS (default: 60)
  debug?: boolean;       // Debug logging (default: false)
  enableStats?: boolean; // Performance stats (default: true)
  wasmPlugins?: WasmPlugin[];
  tsPlugins?: TsPlugin[];
}
```

### EntityId

```typescript
type EntityId = bigint & { readonly __brand: unique symbol };
```

### EngineStats

```typescript
interface EngineStats {
  fps: number;
  frameCount: number;
  deltaTime: number;
  entityCount: number;
  isRunning: boolean;
}
```

### SceneNavigator

```typescript
interface SceneNavigator {
  load(name: string): void;    // Schedule scene transition
  readonly current: string | null;
}
```

### TypedServiceLocator

```typescript
interface TypedServiceLocator<M extends Record<string, unknown>> {
  register<K extends keyof M & string>(name: K, instance: M[K]): void;
  get<K extends keyof M & string>(name: K): M[K];
  has(name: string): boolean;
}
```

### GwenConfigServices

```typescript
// Extracts the inferred service map from a defineConfig() result
type GwenConfigServices<C> =
  C extends TypedEngineConfig<infer S> ? S : Record<string, unknown>;
```

---

## Performance Characteristics

| Operation | Time | Notes |
|-----------|------|-------|
| `createEntity()` | ~1μs | O(1) amortized |
| `destroyEntity()` | ~1μs | O(1) |
| `addComponent()` | ~1–5μs | Includes WASM serialization |
| `query()` | ~1μs | O(n) over matching entities |
| 1K entities update | ~2ms | Depends on component count |

---

**For more examples, check the [playground](https://github.com/djodjonx/gwen/tree/main/playground) and the [VitePress docs](/guide/quick-start).**
