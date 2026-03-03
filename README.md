# 🎮 GWEN Game Engine

[![CI Status](https://github.com/djodjonx/gwen/workflows/CI/badge.svg)](https://github.com/djodjonx/gwen/actions)
[![npm version](https://badge.fury.io/js/%40gwen%2Fengine-core.svg)](https://www.npmjs.com/package/@gwen/engine-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-blue)](https://www.typescriptlang.org/)

**High-performance, composable game engine for the web.**
Built with Rust + WebAssembly core and TypeScript APIs.

[📚 Docs](#documentation) · [🚀 Quick Start](#quick-start) · [🤝 Contributing](./CONTRIBUTING.md) · [📋 Code of Conduct](./CODE_OF_CONDUCT.md)

---

## ✨ What is GWEN?

GWEN is a **modular game engine** designed for:

- 🚀 **Ultra-fast performance** - Rust core compiled to WebAssembly
- 🎯 **Entity Component System** - Flexible game architecture with archetype caching
- 📦 **Plugin system** - Compose features like Nuxt plugins
- 🛠️ **Developer-friendly** - TypeScript APIs with 100% type safety
- 🌐 **Web-native** - Runs in any modern browser

---

## 🚀 Quick Start

### Option 1: Create a New Project (Recommended)

```bash
# Scaffold a new game project
pnpm create @gwen/app my-game
cd my-game
pnpm dev
```

This generates a complete project structure with:
- ✅ Game components & systems
- ✅ Configuration file
- ✅ TypeScript setup
- ✅ Example game scene

### Option 2: Development Setup (For Contributors)

```bash
# Clone and contribute to GWEN itself
git clone https://github.com/djodjonx/gwen.git
cd gwen
pnpm install:all

# Start development
pnpm dev

# Run tests
pnpm test
```

### Your First Game

```typescript
import { Engine, defineComponent, Types } from '@gwen/engine-core';
import { Canvas2DRenderer } from '@gwen/renderer-canvas2d';

// Define a component
const Position = defineComponent('Position', {
  x: Types.f32,
  y: Types.f32,
});

// Create engine
const engine = new Engine({ maxEntities: 1000 });
engine.registerSystem(new Canvas2DRenderer({ canvas: 'game' }));

// Create entity
const player = engine.createEntity();
engine.addComponent(player, Position, { x: 100, y: 100 });

// Update loop
engine.registerSystem({
  name: 'movement',
  onUpdate(api, dt) {
    const entities = api.query([Position]);
    for (const [id, pos] of entities) {
      pos.x += 100 * dt;
    }
  },
});

// Start!
engine.start();
```

---

## ⚡ Performance

On Apple M1 (2024):

- ✅ 10K entities: < 5ms allocation
- ✅ 1K queries: < 1ms execution
- ✅ Full frame loop: ~16ms (60 FPS)
- ✅ WASM module: 48KB gzipped

---

## 🏗️ Architecture

**3-layer design:**

```
Your Game (TypeScript)
    ↓
Plugins (Input, Audio, UI, Rendering)
    ↓
Core Engine (Rust/WASM ECS)
```

**Learn more:** [Architecture Guide](./docs/ARCHITECTURE.md)

---

## 🛠️ CLI Tool

GWEN includes a powerful CLI for scaffolding and managing projects:

```bash
# Create new project
pnpm create @gwen/app my-game

# Available commands
gwen dev      # Start development server
gwen build    # Build for production
gwen prepare  # Prepare dev environment
gwen lint     # Check code quality
```

**Learn more:** [CLI Guide](./docs/CLI.md)

---

## 📚 Documentation

- 🎯 [Getting Started](./docs/GETTING_STARTED.md) - Installation & setup
- 🛠️ [CLI Guide](./docs/CLI.md) - Scaffolding & commands
- 🔗 [API Reference](./docs/API.md) - Complete API documentation
- 🏗️ [Architecture](./docs/ARCHITECTURE.md) - How GWEN works
- 🆘 [Troubleshooting](./docs/TROUBLESHOOTING.md) - FAQ & common issues
- 🤝 [Contributing](./CONTRIBUTING.md) - How to contribute
- 📋 [Code of Conduct](./CODE_OF_CONDUCT.md) - Community standards
- 🔐 [Security](./SECURITY.md) - Security policy

---

## 📦 Key Features

- **ECS Architecture** - Data-oriented, cache-friendly design
- **Type Safety** - 100% TypeScript with strict mode
- **Plugin System** - Hot-pluggable features
- **Zero-Copy** - Minimal WASM ↔ JS boundary crossing
- **Archetype Caching** - Lightning-fast queries
- **Browser-Native** - No build step required (Vite integration)

---

## 🎮 Example: Space Shooter

Full working example in the [playground](./playground/):

```bash
cd playground
pnpm dev
```

Open http://localhost:5173 to play.

---

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for:

- How to set up your development environment
- Commit message format
- Code of conduct
- Pull request process

**Quick links:**
- 🐛 [Report a bug](https://github.com/djodjonx/gwen/issues)
- ✨ [Request a feature](https://github.com/djodjonx/gwen/discussions)
- 💬 [Ask a question](https://github.com/djodjonx/gwen/discussions)

---

## 📄 License

MIT - See [LICENSE](./LICENSE)

---

## 🙏 Acknowledgments

GWEN is inspired by:
- **Bevy** - ECS architecture
- **Unity** - Plugin system
- **Nuxt.js** - Composable patterns
- **Tauri** - Rust + web integration

---

## 🚀 What's Next?

- [x] Core ECS engine
- [x] Canvas2D renderer
- [x] Plugin system
- [ ] WebGPU renderer
- [ ] Physics engine
- [ ] Networking

---

**Made with ❤️ for web developers who love performance.**

[💬 Join our discussions](https://github.com/djodjonx/gwen/discussions) · [📚 Read the docs](./docs/GETTING_STARTED.md)

