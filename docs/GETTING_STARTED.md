# 🚀 Getting Started with GWEN

Welcome! This guide will help you set up your development environment and create your first GWEN game.

## Prerequisites

Before you start, make sure you have:

- **Rust** 1.75 or later ([install](https://rustup.rs/))
- **Node.js** 18 or later ([install](https://nodejs.org/))
- **pnpm** 8 or later (`npm install -g pnpm`)
- **wasm-pack** (`cargo install wasm-pack`)

## Installation

### Clone the Repository

```bash
git clone https://github.com/djodjonx/gwen.git
cd gwen
```

### Install Dependencies

```bash
# Install everything (Node dependencies + Rust targets)
pnpm install:all

# Or manually:
pnpm install
rustup target add wasm32-unknown-unknown
```

## Development Workflow

### Start Development Server

```bash
# Hot-reload with WASM rebuilds
pnpm dev
```

This starts:
- Vite dev server on http://localhost:5173
- Rust/WASM file watcher (auto-rebuilds on .rs changes)
- Full HMR (Hot Module Replacement)

### Build for Production

```bash
# Build Rust core + all TypeScript packages
pnpm build
```

### Run Tests

```bash
# Test Rust core + TypeScript packages
pnpm test

# Test specific package
cd packages/@gwen/engine-core
pnpm test

# Watch mode
pnpm test --watch
```

### Linting & Formatting

```bash
# Check code quality
pnpm lint

# Auto-fix issues
pnpm lint:fix

# Check formatting
pnpm format:check

# Auto-format code
pnpm format
```

## Project Structure

```
gwen/
├── crates/gwen-core/        # Rust core (WASM)
│   ├── src/                 # Rust source
│   └── tests/               # Rust tests
│
├── packages/@gwen/          # TypeScript packages
│   ├── engine-core/         # Main engine (Rust + TS bindings)
│   ├── cli/                 # Command-line tool
│   ├── plugin-*/            # Official plugins
│   ├── renderer-*/          # Renderers
│   └── vite-plugin/         # Vite integration
│
├── playground/              # Example game (Space Shooter)
└── docs/                    # Documentation
```

## Creating Your First Game

### 1. Create a New Project

```bash
pnpm create @gwen/app my-game
cd my-game
```

### 2. Set Up Your Game Config

Create `gwen.config.ts`:

```typescript
import { defineConfig } from '@gwen/engine-core';
import { Canvas2DRenderer } from '@gwen/renderer-canvas2d';

export default defineConfig({
  plugins: [
    new Canvas2DRenderer({ canvas: 'game' }),
  ],
});
```

### 3. Create Your First Component

`src/components/Position.ts`:

```typescript
import { defineComponent, Types } from '@gwen/engine-core';

export const Position = defineComponent('Position', {
  x: Types.f32,
  y: Types.f32,
});
```

### 4. Create a System

`src/systems/movement.ts`:

```typescript
import { defineSystem } from '@gwen/engine-core';
import { Position } from '../components/Position';

export const MovementSystem = defineSystem({
  name: 'movement',
  onUpdate(api, dt) {
    const entities = api.query([Position]);
    for (const [id, pos] of entities) {
      pos.x += 100 * dt;
    }
  },
});
```

### 5. Wire It All Together

`src/main.ts`:

```typescript
import { getEngine } from '@gwen/engine-core';
import config from '../gwen.config';
import { Position } from './components/Position';
import { MovementSystem } from './systems/movement';

const engine = getEngine(config);

// Register systems
engine.registerSystem(MovementSystem);

// Create entity
const player = engine.createEntity();
engine.addComponent(player, Position, { x: 0, y: 0 });

// Start game loop
engine.start();
```

## Common Tasks

### Debug Your Game

```bash
# Run with debug plugin for performance metrics
pnpm dev

# Open browser console (F12) to see logs
```

### Watch Files for Development

```bash
# Watch Rust files (auto-rebuild WASM)
cargo watch -x 'build --target wasm32-unknown-unknown'

# Or let pnpm dev handle it
pnpm dev
```

### Build WASM for Production

```bash
# Optimized build with wasm-opt
wasm-pack build --target web --release --out-dir packages/@gwen/engine-core/wasm crates/gwen-core
```

### Publish Packages to npm

```bash
# Use changesets for version management
pnpm changeset
pnpm changeset:version
pnpm release
```

## IDE Setup

### VS Code (Recommended)

1. Install extensions:
   - Rust Analyzer
   - Prettier
   - ESLint
   - WASM

2. Create `.vscode/settings.json`:

```json
{
  "rust-analyzer.check.command": "clippy",
  "rust-analyzer.procMacro.enable": true,
  "[typescript]": {
    "editor.formatOnSave": true,
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

### WebStorm / IntelliJ IDEA

1. Install Rust plugin
2. Enable code inspections
3. Configure TypeScript compiler

## Troubleshooting

### "wasm-pack not found"

```bash
cargo install wasm-pack
```

### "Module not found" errors

```bash
# Reinstall dependencies
rm -rf node_modules
pnpm install
```

### WASM module fails to load in browser

```bash
# Check WASM file exists
ls packages/@gwen/engine-core/wasm/

# Rebuild WASM
pnpm build
```

### Port 5173 already in use

```bash
# Use different port
pnpm dev -- --port 3000
```

## Next Steps

- 📚 Read the [API Reference](./API.md)
- 🏗️ Learn about [Architecture](./ARCHITECTURE.md)
- 🤝 Check [Contributing Guidelines](../CONTRIBUTING.md)
- 🎮 Explore the [Playground](../playground/) example

## Getting Help

- 💬 [GitHub Discussions](https://github.com/djodjonx/gwen/discussions)
- 🐛 [Report Issues](https://github.com/djodjonx/gwen/issues)
- 📖 [Read the Docs](./API.md)

---

**Happy coding!** 🚀

