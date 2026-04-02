# 🔌 GWEN Hooks Usage Guide

## Introduction

GWEN uses `@unjs/hookable` (version 5.5.3) to manage engine hooks. Hooks allow plugins to extend and customize engine behavior without modifying its internal code.

## Key Concepts

### What is a hook?

A hook is a named extension point in the engine where plugins can register handlers. When the engine reaches that point, all registered handlers for that hook are called **in registration order**.

### Synchronous vs asynchronous hooks

- **Informational hooks**: handlers return nothing (`void`)
- **Asynchronous hooks**: `callHook()` returns a Promise that you must await

## Hooks API

### Registering a hook

```typescript
import { defineSystem } from '@djodjonx/gwen-engine-core';

export const MySystem = defineSystem({
  name: 'MySystem',

  onInit(api) {
    // Register a handler for 'entity:create'
    api.hooks.hook('entity:create', (id) => {
      console.log(`Entity created: ${id}`);
    });

    // The hook returns an unregister function
    const unregister = api.hooks.hook('entity:destroy', (id) => {
      console.log(`Entity destroyed: ${id}`);
    });

    // You can unregister later
    // unregister();
  }
});
```

### Calling a hook

Hooks are normally called automatically by the engine. But you can also call them manually:

```typescript
// Informational hook (synchronous)
api.hooks.callHook('my:custom:hook', data);

// With await (for async hooks)
await api.hooks.callHook('my:async:hook', data);
```

### Execution order

Handlers for the same hook are executed **sequentially**, in registration order:

```typescript
api.hooks.hook('test', () => console.log('1. First'));
api.hooks.hook('test', () => console.log('2. Second'));
api.hooks.hook('test', () => console.log('3. Third'));

await api.hooks.callHook('test');
// Output:
// 1. First
// 2. Second
// 3. Third
```

## System Hooks

### 🎮 Engine Lifecycle

| Hook | Parameters | Description |
|------|-----------|------------|
| `engine:init` | - | Engine initialized |
| `engine:start` | - | Game loop started |
| `engine:stop` | - | Game loop stopped |
| `engine:tick` | `deltaTime: number` | Each frame |

### 🧩 Plugin Lifecycle

| Hook | Parameters | Description |
|------|-----------|------------|
| `plugin:register` | `plugin: TsPlugin` | Plugin registered |
| `plugin:init` | `plugin: TsPlugin, api: EngineAPI` | Plugin initialized |
| `plugin:beforeUpdate` | `api: EngineAPI, dt: number` | Before update (input capture) |
| `plugin:update` | `api: EngineAPI, dt: number` | After WASM (game logic) |
| `plugin:render` | `api: EngineAPI` | Render |
| `plugin:destroy` | `plugin: TsPlugin` | Plugin destroyed |

### 🎬 Entity Management

| Hook | Parameters | Description |
|------|-----------|------------|
| `entity:create` | `id: EntityId` | Entity created |
| `entity:destroy` | `id: EntityId` | Before destruction |
| `entity:destroyed` | `id: EntityId` | After destruction |

### 📦 Component Management

| Hook | Parameters | Description |
|------|-----------|------------|
| `component:add` | `id: EntityId, type: string, data: unknown` | Component added |
| `component:remove` | `id: EntityId, type: string` | Before removal |
| `component:removed` | `id: EntityId, type: string` | After removal |
| `component:update` | `id: EntityId, type: string, data: unknown` | Component updated |

### 🎪 Scene Management

| Hook | Parameters | Description |
|------|-----------|------------|
| `scene:beforeLoad` | `name: string` | Before loading |
| `scene:load` | `name: string` | Scene loaded |
| `scene:loaded` | `name: string` | After loading |
| `scene:beforeUnload` | `name: string` | Before unloading |
| `scene:unload` | `name: string` | Scene unloaded |
| `scene:unloaded` | `name: string` | After unloading |

### 🔧 Custom Hooks

You can create your own hooks:

