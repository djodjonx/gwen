# 📋 MIGRATION GUIDE - Hooks System (v0.2.0)

## Overview

GWEN Engine v0.2.0 introduit le nouveau système de hooks basé sur `@unjs/hookable`, remplaçant l'ancienne API `on()/off()/emit()`.

**Breaking Changes:** ✅ Faible impact - les anciennes méthodes fonctionnent toujours (déprécié)

**Migration Path:** Graduelle - vous pouvez migrer progressivement

---

## Quick Summary

### Avant (v0.1.x) ❌
```typescript
engine.on('entityCreated', (data) => {
  console.log('Entity created:', data.id);
});

engine.on('componentAdded', (data) => {
  console.log('Component added:', data.type);
});
```

### Après (v0.2.0+) ✅
```typescript
api.hooks.hook('entity:create', (id) => {
  console.log('Entity created:', id);
});

api.hooks.hook('component:add', (id, type, data) => {
  console.log('Component added:', type);
});
```

---

## Migration Steps

### Step 1: Replace Engine Events with Hooks

#### Entity Events

| Old | New |
|-----|-----|
| `engine.on('entityCreated', ({id}) => ...)` | `api.hooks.hook('entity:create', (id) => ...)` |
| `engine.on('entityDestroyed', ({id}) => ...)` | `api.hooks.hook('entity:destroyed', (id) => ...)` |

#### Component Events

| Old | New |
|-----|-----|
| `engine.on('componentAdded', ({id, type}) => ...)` | `api.hooks.hook('component:add', (id, type, data) => ...)` |
| `engine.on('componentRemoved', ({id, type}) => ...)` | `api.hooks.hook('component:removed', (id, type) => ...)` |

#### Engine Events

| Old | New |
|-----|-----|
| `engine.on('start', () => ...)` | `api.hooks.hook('engine:start', () => ...)` |
| `engine.on('stop', () => ...)` | `api.hooks.hook('engine:stop', () => ...)` |

### Step 2: Move Listeners to Plugin Initialization

**Before:**
```typescript
// ❌ Bad - listeners registered outside plugin
engine.on('entity:create', (id) => {
  console.log('Entity:', id);
});

const entity = engine.createEntity();
```

**After:**
```typescript
// ✅ Good - listeners registered in onInit
export const MyPlugin = defineSystem({
  name: 'MyPlugin',
  onInit(api) {
    api.hooks.hook('entity:create', (id) => {
      console.log('Entity:', id);
    });
  }
});

engine.registerSystem(MyPlugin);
const entity = engine.createEntity();
```

### Step 3: Handle Async Calls

Hooks are now async by default (v5.5.3+). When calling manually:

**Before:**
```typescript
engine.emit('custom:event', data);
```

**After:**
```typescript
// Option 1: Fire and forget
api.hooks.callHook('custom:event' as any, data);

// Option 2: Wait for completion
await api.hooks.callHook('custom:event' as any, data);

// Option 3: With error handling
await api.hooks.callHook('custom:event' as any, data).catch(err => {
  console.error('Hook error:', err);
});
```

---

## Complete Migration Example

### Scenario: Auth System

**Old Code (v0.1.x):**
```typescript
// initialization.ts
const engine = new Engine();

engine.on('entityCreated', ({id}) => {
  console.log(`[Auth] Entity created: ${id}`);
});

engine.on('componentAdded', ({id, type}) => {
  if (type === 'Player') {
    console.log(`[Auth] Player assigned to entity ${id}`);
  }
});

engine.on('start', () => {
  console.log('[Auth] Engine started - authenticating...');
});
```

**New Code (v0.2.0+):**
```typescript
// auth-plugin.ts
import { defineSystem } from '@djodjonx/gwen-engine-core';

export const AuthPlugin = defineSystem({
  name: 'AuthPlugin',

  onInit(api) {
    // Listen for entity creation
    api.hooks.hook('entity:create', (id) => {
      console.log(`[Auth] Entity created: ${id}`);
    });

    // Listen for component additions
    api.hooks.hook('component:add', (id, type, data) => {
      if (type === 'Player') {
        console.log(`[Auth] Player assigned to entity ${id}`);
      }
    });

    // Listen for engine start
    api.hooks.hook('engine:start', () => {
      console.log('[Auth] Engine started - authenticating...');
    });
  }
});

// initialization.ts
const engine = new Engine();
engine.registerSystem(AuthPlugin);
```

