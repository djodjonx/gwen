# Types

Type definitions used throughout GWEN.

## Component Schema Types

```typescript
import { Types } from '@gwen/engine-core';

Types.f32      // 32-bit float
Types.f64      // 64-bit double
Types.i32      // 32-bit signed integer
Types.u32      // 32-bit unsigned integer
Types.bool     // Boolean
Types.string   // String
```

## EngineAPI

Main API interface:

```typescript
interface EngineAPI<S = unknown> {
  // Entity
  createEntity(): number;
  destroyEntity(id: number): void;
  entityExists(id: number): boolean;

  // Components
  addComponent<T>(id: number, type: ComponentDefinition<T>, data: T): void;
  getComponent<T>(id: number, type: ComponentDefinition<T>): T | undefined;
  removeComponent(id: number, type: ComponentDefinition): boolean;
  hasComponent(id: number, type: ComponentDefinition): boolean;

  // Queries
  query(componentNames: string[]): number[];

  // Prefabs
  prefabs: {
    register(prefab: PrefabDefinition): void;
    instantiate(name: string, ...args: any[]): number;
  };

  // Services
  services: {
    get<K extends keyof S>(name: K): S[K];
    register<K extends keyof S>(name: K, service: S[K]): void;
  };

  // Scene
  scene: {
    load(scene: SceneDefinition): void;
  };

  // Events
  emit(event: string, data?: any): void;
  on(event: string, listener: Function): void;
}
```

## ComponentDefinition

```typescript
interface ComponentDefinition<T = any> {
  name: string;
  schema: Record<string, ComponentType>;
}
```

## PrefabDefinition

```typescript
interface PrefabDefinition {
  name: string;
  create: (api: EngineAPI, ...args: any[]) => number;
}
```

## SceneDefinition

```typescript
interface SceneDefinition {
  name: string;
  factory: () => {
    ui?: UIDefinition[];
    plugins?: PluginDefinition[];
    onEnter?: (api: EngineAPI) => void;
    onExit?: (api: EngineAPI) => void;
  };
}
```

## PluginDefinition

```typescript
interface PluginDefinition {
  name: string;
  onInit?(api: EngineAPI): void;
  onUpdate?(api: EngineAPI, dt: number): void;
  onDestroy?(api: EngineAPI): void;
}
```

## UIDefinition

```typescript
interface UIDefinition<S = unknown> {
  name: string;
  render(api: EngineAPI<S>, entityId: number): void;
}
```

## Next Steps

- [Helpers](/api/helpers) - Helper functions
- [Engine API](/api/engine-api) - Runtime API

