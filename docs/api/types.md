# Types

Type definitions used throughout GWEN.

## Schema Types

```typescript
import { Types } from '@gwen/engine-core';

Types.f32    // 32-bit float (most common for positions, velocities)
Types.f64    // 64-bit float (double precision)
Types.i32    // 32-bit signed integer
Types.i64    // 64-bit signed integer (bigint in JS)
Types.u32    // 32-bit unsigned integer
Types.u64    // 64-bit unsigned integer (bigint in JS)
Types.bool   // Boolean
Types.string // String (stored as UTF-8 intern ID)
```

## EngineAPI (runtime surface)

```typescript
type EntityId = bigint & { readonly __brand: unique symbol };
type ComponentType = string;

interface EngineAPI<M extends Record<string, unknown> = Record<string, unknown>> {
  // Entity
  createEntity(): EntityId;
  destroyEntity(id: EntityId): boolean;

  // Components
  addComponent<T>(id: EntityId, type: ComponentType, data: T): void;
  getComponent<T>(id: EntityId, type: ComponentType): T | undefined;
  hasComponent(id: EntityId, type: ComponentType): boolean;
  removeComponent(id: EntityId, type: ComponentType): boolean;

  // Queries
  query(componentTypes: Array<ComponentType | ComponentDefinition<any>>): EntityId[];

  // Services
  services: TypedServiceLocator<M>;

  // Prefabs
  prefabs: PrefabManager;

  // Scene navigator (nullable)
  scene: SceneNavigator | null;

  // Frame state
  deltaTime: number;
  frameCount: number;
}
```

## SceneNavigator

```typescript
interface SceneNavigator {
  load(name: string): void;
  current: string | null;
}
```

## ComponentDefinition

```typescript
interface ComponentDefinition<S extends ComponentSchema = ComponentSchema> {
  name: string;
  schema: S;
}
```

## PrefabDefinition

```typescript
interface PrefabDefinition<Args extends unknown[] = unknown[]> {
  name: string;
  create: (api: EngineAPI, ...args: Args) => EntityId;
}
```

## UIDefinition

```typescript
interface UIDefinition<Services extends Record<string, unknown> = Record<string, unknown>> {
  name: string;
  onMount?(api: EngineAPI<Services>, entityId: EntityId): void;
  render(api: EngineAPI<Services>, entityId: EntityId): void;
  onUnmount?(api: EngineAPI<Services>, entityId: EntityId): void;
}
```

## Plugin Entry

```typescript
type PluginEntry = TsPlugin | (() => TsPlugin);
```

## InferComponent

Extract the TypeScript type from a `ComponentDefinition`:

```typescript
import { defineComponent, Types, InferComponent } from '@gwen/engine-core';

export const Health = defineComponent({
  name: 'health',
  schema: { current: Types.f32, max: Types.f32 }
});

export type HealthData = InferComponent<typeof Health>;
// → { current: number; max: number }
```

## Automatic service typing — `GwenDefaultServices`

After `gwen prepare`, all `define*` helpers are **fully typed automatically** — no annotation, no import, no generic needed:

```typescript
// systems/PlayerSystem.ts — zero annotation after gwen prepare
export const PlayerSystem = defineSystem({
  name: 'PlayerSystem',
  onUpdate(api, dt: number) {
    const kb = api.services.get('keyboard'); // ✅ KeyboardInput — automatically
  }
});
```

This works because `gwen prepare` enriches the global `GwenDefaultServices` interface — used as the default generic for `EngineAPI`, `defineUI`, etc. — with your project's actual services.

Generated `.gwen/gwen.d.ts`:
```typescript
declare global {
  interface GwenDefaultServices extends _GwenServices {}
  type GwenAPI = EngineAPI<GwenDefaultServices>; // convenience alias
  type GwenServices = _GwenServices;             // kept for compatibility
}
```

> Run `gwen prepare` once after adding or removing plugins (`gwen dev` / `gwen build` do it automatically).

## GwenConfigServices

`GwenConfigServices<T>` is the utility type used by `gwen prepare` to extract the merged services map from a `defineConfig()` result. For normal game development, use the global `GwenServices` instead. Use `GwenConfigServices` for advanced cases (shared libraries, custom tooling):

```typescript
import { defineConfig, GwenConfigServices } from '@gwen/engine-core';
import { InputPlugin } from '@gwen/plugin-input';

const gwenConfig = defineConfig({
  plugins: [new InputPlugin()],
});

// Advanced / library use case only
export type MyProjectServices = GwenConfigServices<typeof gwenConfig>;
// → { keyboard: KeyboardInput; mouse: MouseInput; gamepad: GamepadInput }
```

## Scene

```typescript
interface Scene {
  readonly name: string;
  systems?: PluginEntry[];
  ui?: UIDefinition[];
  layout?: string;            // Optional HTML injected into #gwen-ui
  onEnter(api: EngineAPI): void;
  onExit(api: EngineAPI): void;
  onUpdate?(api: EngineAPI, deltaTime: number): void;
  onRender?(api: EngineAPI): void;
}
```

## Notes

- `EngineAPI` does **not** expose `entityExists`, `emit`, or `on`.
- Scene loading uses `api.scene?.load('SceneName')` (string name), not a scene object.
- `i64` / `u64` fields are `bigint` in JavaScript, not `number`.
- For exact contracts, see exported types from `@gwen/engine-core`.

## Next Steps

- [Helpers](/api/helpers)
- [Engine API](/api/engine-api)