---

## API Reference Summary

### Registering Hooks

```typescript
// Simple hook
api.hooks.hook('entity:create', (id) => {
  // Handle event
});

// Hook that returns unregister function
const unregister = api.hooks.hook('entity:destroy', (id) => {
  // Handle event
});

// Later, if needed
unregister();
```

### Calling Hooks

```typescript
// Fire and forget
api.hooks.callHook('my:custom:event' as any, arg1, arg2);

// With await (for async handlers)
await api.hooks.callHook('my:custom:event' as any, arg1, arg2);

// With error handling
try {
  await api.hooks.callHook('my:custom:event' as any, arg1, arg2);
} catch (error) {
  console.error('Hook error:', error);
}
```

### Available Hooks

See [Hooks API Documentation](./hooks.md) for complete list.

---

## Common Patterns

### Pattern 1: Lifecycle Tracking

```typescript
export const TrackerPlugin = defineSystem({
  name: 'Tracker',

  onInit(api) {
    const createdEntities = new Set<EntityId>();

    api.hooks.hook('entity:create', (id) => {
      createdEntities.add(id);
    });

    api.hooks.hook('entity:destroyed', (id) => {
      createdEntities.delete(id);
    });

    api.hooks.hook('engine:tick', (dt) => {
      console.log(`Active entities: ${createdEntities.size}`);
    });
  }
});
```

### Pattern 2: Event Forwarding

```typescript
export const EventBridgePlugin = defineSystem({
  name: 'EventBridge',

  onInit(api) {
    const listeners = new Map<string, Function[]>();

    // Forward entity:create to custom listeners
    api.hooks.hook('entity:create', (id) => {
      const cbs = listeners.get('entity:create') || [];
      cbs.forEach(cb => cb(id));
    });

    // Public API for consumers
    return {
      on(event: string, handler: Function) {
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event)!.push(handler);
      }
    };
  }
});
```

### Pattern 3: Filtering

```typescript
export const FilterPlugin = defineSystem({
  name: 'Filter',

  onInit(api) {
    api.hooks.hook('entity:destroy', (id) => {
      // Only log player entities
      const transform = api.getComponent(id, 'Transform');
      if (transform?.isPlayer) {
        console.log(`Player ${id} destroyed`);
      }
    });
  }
});
```

---

## Deprecation Timeline

- **v0.2.0**: New hooks system introduced. Old API deprecated but functional.
- **v0.3.0**: Old API still works, but warnings logged in debug mode.
- **v1.0.0**: Old API removed (breaking change).

**Current Status:** v0.2.0 - Old API functional but deprecated

---

## Troubleshooting

### Issue: Hooks not being called

**Cause:** Listeners registered after events fired
**Solution:** Always register hooks in `onInit()`

```typescript
// ❌ Wrong - registered too late
const entity = engine.createEntity();
api.hooks.hook('entity:create', (id) => { /* ... */ });

// ✅ Correct - registered in onInit
onInit(api) {
  api.hooks.hook('entity:create', (id) => { /* ... */ });
}
```

### Issue: "as any" TypeScript warnings

**Cause:** Custom hooks don't have type info
**Solution:** Either ignore or create a typed interface

```typescript
// Option 1: Ignore (acceptable for custom hooks)
api.hooks.callHook('my:event' as any, data);

// Option 2: Create typed interface (advanced)
interface CustomHooks {
  'my:event': (data: MyData) => void;
}

type FullHooks = GwenHooks & CustomHooks;
```

### Issue: Errors in hooks breaking game loop

**Cause:** hookable v5 propagates errors
**Solution:** Add try/catch or error handler

```typescript
api.hooks.hook('entity:create', (id) => {
  try {
    // Your logic
  } catch (error) {
    console.error('Error handling entity:create:', error);
  }
});
```

---

## Support

- 📚 Full API docs: [Hooks API](./hooks.md)
- 💬 Examples: [Plugins Guide](./plugins/creating.md)
- 🐛 Issues: Report on GitHub

---

**Version:** v0.2.0
**Updated:** March 2026

