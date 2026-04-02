# 🏗️ GWEN Architecture

> **Note:** This document reflects the GWEN v2 architecture. For the current implementation plan, see `specs/gwen-next/EXECUTION-PLAN-module-first.md` in the repository root.

Understanding GWEN's architecture helps you build better games and contribute effectively.

## High-Level Design

GWEN follows a **3-layer architecture**:

```
┌─────────────────────────────────────┐
│  Layer 3: Your Game (TypeScript)    │ ← Components, Systems, Game Logic
├─────────────────────────────────────┤
│  Layer 2: Plugins (TypeScript)      │ ← Input, Audio, Rendering, UI
├─────────────────────────────────────┤
│  Layer 1: Core Engine (Rust/WASM)   │ ← ECS, Entity Management, Queries
└─────────────────────────────────────┘
```

### Layer 1: Core Engine (Rust/WASM)

**Location:** `crates/gwen-core/` (Rust) → `packages/@djodjonx/engine-core/wasm/` (compiled WASM)

**Responsibilities:**
- Entity creation/destruction
- Component storage (packed arrays)
- Query execution with archetypes
- Memory management (linear allocator)
- Game loop tick

**Why Rust?**
- **Zero-cost abstractions** - No garbage collection
- **Memory safety** - No null pointers, bounds checking
- **Performance** - Native speed, optimized by LLVM
- **WebAssembly** - Compiles to WASM for browser

**Key Modules:**
- `engine.rs` - Main Engine struct
- `query.rs` - Query engine with archetype caching
- `component.rs` - Component registry
- `entity.rs` - Entity lifecycle management
- `allocator.rs` - Memory management

### Layer 2: Plugins (TypeScript)

**Location:** `packages/@gwenjs/*/`

**Types of Plugins:**
1. **Renderers** - Draw to screen (Canvas2D, WebGL)
2. **Input** - Handle keyboard, mouse, gamepad
3. **Audio** - Play sounds and music
4. **Physics** - Handle collisions
5. **UI** - HUD, menus, dialogs
6. **Debug** - Performance metrics, profiling

**Plugin Lifecycle:**
```
onInit() → onBeforeUpdate() → onUpdate() → onRender() → onDestroy()
```

**Why TypeScript?**
- **Developer experience** - Type safety, IDE support
- **Easy integration** - Native browser APIs
- **Rapid iteration** - No compile step
- **Flexibility** - Dynamic plugin loading

### Layer 3: Your Game (TypeScript)

**Location:** `playground/` or your project

**Components:**
- Define data (Position, Health, Sprite)
- Stateless - just data containers

**Systems:**
- Read/write components
- Implement game logic
- Run every frame or on events

**Scenes:**
- Game levels or menus
- Load/unload entities
- Transition management

## Data Flow

### Game Loop

Two loop modes are supported. See `specs/gwen-next/EXECUTION-PLAN-module-first.md` for the authoritative specification.

**Mode `loop: 'internal'` (default)** — The engine owns `requestAnimationFrame`. Delta is computed internally and capped at `maxDeltaSeconds` (default `0.1`).

```
┌─────────────────────────────────────┐
│  requestAnimationFrame(now)         │
└────────────┬────────────────────────┘
             │
    ┌────────▼────────────────┐
    │  Calculate ΔT (capped)  │
    └────────┬────────────────┘
             │
    ┌────────▼──────────────────┐
    │  Plugin.onBeforeUpdate()  │
    └────────┬──────────────────┘
             │
    ┌────────▼──────────────────────┐
    │  engine.advance(ΔT)           │ ← Rust core step
    │  - Reset event channels       │
    │  - Update archetype cache     │
    │  - Update entity generations  │
    └────────┬──────────────────────┘
             │
    ┌────────▼──────────────────┐
    │  Plugin.onUpdate(api)     │ ← Your systems run here
    └────────┬──────────────────┘
             │
    ┌────────▼──────────────────┐
    │  Plugin.onRender(api)     │ ← Rendering happens here
    └────────┬──────────────────┘
             │
             └──→ Loop back to requestAnimationFrame
```

**Mode `loop: 'external'`** — JS controls timing. The engine never starts RAF. The caller invokes `engine.advance(delta)` each frame.

```
JS tick → engine.advance(delta) → [onBeforeUpdate → Core reset channels → Rust step → onUpdate → onRender]
```

## Component System

### Component Storage

Components are stored in **dense packed arrays** (Struct of Arrays, not Array of Structs):

```
Entity IDs:  [0, 1, 2, 3, 4]  (sparse, but queried densely)

Position component:
  x: [100, 200, 150, 300, 250]
  y: [50, 75, 60, 100, 80]

Velocity component:
  x: [5, 10, -5, 0, 8]
  y: [0, 2, 1, -3, 0]
```

**Benefits:**
- ✅ Cache-friendly (contiguous memory)
- ✅ Iteration is blazingly fast
- ✅ Zero overhead per entity
- ✅ Supports branching logic

### Archetypes

**Archetype** = unique combination of components

Example archetypes:
- `[Position, Velocity]` - Moving entities
- `[Position, Velocity, Health]` - Damageable movers
- `[Transform, Sprite]` - Renderable entities

**Query Caching:** Results cached after first query, invalidated only when entities change.

```typescript
// First call: Walks archetype graph (slow ~10μs)
api.query([Position, Velocity])

// Subsequent calls: Returns cached result (fast ~1μs)
api.query([Position, Velocity])
```

**Canonical component API** (`api.component.*`):

```typescript
api.component.add(entity, Position, { x: 0, y: 0 });
api.component.get(entity, Position);              // → { x, y }
api.component.set(entity, Position, { x: 10 });  // partial update
api.component.remove(entity, Position);
```

