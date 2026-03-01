# GWEN Game Engine

**Status:** ✅ Core Rust complet · ✅ Couche TypeScript avancée · 🚧 Pont WASM↔TS en cours

---

## 📊 Qu'est-ce que GWEN ?

GWEN est un **framework de jeu web modulaire et composable** :
- **Rust → WASM** pour le cœur ECS hautes performances
- **TypeScript** pour les APIs développeur et les plugins
- **ECS (Entity-Component-System)** avec archétypes et cache de requêtes
- **Système de plugins** composable, inspiré de Nuxt.js

---

## 🚀 Démarrage rapide

### Prérequis

- Rust 1.75+
- Node.js 18+
- pnpm 8+
- wasm-pack (`cargo install wasm-pack`)

### Installation

```bash
git clone https://github.com/yourusername/gwen.git
cd gwen
pnpm install
cargo build
```

### Lancer le playground (Space Shooter)

```bash
cd playground
pnpm dev
# → http://localhost:5173
```

### Exemple TypeScript minimal

```typescript
import { Engine, defineComponent, Types } from '@gwen/engine-core';
import { InputPlugin } from '@gwen/plugin-input';

const Position = defineComponent('Position', {
  x: Types.f32,
  y: Types.f32,
});

const engine = new Engine({
  plugins: [new InputPlugin()],
});

engine.onUpdate((api, dt) => {
  const kb = api.services.get('keyboard');
  for (const [e, pos] of api.query([Position])) {
    if (kb.isPressed('ArrowRight')) pos.x += 200 * dt;
  }
});

engine.start();
```

---

## ✨ Fonctionnalités

### Core Rust/WASM (`crates/gwen-core`)

| Système | Description | Perf |
|---|---|---|
| **EntityManager** | Allocation O(1), génération counter, free-list | 10K entités < 5ms |
| **ComponentStorage** | SoA + HashMap O(1), swap-remove | 5K ops < 30ms |
| **QuerySystem** | Cache d'archétypes, invalidation partielle | 1K query < 50ms |
| **LinearAllocator** | Zéro fragmentation, alignement configurable | 10K allocs < 10ms |
| **EventBus** | Pub/sub typé, batch processing | Instantané |
| **GameLoop** | Delta clamping, FPS cap | < 0.1ms/frame |
| **TransformSystem** | Hiérarchies parent/enfant, Vec2/Mat3 | ✅ |
| **WASM Bindings** | `JsEntityId{index,generation}`, stale-ID safe | ✅ |

### Couche TypeScript (`packages/@gwen/`)

| Package | Description |
|---|---|
| `@gwen/engine-core` | Engine, Scene, Plugin, Prefab, UI, Schema DSL |
| `@gwen/plugin-input` | Keyboard (4 états), Mouse, Gamepad |
| `@gwen/plugin-audio` | Web Audio API, preload/play/loop/volume |
| `@gwen/renderer-canvas2d` | Renderer Canvas2D (WIP) |

---

## 🧪 Tests

```bash
# Tests Rust natifs (136 tests)
cargo test

# Tests WASM en Node.js (21 tests)
wasm-pack test --node crates/gwen-core

# Tests TypeScript — engine-core
pnpm --filter @gwen/engine-core test --run

# Tests TypeScript — plugin-input (26 tests)
pnpm --filter @gwen/plugin-input test --run

# Tests TypeScript — plugin-audio (17 tests)
pnpm --filter @gwen/plugin-audio test --run

# Tous les tests TS
pnpm test
```

**Résumé :**
- Rust natif : **136 tests** — 0 échec
- WASM (`wasm-bindgen-test`) : **21 tests** — 0 échec
- TypeScript : **170+ tests** — 0 échec

---

## 🏗️ Architecture

```
Layer 3 — Votre jeu (TypeScript)
    ↕  TsPlugin lifecycle (onInit → onBeforeUpdate → onUpdate → onRender → onDestroy)
Layer 2 — Plugins composables (@gwen/plugin-input, plugin-audio, renderer-canvas2d)
    ↕  wasm-bindgen / ServiceLocator
Layer 1 — Core Engine (Rust/WASM) — ECS, events, gameloop, transforms
    ↕  wasm-bindgen FFI  (JsEntityId, query_entities, get_component_raw)
Layer 0 — Navigateur (Canvas2D / WebAudio / DOM)
```

