# Types

Type definitions used throughout GWEN.

## Schema Types

```typescript
import { Types } from '@gwen/engine-core';

Types.f32
Types.f64
Types.i32
Types.u32
Types.bool
Types.string
```

## EngineAPI (runtime surface)

```typescript
type EntityId = number;
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

## Notes

- `EngineAPI` does **not** expose `entityExists`, `emit`, or `on`.
- Scene loading uses `api.scene?.load('SceneName')` (string name), not a scene object.
- For exact contracts, see exported types from `@gwen/engine-core`.

## Next Steps

- [Helpers](/api/helpers)
- [Engine API](/api/engine-api)
