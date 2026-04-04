# String Pool — Memory-Efficient String Storage

> **Feature Status**: ✅ Stable (v0.1.0+)  
> **Performance Impact**: Zero-allocation during game loop

---

## Overview

The **String Pool** system provides memory-efficient string storage for GWEN's ECS architecture. Since components must have fixed, predictable size in binary memory (ArrayBuffer), strings are stored as `i32` IDs instead of directly in component data.

### Key Features

- **Dual-Pool Architecture**: Separate pools for scene-scoped and persistent strings
- **Automatic Cleanup**: Scene pool cleared on every scene transition
- **Zero Breaking Changes**: Legacy `GlobalStringPool` API remains supported
- **Type-Safe DSL**: Declarative `Types.persistentString` for cross-scene data

---

## Architecture

### Dual-Pool Design

```typescript
GlobalStringPoolManager
├── scene         → Cleared on every scene transition (default)
└── persistent    → Never cleared, for cross-scene data
```

**Scene Pool** (`GlobalStringPoolManager.scene`):

- Used by default for `Types.string` fields
- Automatically cleared when transitioning between scenes
- Prevents memory leaks from accumulated string data

**Persistent Pool** (`GlobalStringPoolManager.persistent`):

- Used for `Types.persistentString` fields
- Survives scene transitions
- For player names, preferences, configuration, etc.

---

## Usage

### Basic Usage (Scene-Scoped Strings)

```typescript
import { defineComponent, Types } from '@djodjonx/gwen-engine-core';

// Default: strings are scene-scoped
export const Enemy = defineComponent({
  name: 'Enemy',
  schema: {
    name: Types.string, // Cleared on scene transition
    health: Types.f32,
  },
});

// Usage
api.addComponent(id, Enemy, {
  name: 'Goblin',
  health: 100,
});
```

**Behavior**: When you transition to a new scene, the string "Goblin" is automatically removed from memory.

---

### Persistent Strings (Cross-Scene Data)

```typescript
import { defineComponent, Types } from '@djodjonx/gwen-engine-core';

// Player save data that survives scene transitions
export const PlayerSave = defineComponent({
  name: 'PlayerSave',
  schema: {
    playerName: Types.persistentString, // Survives transitions
    lastPlayed: Types.persistentString, // Survives transitions
    highScore: Types.i32,
  },
});

// Usage
api.addComponent(id, PlayerSave, {
  playerName: 'Hero',
  lastPlayed: '2026-03-05',
  highScore: 9999,
});
```

**Behavior**: Even after 100 scene transitions, `playerName` and `lastPlayed` remain accessible.

---

## When to Use Each Type

### Use `Types.string` (Scene-Scoped) — Default ✅

**Always use this unless you explicitly need persistence.**

- Enemy names
- UI labels created in a scene
- Temporary messages
- Level-specific data
- Debug information

**Why?** Prevents memory leaks and ensures clean state on scene transitions.

---

### Use `Types.persistentString` (Persistent) — Use Sparingly ⚠️

**Only use for data that MUST survive scene transitions.**

- Player names from save files
- User preferences (language, volume)
- Configuration loaded once at startup
- Cross-scene persistent entities (e.g., player stats)

**Why?** Persistent pool is never cleared — overuse will cause memory leaks.

---

## Rules & Best Practices

### ✅ DO

```typescript
// ✅ Declarative — let the schema handle it
const Enemy = defineComponent({
  name: 'Enemy',
  schema: {
    name: Types.string, // Automatic pool management
  },
});
```

```typescript
// ✅ Store strings, not IDs
const enemyName = 'Goblin';
// Let serialize/deserialize handle intern() automatically
```

```typescript
// ✅ Use persistentString for cross-scene data
const PlayerData = defineComponent({
  name: 'PlayerData',
  schema: {
    playerName: Types.persistentString,
  },
});
```

---

### ❌ DON'T

```typescript
// ❌ NEVER store string IDs in closures/globals
const cachedId = GlobalStringPoolManager.scene.intern('Name');
// ID becomes invalid after scene transition!
```

```typescript
// ❌ NEVER use persistent pool manually for temporary data
GlobalStringPoolManager.persistent.intern('temp-ui-label');
// This will never be freed — memory leak!
```

```typescript
// ❌ NEVER use persistentString by default "just in case"
const Enemy = defineComponent({
  name: 'Enemy',
  schema: {
    name: Types.persistentString, // ❌ Enemy is scene-scoped!
  },
});
```

---

## Advanced: Manual Pool Access

### Debugging Pool Size

```typescript
import { GlobalStringPoolManager } from '@djodjonx/gwen-engine-core';

// Get debug statistics
const stats = GlobalStringPoolManager.getDebugStats();
console.log(`Scene pool: ${stats.scenePoolSize} strings`);
console.log(`Persistent pool: ${stats.persistentPoolSize} strings`);
```