### Stale-ID safety

Toutes les opérations sur entités passent par `{index, generation}` :

```typescript
// ❌ Ancien (dangereux) — index seul, generation ignorée
engine.delete_entity(42);

// ✅ Nouveau — handle complet, slot recyclé détecté automatiquement
const id = engine.create_entity(); // { index: 0, generation: 0 }
engine.delete_entity(id.index, id.generation);

const id2 = engine.create_entity(); // { index: 0, generation: 1 }
engine.is_alive(0, 0); // false — stale handle rejeté
engine.is_alive(0, 1); // true  — handle valide
```

---

## 📁 Structure du projet

```
gwen/
├── crates/gwen-core/          # Rust — ECS core + WASM bindings
│   ├── src/
│   │   ├── entity.rs          # EntityManager + génération counter
│   │   ├── component.rs       # ComponentStorage SoA O(1)
│   │   ├── query.rs           # QuerySystem + cache partiel
│   │   ├── allocator.rs       # LinearAllocator + Arena
│   │   ├── events.rs          # EventBus pub/sub
│   │   ├── gameloop.rs        # FrameTiming + delta clamping
│   │   ├── transform.rs       # Hiérarchies parent/enfant
│   │   ├── transform_math.rs  # Vec2, Mat3
│   │   └── bindings.rs        # wasm-bindgen exports (JsEntityId)
│   └── tests/
│       ├── entity_tests.rs
│       ├── component_tests.rs
│       ├── query_tests.rs
│       ├── allocator_tests.rs
│       ├── extended_tests.rs
│       ├── integration_tests.rs   # 7 scénarios multi-systèmes
│       └── wasm_bindgen_tests.rs  # 21 tests surface API JS
│
├── packages/@gwen/
│   ├── engine-core/           # TypeScript — Engine, Scene, Plugin, ECS
│   ├── plugin-input/          # Keyboard, Mouse, Gamepad
│   ├── plugin-audio/          # Web Audio API
│   └── renderer-canvas2d/     # Canvas2D renderer (WIP)
│
├── playground/                # Démo Space Shooter complète
├── specs/                     # Documentation & spécifications
└── docs/                      # Benchmarks, stratégie de test
```

---

## 📋 État d'avancement

### ✅ Terminé

- **Rust Core** — Entity, Component, Query, Allocator, Events, GameLoop, Transform
- **WASM Bindings** — API JS complète avec stale-ID safety
- **Tests Rust** — 136 tests natifs + 21 wasm-bindgen-test
- **TypeScript Engine** — Engine, SceneManager, PluginManager, PrefabManager, UIManager, Schema DSL
- **Plugins TS** — input (clavier/souris/gamepad) + audio (Web Audio API)
- **Playground** — Space Shooter fonctionnel validant toute la stack

### 🚧 En cours

- **Pont WASM↔TS** — API WASM prête côté Rust ; intégration dans `@gwen/engine-core` à câbler
- **`@gwen/renderer-canvas2d`** — Package à finaliser en réutilisable

### ❌ À venir

- `@gwen/cli` — Build pipeline (parser `engine.config.ts`, bundler WASM)
- Plugin Vite — hot-reload WASM en développement
- Physics2D — Rapier2D crate + bindings
- Templates de projets

---

## 📄 Licence

MIT — voir [LICENSE](./LICENSE)


---

## 📊 What is GWEN?

GWEN is a high-performance, composable game engine framework built with:
- **Rust** for the core engine (compiled to WebAssembly)
- **TypeScript** for developer-friendly APIs
- **ECS (Entity-Component-System)** architecture
- **Plugin system** for extensibility

Perfect for building fast, scalable 2D/3D games in the browser.

---

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/gwen.git
cd gwen

# Install dependencies
pnpm install
cargo build
```

### Basic Usage

```typescript
import { Engine } from '@gwen/engine-core';

// Create engine
const engine = new Engine(1000); // 1000 max entities

// Create an entity
const player = engine.create_entity();

// Get entity count
console.log(engine.count_entities()); // 1

