# 🔗 API Reference

Complete API documentation for GWEN Engine.

## Table of Contents

1. [Core Classes](#core-classes)
2. [Component System](#component-system)
3. [Query System](#query-system)
4. [Entity Management](#entity-management)
5. [Plugins](#plugins)
6. [Types](#types)

---

## Core Classes

### Engine

Main game engine class that orchestrates the ECS, plugins, and game loop.

```typescript
import { Engine } from '@gwen/engine-core';

const engine = new Engine({
  maxEntities: 5000,
  targetFPS: 60,
  debug: false,
});
```

#### Constructor

```typescript
new Engine(config?: Partial<EngineConfig>)
```

**Config Options:**
- `maxEntities` (number): Max entities allowed (default: 10000)
- `targetFPS` (number): Target frame rate (default: 60)
- `debug` (boolean): Enable debug logging (default: false)

#### Methods

```typescript
// Lifecycle
engine.start(): void
engine.stop(): void
engine.tick(now: number): void

// Entity Management
engine.createEntity(): EntityId
engine.destroyEntity(id: EntityId): boolean
engine.entityExists(id: EntityId): boolean
engine.getEntityCount(): number

// Components
engine.addComponent<S>(id: EntityId, type: ComponentDefinition<S>, data: S): void
engine.removeComponent(id: EntityId, type: ComponentDefinition): boolean
engine.getComponent<T>(id: EntityId, type: ComponentDefinition): T | undefined
engine.hasComponent(id: EntityId, type: ComponentDefinition): boolean

// Queries
engine.query(componentTypes: string[]): EntityId[]
engine.queryWith(componentTypes: string[], filter?: Function): EntityId[]

// Plugins
engine.registerSystem(plugin: TsPlugin): this
engine.getSystem<T>(name: string): T | undefined
engine.hasSystem(name: string): boolean
engine.removeSystem(name: string): boolean

// Events
engine.on(event: string, listener: Function): void
engine.off(event: string, listener: Function): void
engine.emit(event: string, data?: unknown): void

// Stats
engine.getFPS(): number
engine.getDeltaTime(): number
engine.getFrameCount(): number
engine.getStats(): EngineStats
```

#### Events

```typescript
engine.on('start', () => console.log('Game started'));
engine.on('stop', () => console.log('Game stopped'));
engine.on('update', (data) => console.log('Frame:', data.frameCount));
engine.on('entityCreated', (data) => console.log('Entity:', data.id));
engine.on('entityDestroyed', (data) => console.log('Entity destroyed:', data.id));
```

---

## Component System

### defineComponent

Define a reusable component type with schema.

```typescript
import { defineComponent, Types } from '@gwen/engine-core';

export const Position = defineComponent('Position', {
  x: Types.f32,
  y: Types.f32,
  z: Types.f32,
});

export const Health = defineComponent('Health', {
  current: Types.f32,
  max: Types.f32,
});
```

#### Schema Types

```typescript
Types.f32    // 32-bit float
Types.f64    // 64-bit float (double)
Types.i32    // 32-bit signed integer
Types.u32    // 32-bit unsigned integer
Types.bool   // Boolean (stored as u8)
```

#### Using Components

```typescript
const entity = engine.createEntity();

// Add component with data
engine.addComponent(entity, Position, {
  x: 100,
  y: 200,
  z: 0,
});

// Get component data
const pos = engine.getComponent(entity, Position);
if (pos) {
  console.log(pos.x, pos.y, pos.z);
}

// Check if entity has component
if (engine.hasComponent(entity, Position)) {
  console.log('Entity has Position');
}

// Update component
const pos = engine.getComponent(entity, Position);
if (pos) {
  pos.x += 10;
}

// Remove component
engine.removeComponent(entity, Position);
```

---

## Query System

### Querying Entities

Find all entities with specific components.

```typescript
// All entities with Position AND Velocity
const entities = engine.query([Position, Velocity]);

for (const [id, pos, vel] of entities) {
  pos.x += vel.x * dt;
  pos.y += vel.y * dt;
}
```

### Filter Queries

```typescript
// Entities with Position AND Velocity, but only if x > 0
const entities = engine.queryWith(
  [Position, Velocity],
  (id, pos, vel) => pos.x > 0
);
```

### Performance Tips

1. **Cache query results**
   ```typescript
   // Good: cache the query
   const movingEntities = engine.query([Position, Velocity]);
   for (const [id, pos, vel] of movingEntities) {
     // ...
   }

   // Bad: query every frame
   for (const [id, pos, vel] of engine.query([Position, Velocity])) {
     // ...
   }
   ```

2. **Use archetypes wisely**
   ```typescript
   // More specific queries are faster
   engine.query([Position, Velocity, Sprite]) // ~1μs (cached)
   ```

3. **Avoid query in loops**
   ```typescript
   // Good
   const entities = engine.query([Position]);
   for (const [id, pos] of entities) {
     // ...
   }

   // Bad - queries 1000 times
   for (let i = 0; i < 1000; i++) {
     const e = engine.query([Position])[i];
   }
   ```

---

## Entity Management

### Entity ID

Unique identifier for an entity.

```typescript
type EntityId = number;
```

### Creating Entities

```typescript
const player = engine.createEntity();
const enemy = engine.createEntity();
```

### Destroying Entities

```typescript
const id = engine.createEntity();
engine.destroyEntity(id); // Returns true if destroyed

// Safe to destroy twice (returns false)
engine.destroyEntity(id); // false
```

### Entity Lifetime

```
Create → [Add/Remove Components] → Destroy

// Check state
engine.entityExists(id) // true while alive
```

---

## Plugins

### TsPlugin Interface

```typescript
interface TsPlugin {
  name: string;
  version?: string;

  onInit?(api: EngineAPI): void;
  onBeforeUpdate?(api: EngineAPI, dt: number): void;
  onUpdate?(api: EngineAPI, dt: number): void;
  onRender?(api: EngineAPI): void;
  onDestroy?(): void;
}
```

### Creating a Plugin

```typescript
import { GwenPlugin } from '@gwen/engine-core';

export class MyPlugin implements GwenPlugin {
  name = 'MyPlugin';
  version = '1.0.0';

  onInit(api) {
    console.log('Plugin initialized');
  }

  onUpdate(api, dt) {
    // Update every frame
    const entities = api.query([Position]);
    for (const [id, pos] of entities) {
      pos.x += 10 * dt;
    }
  }

  onRender(api) {
    // Render every frame
  }

  onDestroy() {
    // Cleanup
  }
}
```

### Registering Plugins

```typescript
const plugin = new MyPlugin();
engine.registerSystem(plugin);

// Get plugin later
const retrieved = engine.getSystem('MyPlugin');

// Check if exists
if (engine.hasSystem('MyPlugin')) {
  // ...
}

// Remove plugin
engine.removeSystem('MyPlugin');
```

### EngineAPI

Available inside plugins via `onInit`, `onUpdate`, `onRender`.

```typescript
interface EngineAPI {
  // Entity creation/destruction
  createEntity(): EntityId;
  destroyEntity(id: EntityId): boolean;

  // Component management
  addComponent(id, type, data): void;
  getComponent(id, type): T | undefined;
  removeComponent(id, type): boolean;
  hasComponent(id, type): boolean;

  // Queries
  query(types): [EntityId, Component, ...][];
  queryWith(types, filter): [EntityId, Component, ...][];

  // Service registry
  services: ServiceLocator;

  // Stats
  deltaTime: number;
  frameCount: number;
}
```

---

## Types

### EngineConfig

```typescript
interface EngineConfig {
  maxEntities: number;      // Max entities (default: 10000)
  targetFPS: number;        // Target FPS (default: 60)
  debug: boolean;           // Debug logging (default: false)
}
```

### ComponentType

```typescript
type ComponentType = string | ComponentDefinition;
```

### EntityId

```typescript
type EntityId = number;
```

### EngineStats

```typescript
interface EngineStats {
  fps: number;
  frameCount: number;
  deltaTime: number;
  entityCount: number;
  isRunning: boolean;
  wasmActive: boolean;
}
```

---

## Examples

### Complete Game Loop

```typescript
import { Engine, defineComponent, Types } from '@gwen/engine-core';
import { Canvas2DRenderer } from '@gwen/renderer-canvas2d';

// Define components
const Position = defineComponent('Position', {
  x: Types.f32,
  y: Types.f32,
});

const Velocity = defineComponent('Velocity', {
  x: Types.f32,
  y: Types.f32,
});

// Create engine
const engine = new Engine({
  maxEntities: 1000,
  targetFPS: 60,
});

// Register renderer
engine.registerSystem(new Canvas2DRenderer({
  canvas: document.getElementById('game') as HTMLCanvasElement,
}));

// Create player
const player = engine.createEntity();
engine.addComponent(player, Position, { x: 0, y: 0 });
engine.addComponent(player, Velocity, { x: 100, y: 0 });

// Update loop via plugin
engine.registerSystem({
  name: 'movement',
  onUpdate(api, dt) {
    const entities = api.query([Position, Velocity]);
    for (const [id, pos, vel] of entities) {
      pos.x += vel.x * dt;
      pos.y += vel.y * dt;
    }
  },
});

// Start
engine.start();
```

---

## Advanced Topics

### Custom Plugin with State

```typescript
export class ScoreSystem implements GwenPlugin {
  name = 'ScoreSystem';
  private score = 0;

  onInit(api) {
    api.services.register('score', {
      getScore: () => this.score,
      addScore: (n) => this.score += n,
    });
  }

  onUpdate(api, dt) {
    // Update game logic
  }
}
```

### Service Locator Pattern

```typescript
// Register service
engine.registerSystem(plugin);

// Other plugins can access services
const scoreService = api.services.get('score');
scoreService.addScore(10);
```

---

## Performance Characteristics

| Operation | Time | Complexity |
|-----------|------|-----------|
| Create entity | ~1μs | O(1) |
| Destroy entity | ~1μs | O(1) |
| Add component | ~1μs | O(1) |
| Query (cached) | ~1μs | O(n) results |
| Update 1K entities | ~2ms | O(n) |

---

**For more examples, check the [playground](https://github.com/djodjonx/gwen/tree/main/playground).**


