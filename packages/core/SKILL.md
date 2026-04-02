---
name: gwen-engine-core
description: Expert skill for the GWEN Engine core, covering ECS management, scene lifecycle, WASM bridging, and the high-level API.
---

# Engine Core Expert Skill

## Context
GWEN Engine Core is the central orchestrator. It manages the Entity Component System (ECS), coordinates the game loop, provides the WASM bridge for high-performance logic, and handles high-level systems like Scenes, UI, and Prefabs.

## Instructions

### 1. Initialization & Configuration
The engine is initialized via `createEngine` and configured with `defineConfig`.
```typescript
import { createEngine, defineConfig } from '@gwenjs/core';

const config = defineConfig({
  maxEntities: 10000,
  plugins: [...],
  mainScene: 'Menu'
});

const { engine } = await createEngine(config);
engine.start();
```

### 2. ECS Management (`EngineAPI`)
The `EngineAPI` is the primary interface for game logic (passed to systems and scenes).
- **Entities**: `createEntity()`, `destroyEntity(id)`.
- **Components**: `setComponent(id, name, data)`, `getComponent(id, name)`, `removeComponent(id, name)`.
- **Queries**: `query([components])` returns an array of `EntityId`.
- **Identification**: `unpackEntityId(id)` returns `{ index, generation }`.

### 3. Scene System
Scenes encapsulate game states. They are automatically discovered if placed in `src/scenes/` or can be registered manually.
```typescript
import { defineScene } from '@gwenjs/core';

export const GameScene = defineScene('Game', {
  onInit(api) { /* Setup */ },
  onEnter(api) { /* Called when scene becomes active */ },
  onUpdate(api, dt) { /* Main logic */ },
  onExit(api) { /* Cleanup */ }
});
```

### 4. Prefab System
Prefabs are templates for entities with pre-defined components and plugin extensions.
```typescript
import { definePrefab } from '@gwenjs/core';

const PlayerPrefab = definePrefab({
  name: 'Player',
  components: {
    transform: { x: 0, y: 0 },
    sprite: { texture: 'hero' }
  },
  extensions: {
    physics: { bodyType: 'dynamic' }
  }
});

// Instantiate
const player = api.instantiate(PlayerPrefab);
```

### 5. WASM Bridge & Shared Memory
For performance, GWEN uses a WASM bridge.
- **`initWasm()`**: Must be called before starting the engine.
- **Shared Memory**: Components and transforms are stored in a `SharedArrayBuffer` for zero-copy access between JS and WASM.
- **Plugin Data Bus**: Channel-based communication for WASM plugins.

## Available Resources
- `packages/@gwenjs/engine-core/src/core/ecs.ts`: Core ECS implementation.
- `packages/@gwenjs/engine-core/src/engine/engine.ts`: Main Engine orchestration.
- `packages/@gwenjs/engine-core/src/api/api.ts`: `EngineAPI` implementation.
- `packages/@gwenjs/engine-core/src/wasm/shared-memory.ts`: Memory layout constants.

## Constraints
- **Asynchrony**: `createEngine` and `initWasm` are asynchronous.
- **Entity IDs**: Never store raw indices; always use the opaque `EntityId` type and `unpackEntityId` when index/generation are needed.
- **Threading**: Components are stored in shared memory. Direct modification of `getComponent` return values may not reflect in memory if not handled by the specific component implementation.