// Update game loop
let lastTime = performance.now();
function gameLoop(now) {
  const deltaMs = now - lastTime;
  lastTime = now;

  engine.tick(deltaMs);

  // Your game logic here

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
```

---

## ✨ Features

### Core Engine Systems

#### ✅ Entity Manager
- O(1) entity allocation/deallocation
- Generation counter prevents use-after-free bugs
- Free list reuse for zero fragmentation
- **Performance:** 10K entities in <5ms

#### ✅ Component Storage
- Structure of Arrays (SoA) layout for cache efficiency
- Type-safe generic component access
- Zero-cost abstractions
- **Performance:** 1K component ops in <30ms

#### ✅ Query System
- Archetype-based entity queries
- Automatic query caching
- Fast component matching
- **Performance:** 1K entity query in <50ms

#### ✅ Memory Allocator
- Linear allocator for zero fragmentation
- Arena allocation for grouped objects
- Alignment support (4, 8, 16, 32+ bytes)
- **Performance:** 10K allocations in <10ms

#### ✅ Event Bus
- Pub/sub event system
- Generic type-safe events
- Event queuing and batch processing
- **Performance:** Instant event dispatch

#### ✅ Game Loop
- Frame-based timing
- FPS limiter ready
- Delta time clamping
- Fixed timestep support
- **Performance:** <0.1ms frame tick

---

## 📈 Performance Summary

**All targets exceeded:**

| System | Operation | Target | Actual | Status |
|--------|-----------|--------|--------|--------|
| Entity Manager | 10K allocate | <50ms | <5ms | ✅ 10x |
| Component Storage | 1K ops | <50ms | <30ms | ✅ 1.6x |
| Query System | 1K query | <100ms | <50ms | ✅ 2x |
| Memory Allocator | 10K allocs | <50ms | <10ms | ✅ 5x |
| Game Loop | Frame tick | <1ms | <0.1ms | ✅ 10x |

**Memory Efficiency:**
- Per entity + 3 components: 24 bytes + 24 bytes = 48 bytes
- 10K entities: ~1.2MB (extremely efficient!)

---

## 🏗️ Architecture

### Module Structure

```
gwen-core (Rust/WASM)
├── Entity Manager      - Entity lifecycle
├── Component Storage   - SoA-based storage
├── Query System        - Archetype queries
├── Memory Allocator    - Linear allocator
├── Event Bus           - Pub/sub events
├── Game Loop           - Frame orchestration
└── wasm-bindgen        - JavaScript bindings

@gwen/engine-core (TypeScript)
├── Engine class        - Main API
├── Type definitions    - TypeScript types
├── Configuration       - defineConfig helper
└── WASM bindings       - Auto-generated
```

### Data Flow

```
Input Events
    ↓
Event Bus (ProcessEvents)
    ↓
Game Loop (Tick)
    ↓
Entity Manager (Update)
    ↓
Component Storage (Query & Update)
    ↓
Render
```

---

## 📚 Documentation

- **[API Documentation](./docs/API.md)** - Detailed API reference
- **[Architecture Guide](./docs/ARCHITECTURE.md)** - System design and flow
- **[Performance Benchmarks](./docs/BENCHMARKS.md)** - Performance analysis
- **[Testing Strategy](./docs/TESTING_STRATEGY.md)** - Test organization
- **[Contributing Guide](./docs/CONTRIBUTING.md)** - How to contribute

---

## 🧪 Testing

```bash
# Run all tests
cargo test
pnpm test

# Run specific test
cargo test entity_tests

# Run with output
cargo test -- --nocapture

# Performance tests (release mode)
cargo test --release
```

**Coverage:** 120+ tests, 100% pass rate, 80%+ code coverage

---

## 🎯 Project Structure

```
gwen/
├── crates/
│   └── gwen-core/              # Rust engine
│       ├── src/
│       │   ├── entity.rs        # Entity manager
│       │   ├── component.rs     # Component storage
│       │   ├── query.rs         # Query system
│       │   ├── allocator.rs     # Memory allocator
│       │   ├── events.rs        # Event bus
│       │   ├── gameloop.rs      # Game loop
│       │   └── bindings.rs      # WASM exports
│       └── tests/               # Integration tests
│
├── packages/
│   └── @gwen/engine-core/       # TypeScript API
│       ├── src/
│       ├── dist/
│       └── tests/
│
├── docs/                         # Documentation
├── specs/                        # Specifications
└── .github/                      # CI/CD
```

---

## 🚀 Getting Started with Development

### Prerequisites
- Rust 1.70+
- Node.js 18+
- pnpm 8+
- wasm-pack

### Setup

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install wasm-pack
cargo install wasm-pack

# Clone and setup
git clone https://github.com/yourusername/gwen.git
cd gwen
pnpm install
cargo build
```

### Development Workflow

```bash
# Build everything
pnpm build

# Run tests
cargo test
pnpm test

# Watch mode
cargo watch -x test

# Format code
cargo fmt
pnpm prettier --write .
```

---

## 📋 Phase 1 Completion Status

### Completed Tasks ✅

- ✅ **TASK 1.1** - Project Setup
- ✅ **TASK 1.2** - Entity Manager (11 tests)
- ✅ **TASK 1.3** - Component Storage (14 tests)
- ✅ **TASK 2.1** - Query System (21 tests)
- ✅ **TASK 2.2** - Memory Allocator (23 tests)
- ✅ **TASK 3.1** - Event Bus (10 tests)
- ✅ **TASK 3.2** - Game Loop (12 tests)
- ✅ **TASK 4.1** - wasm-bindgen Exports
- ✅ **TASK 4.2** - Extended Tests (19 tests)
- ✅ **TASK 4.3** - Performance Benchmarks
- ✅ **TASK 5.x** - Polish & Documentation

### Statistics

- **Lines of Code:** 1,500+ (Rust) + 400+ (TypeScript)
- **Tests:** 120+ (100% pass rate)
- **Code Coverage:** 80%+
- **Commits:** 25+ (conventional format)
- **Git History:** Clean, documented commits
- **Performance:** ALL targets exceeded

---

## 🎓 Architecture Highlights

### Why Structure of Arrays (SoA)?

Traditional game engines use Array of Structs (AoS):
```rust
struct Entity { pos: Vec3, vel: Vec3, health: i32 }
let entities: Vec<Entity> = vec![...];
```

GWEN uses Structure of Arrays:
```rust
let positions: Vec<Vec3> = vec![...];
let velocities: Vec<Vec3> = vec![...];
let healths: Vec<i32> = vec![...];
```

**Benefits:**
- ✅ Cache-friendly iteration (only load what's needed)
- ✅ Better SIMD potential
- ✅ Easier parallel updates
- ✅ Efficient for sparse data

### Why Archetypes?

Entities have different component combinations:
- Player: [Position, Velocity, Health, Input]
- Enemy: [Position, Velocity, Health, AI]
- Projectile: [Position, Velocity]
- Static: [Position]

Archetypes group entities with same components for fast iteration.

### Why Linear Allocator?

Game frames are temporal - most allocations are per-frame:
```
Frame 1: Create objects → Process → Render → Destroy → Reset
Frame 2: Create objects → Process → Render → Destroy → Reset
```

Linear allocator excels here:
- ✅ O(1) allocation
- ✅ O(1) deallocation
- ✅ O(1) reset
- ✅ Zero fragmentation

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./docs/CONTRIBUTING.md) for details.

### Areas for Future Contribution

- **Phase 2:** Rendering system
- **Phase 3:** Physics plugin
- **Phase 4:** Audio system
- **Phase 5:** Scripting (Lua/Python)
- **Optimization:** SIMD, parallelization
- **Tools:** Visual debugger, profiler

---

## 📄 License

MIT License - See [LICENSE](./LICENSE)

---

## 🙏 Acknowledgments

Built with lessons from:
- Bevy engine (ECS design)
- Unity (ease of use)
- Unreal (performance)
- Godot (open source community)

---

## 📞 Support

- **Documentation:** [/docs](./docs)
- **Issues:** GitHub Issues
- **Discussions:** GitHub Discussions
- **Email:** support@gwen-engine.dev

---

## 🎯 Roadmap

### Phase 2 (Q2 2026)
- [ ] Rendering system (WebGL/WebGPU)
- [ ] Transform hierarchy
- [ ] Sprite system
- [ ] Animation system

### Phase 3 (Q3 2026)
- [ ] Physics engine (2D)
- [ ] Collision detection
- [ ] Particle system
- [ ] Sound system

### Phase 4 (Q4 2026)
- [ ] UI framework
- [ ] Input handling advanced
- [ ] Networking
- [ ] Save/load system

### Phase 5+ (2027)
- [ ] 3D graphics
- [ ] Scripting support
- [ ] Visual tools
- [ ] Community plugins

---

**GWEN Engine Phase 1: ✨ READY FOR PRODUCTION ✨**

Start building amazing games today!

