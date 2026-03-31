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
9. [Canonical Component API](#canonical-component-api)
10. [GwenPlugin Interface](#gwenplugin-interface)
11. [Types](#types)

---

## Engine Setup

The recommended entry point for game projects is `createEngine()`:

```typescript
import { createEngine, initWasm } from '@djodjonx/gwen-engine-core';
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
import { defineComponent, Types } from '@djodjonx/gwen-engine-core';

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

// Spatial primitives — packed f32 arrays
Types.vec2    // { x, y }       — 2 × f32 (8 bytes)
Types.vec3    // { x, y, z }    — 3 × f32 (12 bytes)
Types.vec4    // { x, y, z, w } — 4 × f32 (16 bytes)
Types.quat    // { x, y, z, w } — 4 × f32 (16 bytes), identity: (0,0,0,1)
Types.color   // { r, g, b, a } — 4 × f32 (16 bytes), range [0, 1]
```

### InferComponent

Extract the TypeScript type from a component definition:

```typescript
import { InferComponent } from '@djodjonx/gwen-engine-core';

export type PositionData = InferComponent<typeof Position>;
// → { x: number; y: number }
```

---

## defineScene

Define a game scene with systems, UI, and lifecycle hooks.

```typescript
import { defineScene } from '@djodjonx/gwen-engine-core';

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
import { defineSystem } from '@djodjonx/gwen-engine-core';

// Form 1 — direct object (no local state)
export const MovementSystem = defineSystem({
  name: 'MovementSystem',
  onInit(api) { /* setup */ },
  onUpdate(api, dt) {
    const entities = api.query([Position, Velocity]);
    for (const id of entities) {
      const pos = api.component.get(id, Position);
      const vel = api.component.get(id, Velocity);
      if (!pos || !vel) continue;
      api.component.set(id, Position, {
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
import { definePrefab } from '@djodjonx/gwen-engine-core';

export const PlayerPrefab = definePrefab({
  name: 'Player',
  create: (api) => {
    const id = api.entity.create();
    api.component.add(id, Position, { x: 240, y: 560 });
    api.component.add(id, Health, { current: 3, max: 3 });
    return id;
  },
});

// With parameters
export const EnemyPrefab = definePrefab({
  name: 'Enemy',
  create: (api, x: number, y: number) => {
    const id = api.entity.create();
    api.component.add(id, Position, { x, y });
    return id;
  },
});
```

---

## defineUI

Define a renderer-agnostic UI component.

```typescript
import { defineUI } from '@djodjonx/gwen-engine-core';

export const PlayerUI = defineUI<GwenServices>({
  name: 'PlayerUI',
  onMount(api, entityId) { /* allocate DOM / canvas resources */ },
  render(api, entityId) {
    const pos = api.component.get(entityId, Position);
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
import { UIComponent } from '@djodjonx/gwen-engine-core';

const player = api.entity.create();
api.component.add(player, UIComponent, { uiName: 'PlayerUI' });
```

---

## defineConfig

Configure the engine and register plugins. Returns a `TypedEngineConfig` with inferred services.

```typescript
import { defineConfig } from '@djodjonx/gwen-kit';
import { InputPlugin } from '@djodjonx/gwen-plugin-input';
import { AudioPlugin } from '@djodjonx/gwen-plugin-audio';
import { Canvas2DRenderer } from '@djodjonx/gwen-renderer-canvas2d';

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
  plugins: [
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
interface EngineAPI<M extends object = GwenDefaultServices> {
  // Canonical component namespace
  readonly component: ComponentAPI;

  // Canonical entity namespace
  readonly entity: EntityAPI;

  // Ad-hoc query — returns EntityId[]
  query(componentTypes: Array<ComponentType | ComponentDefinition<any>>): EntityId[];

  // Services
  services: TypedServiceLocator<M>;

  // Hooks
  readonly hooks: GwenHookable<H>;

  // Prefabs
  readonly prefabs: PrefabManager;

  // Scene navigator (null in headless contexts)
  readonly scene: SceneNavigator | null;

  // Frame state
  readonly deltaTime: number;
  readonly frameCount: number;

  // WASM engine (power-user)
  readonly wasm: WasmEngine;
}
```

### ComponentAPI (`api.component.*`)

```typescript
interface ComponentAPI {
  add(id, def, data): void;         // Attach / overwrite a component
  set(id, def, patch): void;        // Upsert — merges patch onto existing or defaults
  get(id, def): T | undefined;      // Read, returns undefined if absent
  getOrThrow(id, def): T;           // Read, throws [GWEN] error if absent
  remove(id, def): boolean;         // Remove, returns true if it existed
  has(id, def | string): boolean;   // Presence check (also works for tags)
}
```

### EntityAPI (`api.entity.*`)

```typescript
interface EntityAPI {
  create(): EntityId;               // Allocate a new entity
  destroy(id): boolean;             // Destroy entity + all components
  isAlive(id): boolean;             // Generation-safe liveness check
  getGeneration(slotIndex): number; // Raw slot → generation (for WASM interop)
  tag(id, tag): void;               // Add marker-component
  untag(id, tag): void;             // Remove marker-component
  hasTag(id, tag): boolean;         // Check marker-component presence
}
```

---

## Canonical Component API

Use `api.component.*` and `api.entity.*` in all plugin and system code.

### Component operations

```typescript
import { defineComponent, Types } from '@djodjonx/gwen-engine-core';

const Transform = defineComponent({
  name: 'Transform',
  schema: {
    position: Types.vec3,
    rotation: Types.quat,
  },
  defaults: {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
  },
});

// In onInit or spawn:
api.component.add(entityId, Transform, {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
});

// In onUpdate (partial patch, no allocation):
api.component.set(entityId, Transform, { position: { x: 1, y: 0, z: 0 } });

// Read:
const t = api.component.get(entityId, Transform);
```

### Entity operations

```typescript
// Create
const id = api.entity.create();

// Tags (marker components for query filtering)
api.entity.tag(id, 'grounded');
api.entity.hasTag(id, 'grounded'); // → true
api.entity.untag(id, 'grounded');

// Destroy
api.entity.destroy(id);
```

---

## GwenPlugin Interface

Create typed plugins that expose services to `api.services`.

```typescript
import type { GwenPlugin, EngineAPI } from '@djodjonx/gwen-engine-core';

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
  plugins: [new MyPlugin()],
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
  plugins?: TsPlugin[];
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
