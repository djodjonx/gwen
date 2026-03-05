#!/usr/bin/env markdown

# EntityId — 64-bit Opaque Entity Handle

**Status** : ✅ Implemented with BigInt + nominal branding  
**Supports** : 2^32 generation counter + 2^32 index (unlimited entity slot recyclings)

---

## Overview

`EntityId` is a **branded bigint type** that uniquely identifies an entity in GWEN.

- **64-bit packing** : 32-bit generation + 32-bit index
- **Type-safe** : Brand nominal prevents accidental mixing with plain bigint
- **Zero overhead** : At runtime, it's just a primitive (no allocation)
- **Unlimited generation** : Supports 2^32 (4.3 billion) recyclings per slot
- **Native Maps/Sets** : Direct usage as Map key (no stringify needed)

---

## Creating EntityIds

### Primary Constructor

```typescript
import { createEntityId } from '@gwen/engine-core';

// Low-level: direct creation
const id = createEntityId(index, generation);

// Recommended: via Engine
const id = engine.createEntity();
```

### Backward Compatibility

```typescript
import { packId } from '@gwen/engine-core';

// Deprecated but still works
const id = packId({ index: 5, generation: 100 });
```

---

## Using EntityIds

### Accessing Components

```typescript
import { type EntityId } from '@gwen/engine-core';

function mySystem(engine: Engine, entities: EntityId[]): void {
  for (const id of entities) {
    const pos = engine.getComponent(id, Position);
    const vel = engine.getComponent(id, Velocity);

    if (pos && vel) {
      pos.x += vel.x;
      pos.y += vel.y;
    }
  }
}
```

### Comparing EntityIds

```typescript
import { entityIdEqual } from '@gwen/engine-core';

if (entityIdEqual(id1, id2)) {
  // Same entity
}

// Or directly (both work, entityIdEqual is more explicit)
if (id1 === id2) {
  // Same entity
}
```

### Using in Maps/Sets

```typescript
import { type EntityId } from '@gwen/engine-core';

// Native Map support (no stringify needed!)
const componentMap = new Map<EntityId, MyComponent>();
componentMap.set(id, component);
const retrieved = componentMap.get(id);

// Set also works
const activeEntities = new Set<EntityId>();
activeEntities.add(id);
```

---

## Serialization

### String Representation

```typescript
import { entityIdToString, entityIdFromString } from '@gwen/engine-core';

// Serialize to string
const str = entityIdToString(id); // "5:100"

// Deserialize from string
const restored = entityIdFromString(str); // EntityId
```

### Use Cases

- **JSON storage** : Save `"5:100"` instead of raw bigint
- **Debug logging** : Human-readable format
- **URLs/keys** : Embed in URLs or storage keys
- **Network** : Send as string over WebSocket/HTTP

---

## Type Safety

### Compile-Time Protection

```typescript
// ✅ Correct
const id: EntityId = engine.createEntity();

// ❌ Wrong — TypeScript error
const badId: EntityId = 42n; // Error: can't mix

// ✅ OK — number is compatible at runtime but not typed
const num: number = id; // Warning: bigint not assignable to number
```

### Benefits

- Prevents `id + 1` mistakes (would get type error)
- Clear intent in code (variable typed as `EntityId`, not `number`)
- Self-documenting parameters

---

## Under the Hood

### Packing Format

```
EntityId = (generation << 32) | index

Example: EntityId(index=5, generation=100)
  = (100n << 32n) | 5n
  = 430000000005n
```

### Unpacking

```typescript
import { unpackEntityId } from '@gwen/engine-core';

const { index, generation } = unpackEntityId(id);
// index: 5
// generation: 100
```

### Why BigInt?

- **64-bit support** : JavaScript numbers (53-bit safe integer) can't represent full u32+u32
- **Native primitives** : No allocation overhead (unlike objects)
- **Direct Map usage** : V8 optimizes Map<bigint, T> natively
- **Unlimited generation** : Unlike the old 12-bit limit, supports full 2^32

---

## Migration from Numeric EntityIds

### Before (Numeric IDs)

```typescript
// Old code
const id: number = engine.createEntity(); // ⚠️ Just a number
const id2: number = 42; // ✅ Also valid (wrong!)
```

### After (BigInt EntityIds)

```typescript
// New code
const id: EntityId = engine.createEntity(); // ✅ Specific type
const id2: EntityId = 42n; // ❌ Error — enforces correct usage
```

### Backward Compatibility

Functions accepting `EntityId` continue to work because:
- The type is just a bigint with a compile-time brand
- At runtime, there's no type information (TypeScript is erased)
- Legacy code using numeric IDs may compile with warnings

---

## Performance Notes

- **Creation** : O(1) — simple bitwise operation
- **Unpacking** : O(1) — division and bitwise AND
- **Comparison** : O(1) — bigint primitive comparison
- **Map operations** : O(log n) — V8 optimizes Map<bigint> natively
- **Serialization** : O(1) — just decimal formatting

---

## FAQ

### Q: Can I use EntityId as a Map key?

**Yes!** That's the whole point.

```typescript
const map = new Map<EntityId, T>();
map.set(id, value); // ✅ Direct support
```

### Q: What if I need the raw index or generation?

```typescript
const { index, generation } = unpackEntityId(id);
// Now you have the raw values for WASM calls
```

### Q: How do I handle JSON serialization?

```typescript
const json = {
  entityId: entityIdToString(id), // "5:100"
};

const restored = entityIdFromString(json.entityId);
```

### Q: Is there a performance impact vs numeric IDs?

**No.** BigInt arithmetic is nearly identical to 32-bit integers in V8. The overhead is negligible compared to ECS operations.

### Q: Can I still use packId/unpackId?

**Yes, they're deprecated but functional** for backward compatibility. New code should use `createEntityId` and `unpackEntityId`.

---

## Examples

### Complete System Example

```typescript
import {
  type EntityId,
  createEntityId,
  entityIdEqual,
} from '@gwen/engine-core';

function bulletSystem(engine: Engine, entities: EntityId[]): void {
  for (const id of entities) {
    const pos = engine.getComponent(id, Position);
    const vel = engine.getComponent(id, Velocity);

    if (!pos || !vel) continue;

    // Update position
    pos.x += vel.x * deltaTime;
    pos.y += vel.y * deltaTime;

    // Destroy off-screen
    if (pos.x < 0 || pos.x > 800 || pos.y < 0 || pos.y > 600) {
      engine.removeEntity(id);
    }
  }
}
```

### Storing Entities in Sets

```typescript
const playerTeam = new Set<EntityId>();
const enemyTeam = new Set<EntityId>();

playerTeam.add(player1);
playerTeam.add(player2);
enemyTeam.add(enemy1);

// Check membership
if (playerTeam.has(id)) {
  // Friendly unit
}
```

### Entity Pool Patterns

```typescript
const activeEntities = new Map<EntityId, EntityMetadata>();

function registerActive(id: EntityId, meta: EntityMetadata): void {
  activeEntities.set(id, meta);
}

function isActive(id: EntityId): boolean {
  return activeEntities.has(id);
}

function deregisterActive(id: EntityId): void {
  activeEntities.delete(id);
}
```

---

## See Also

- [Entity Component System (ECS)](/docs/core/ecs.md)
- [Engine API](/docs/api/engine-api.md)
- [Plugin Development](/docs/plugins/plugin-development.md)