**Dev Mode Warning**: If `persistentPool.size > 1000`, a warning is logged automatically.

---

### Legacy API (Backward Compatibility)

```typescript
import { GlobalStringPool } from '@djodjonx/gwen-engine-core';

// Legacy API — delegates to scene pool
const id = GlobalStringPool.intern('string');
const str = GlobalStringPool.get(id);
```

**Note**: This API is deprecated. Use `Types.string` / `Types.persistentString` instead.

---

## Performance

### Zero-Allocation During Game Loop

**Setup Phase** (one-time cost):

```typescript
computeSchemaLayout(schema); // Builds serialize/deserialize functions
```

**Runtime** (zero-allocation):

```typescript
serialize(data, view); // Calls pool.intern() — O(1) amortized
deserialize(view); // Calls pool.get() — O(1)
```

**Impact**: `(typeObj as any).isPersistent` is evaluated ONCE per component definition, not per entity.

---

## Internal Implementation

### How Serialization Works

```typescript
// User writes:
api.addComponent(id, Enemy, { name: 'Goblin', health: 100 });

// Internally:
const strId = GlobalStringPoolManager.scene.intern('Goblin'); // ID = 42
view.setInt32(offset, strId, true); // Store ID 42 in binary buffer

// On deserialization:
const strId = view.getInt32(offset, true); // Read ID 42
const name = GlobalStringPoolManager.scene.get(strId); // 'Goblin'
```

---

### Scene Transition Flow

```typescript
SceneManager.loadScene('NextScene')
  ↓
SceneManager.applyTransition()
  ↓
SceneManager.purgeEntities()
  ↓
GlobalStringPoolManager.clearScene()  // ← Scene pool cleared here
  ↓
Scene loaded with clean state
```

---

## Monitoring & Debugging

### Check for Memory Leaks

```typescript
// Before scene transitions
const before = GlobalStringPoolManager.getDebugStats();

// After 50 transitions
for (let i = 0; i < 50; i++) {
  await sceneManager.loadSceneImmediate('Scene', api);
}

const after = GlobalStringPoolManager.getDebugStats();

// Scene pool should be stable (not growing)
console.log(`Scene pool growth: ${after.scenePoolSize - before.scenePoolSize}`);
// Expected: ~0-10 (only current scene's strings)

// Persistent pool should only contain your persistent data
console.log(`Persistent pool: ${after.persistentPoolSize}`);
// Expected: number of persistentString fields you use
```

---

## Migration Guide

### From Legacy API

**Before** (manual ID management):

```typescript
const id = GlobalStringPool.intern('Name');
component.nameId = id;
```

**After** (declarative DSL):

```typescript
const Component = defineComponent({
  name: 'Component',
  schema: {
    name: Types.string, // Automatic
  },
});
api.addComponent(id, Component, { name: 'Name' });
```

---

### Fixing Memory Leaks

**Symptom**: Memory grows indefinitely after many scene transitions.

**Solution**: Check if you're storing string IDs in closures:

```typescript
// ❌ Before
const cachedId = GlobalStringPool.intern('Data');
export const System = () => {
  // Uses cachedId — BREAKS after scene transition
};

// ✅ After
const cachedString = 'Data';
export const System = () => {
  // Store string, not ID — serialize handles intern() automatically
};
```

---

## FAQ

### Q: When should I use `persistentString` vs `string`?

**A**: Default to `Types.string`. Only use `Types.persistentString` if the data must survive scene transitions (player name, preferences, config).

---

### Q: What happens if I use the wrong pool?

**A**:

- `string` in persistent data → Data lost on scene transition
- `persistentString` in temporary data → Memory leak (never freed)

---

### Q: Can I manually clear the persistent pool?

**A**: Not recommended. If you need to clear save data, destroy the entity holding the component instead. The persistent pool is designed for truly persistent data (lifetime = app session).

---

### Q: Does this affect performance?

**A**: No. Pool selection happens once during `computeSchemaLayout()`, not per entity. Runtime impact is negligible.

---

## Related Documentation

- [Scene System](./scenes.md) — How scene transitions work
- [Component Schema DSL](./components.md) — Defining component schemas
- [ECS Architecture](../../ARCHITECTURE.md) — Zero-allocation design principles

---

## Changelog

### v0.1.0 (March 2026)

- ✨ Added dual-pool architecture (scene + persistent)
- ✨ Added `Types.persistentString` DSL
- ✨ Automatic scene pool cleanup on transitions
- ✨ Debug stats API (`getDebugStats()`)
- 🔧 Legacy `GlobalStringPool` now delegates to scene pool
- 📚 Comprehensive documentation and warnings