```typescript
export const PhysicsPlugin = defineSystem({
  name: 'PhysicsPlugin',

  onUpdate(api, dt) {
    // Emit a custom hook
    api.hooks.callHook('physics:collision' as any, {
      bodyA: entity1,
      bodyB: entity2
    });
  }
});

// Register a handler
api.hooks.hook('physics:collision' as any, (event) => {
  console.log('Collision between', event.bodyA, event.bodyB);
});
```

## Practical Examples

### 1. Profiling plugin

Measure the performance of your systems:

```typescript
export const ProfilingPlugin = defineSystem({
  name: 'Profiling',

  onInit(api) {
    const timings = new Map<string, number[]>();

    api.hooks.hook('plugin:beforeUpdate', (_, dt) => {
      performance.mark('update-start');
    });

    api.hooks.hook('plugin:update', (_, dt) => {
      performance.mark('update-end');
      performance.measure('update', 'update-start', 'update-end');
    });
  }
});
```

### 2. Validation plugin

Validate data before it is added:

```typescript
export const ValidationPlugin = defineSystem({
  name: 'Validation',

  onInit(api) {
    api.hooks.hook('component:add', (id, type, data) => {
      if (type === 'Position' && (!data.x || !data.y)) {
        throw new Error('Position requires x and y');
      }
    });
  }
});
```

### 3. Persistence plugin

Record entity changes:

```typescript
export const PersistencePlugin = defineSystem({
  name: 'Persistence',

  onInit(api) {
    const changes: any[] = [];

    api.hooks.hook('entity:create', (id) => {
      changes.push({ type: 'create', id, timestamp: Date.now() });
    });

    api.hooks.hook('component:add', (id, componentType, data) => {
      changes.push({
        type: 'component:add',
        id,
        componentType,
        data,
        timestamp: Date.now()
      });
    });

    // Save periodically
    setInterval(() => {
      console.log('Saving changes:', changes);
      changes.length = 0;
    }, 5000);
  }
});
```

### 4. Debug plugin

Log all events for debugging:

```typescript
export const DebugEventsPlugin = defineSystem({
  name: 'DebugEvents',

  onInit(api) {
    if (!api.engine.getConfig().debug) return;

    api.hooks.hook('entity:create', (id) => {
      console.debug('[DEBUG] entity:create', id);
    });

    api.hooks.hook('entity:destroy', (id) => {
      console.debug('[DEBUG] entity:destroy', id);
    });

    api.hooks.hook('component:add', (id, type, data) => {
      console.debug('[DEBUG] component:add', id, type, data);
    });
  }
});
```

## Error Handling

Hookable (v5+) propagates errors instead of swallowing them. Handle them correctly:

```typescript
try {
  await api.hooks.callHook('plugin:update', api, dt);
} catch (error) {
  console.error('Error in plugin:update hooks:', error);
}
```

## Unsubscribing

To stop listening to a hook:

```typescript
// Method 1: Returned function
const unregister = api.hooks.hook('entity:create', (id) => {
  console.log('Entity created:', id);
});

// Later...
unregister(); // ✅ Hook unsubscribed
```

## Best Practices

✅ **Do:**
- Register hooks in `onInit()`
- Keep handlers lightweight and fast
- Handle errors in async handlers
- Use descriptive hook names for custom hooks
- Document custom hooks you create

❌ **Avoid:**
- Registering hooks in other lifecycles
- Long operations in handlers (blocks the frame)
- Creating circular dependencies between hooks
- Forgetting to unregister if done dynamically

## Migrating from the old API

If you were using `engine.on()` / `engine.off()` (deprecated):

```typescript
// ❌ Old style (deprecated)
engine.on('entityCreated', (data) => {
  console.log('Entity created:', data.id);
});

// ✅ New style
api.hooks.hook('entity:create', (id) => {
  console.log('Entity created:', id);
});
```

Mappings:
- `entityCreated` → `entity:create`
- `entityDestroyed` → `entity:destroyed`
- `componentAdded` → `component:add`
- `componentRemoved` → `component:removed`

---

**See also:** [Plugin System](./plugins/creating.md) | [Engine Architecture](./ARCHITECTURE.md)