Query-first system authoring — declare queries in the system descriptor rather than calling `api.query()` imperatively:

```typescript
defineSystem({
  name: 'MovementSystem',
  query: [Position, Velocity],
  onUpdate(api, entities, dt) {
    for (const id of entities) {
      const vel = api.component.get(id, Velocity);
      api.component.set(id, Position, { x: pos.x + vel.x * dt });
    }
  }
});
```

## Entity Lifecycle

### Entity ID Format

```
EntityId = (BigInt(generation) << 32n) | BigInt(index)   // bigint, 64 bits

- index      (32 bits low)  : which slot in the dense array
- generation (32 bits high) : how many times this slot was reused
```

Use `createEntityId(index, generation)` and `unpackEntityId(id)` from `@gwenjs/core`
— never construct or decompose an `EntityId` with raw bitwise arithmetic.

**Why two parts?**
- ✅ Prevents "use-after-free" bugs
- ✅ Allows reusing storage slots
- ✅ Supports fast lookup

### Entity States

```
┌─────────────┐
│ Dead/Reused │
└──────▲──────┘
       │ create_entity()
       │
┌──────┴──────┐
│    Alive    │
└──────▲──────┘
       │ destroy_entity()
       │
┌──────┴───────────┐
│ Marked Destroyed │
└────────┬─────────┘
         │ tick() (cleanup)
         │
      [loop back to Dead]
```

## Performance Characteristics

### O(1) Operations
- ✅ Entity creation
- ✅ Entity deletion
- ✅ Component add/remove
- ✅ Entity lookup

### O(n) Operations
- ✅ Query execution (n = matching entities)
- ✅ Iteration over results

### Memory Usage
- **Per entity:** 48 bytes (index + generation)
- **Per component:** varies (packed arrays)
- **Max entities:** 2^20 = ~1M (configurable)

### Benchmarks

On Apple M1 (2024):

| Operation | Time |
|-----------|------|
| Create 10K entities | < 5ms |
| Query 1K entities | < 1ms |
| Update 10K Position components | < 2ms |
| Full frame (100 systems) | ~16ms (60 FPS) |

## WASM Bridge

### TypeScript ↔ Rust Communication

```
TypeScript Layer
    │
    │ serialize Component data
    ├─→ Uint8Array (binary)
    │
    ↓ Call WASM function

Rust Layer
    │
    ├─ Deserialize Uint8Array
    ├─ Update ECS storage
    └─ Validate entity/component state

    ↓ Return result (or error)

    ├─ Serialize response
    └─ Return to JavaScript

TypeScript Layer
    │
    └─ Deserialize result
```

**Optimization:** Minimal crossing of WASM boundary:
- Batch operations when possible
- Use ref/pointer patterns for large data
- Cache query results

## Plugin System

### Plugin Interface

```typescript
interface GwenPlugin {
  name: string;
  version?: string;

  onInit?(api: EngineAPI): void;
  onBeforeUpdate?(api: EngineAPI, dt: number): void;
  onUpdate?(api: EngineAPI, dt: number): void;
  onRender?(api: EngineAPI): void;
  onDestroy?(): void;
}
```

### Plugin Loading

```
1. Create plugin instance
2. Register with engine.registerSystem()
3. Engine calls onInit() immediately
4. Plugin participates in game loop
5. Can be unregistered anytime
```

### Plugin Discovery

Plugins can be:
- ✅ Registered manually (explicit)
- ✅ Loaded from gwen.config.ts
- ✅ Dynamically loaded at runtime
- ✅ Loaded from npm packages

## Design Decisions

### Why ECS?

**Traditional OOP:**
```typescript
class Player extends GameObject {
  position: Vector;
  velocity: Vector;
  health: number;

  update() { /* 50 lines */ }
}
```

**Problems:** Monolithic, hard to reuse, poor performance

**GWEN ECS:**
```typescript
// Position, Velocity, Health are separate
// Systems compose behaviors
// Data-driven, cache-friendly
```

### Why Rust for Core?

- **Performance:** 10-100x faster than JavaScript
- **Safety:** No runtime errors from bad types
- **Predictability:** No GC pauses
- **WASM:** Compiles to small, fast binaries

### Why TypeScript for API?

- **Developer experience:** Types help catch bugs
- **Flexibility:** Dynamic features when needed
- **JavaScript ecosystem:** Can use any npm package
- **No compile step:** Instant iteration

## Scaling Considerations

### For Larger Games

1. **Organize systems into modules**
   ```typescript
   // physics/
   physics.ts → systems for physics
   collisions.ts → collision detection

   // gameplay/
   player.ts → player-specific logic
   ```

2. **Use scenes for level management**
   ```typescript
   MainMenu → (load) → GameScene → (load) → WinScene
   ```

3. **Prefabs for reusable entities**
   ```typescript
   const Enemy = definePrefab('Enemy', (api, pos) => {
     const e = api.createEntity();
     api.addComponent(e, Position, pos);
     api.addComponent(e, Health, { hp: 100 });
     return e;
   });
   ```

4. **Plugin modularization**
   - Keep plugins focused
   - Compose plugins for complex behavior
   - Share common utilities

## Roadmap

See the planning backlog in `specs/gwen-next/TICKETS-module-first-refactor.md` for module-first milestones and package split details.

---

**Want to dive deeper?** Check:
- [API Reference](./API.md) - Full API docs
- [Source Code](https://github.com/djodjonx/gwen/tree/main/crates/gwen-core) - Read the code
- [Playground](https://github.com/djodjonx/gwen/tree/main/playground) - Working example


