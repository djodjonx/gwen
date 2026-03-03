# 🛠️ GWEN CLI Guide

The GWEN CLI tool provides commands for scaffolding projects, managing development, and building games.

## Table of Contents

1. [Installation](#installation)
2. [Commands](#commands)
3. [Scaffolding](#scaffolding)
4. [Configuration](#configuration)
5. [Advanced Usage](#advanced-usage)

---

## Installation

### Global Installation

```bash
npm install -g @gwen/cli
```

Or use via pnpm:

```bash
pnpm add -g @gwen/cli
gwen --version
```

### Using via pnpm create

The recommended way to scaffold a project:

```bash
pnpm create @gwen/app my-game
```

---

## Commands

### `gwen create` (or `pnpm create @gwen/app`)

Create a new GWEN project.

```bash
# Interactive scaffolding
pnpm create @gwen/app

# With project name
pnpm create @gwen/app my-awesome-game

# Project will be created in ./my-awesome-game
```

**Options:**
- `--template <name>` - Use specific template (default: `default`)
- `--no-install` - Skip dependency installation
- `--typescript` - Generate TypeScript config

**Generated Structure:**
```
my-game/
├── src/
│   ├── components/
│   │   └── index.ts
│   ├── systems/
│   │   └── index.ts
│   ├── scenes/
│   │   ├── GameScene.ts
│   │   └── MainMenuScene.ts
│   ├── ui/
│   │   └── index.ts
│   └── main.ts
├── public/
│   └── index.html
├── gwen.config.ts
├── tsconfig.json
├── vite.config.ts
├── package.json
└── README.md
```

---

### `gwen dev`

Start the development server with hot-reload.

```bash
gwen dev [options]
```

**Options:**
- `--port <number>` - Port to run on (default: 3000)
- `--host <host>` - Host to bind to (default: localhost)
- `--open` - Open browser automatically
- `--verbose` - Detailed logging

**Example:**
```bash
# Start on port 3000
gwen dev

# Start on custom port and open browser
gwen dev --port 8080 --open

# Verbose logging
gwen dev --verbose
```

**Features:**
- ✅ Hot Module Replacement (HMR)
- ✅ WASM hot-reload (Rust changes auto-compile)
- ✅ Component hot-update
- ✅ System hot-reload
- ✅ No full page refresh needed

---

### `gwen build`

Build for production.

```bash
gwen build [options]
```

**Options:**
- `--outDir <path>` - Output directory (default: dist/)
- `--minify <minifier>` - Minifier to use (terser, esbuild)
- `--sourcemap` - Generate source maps
- `--production` - Production build (default: true)

**Example:**
```bash
# Standard production build
gwen build

# Build with source maps for debugging
gwen build --sourcemap

# Build to custom directory
gwen build --outDir=./build/
```

**Output:**
```
dist/
├── index.html
├── index.js
├── index.css (if used)
├── wasm/
│   ├── gwen_core.wasm
│   ├── gwen_core.d.ts
│   └── gwen_core_bg.wasm
└── assets/
    └── (images, etc.)
```

---

### `gwen prepare`

Prepare development environment (autorun on `gwen dev`).

```bash
gwen prepare
```

**What it does:**
- ✅ Generate TypeScript path aliases
- ✅ Verify WASM build is present
- ✅ Validate gwen.config.ts
- ✅ Create .gwen/ directory
- ✅ Setup virtual modules

**When to run:**
- After `npm install`
- After updating GWEN version
- After modifying gwen.config.ts

---

### `gwen lint`

Check code quality.

```bash
gwen lint [options]
```

**Options:**
- `--fix` - Auto-fix issues
- `--format <format>` - Output format (default: json)
- `--max-warnings <n>` - Max warnings before fail

**Example:**
```bash
# Check for issues
gwen lint

# Auto-fix issues
gwen lint --fix

# Get report as JSON
gwen lint --format json > report.json
```

---

### `gwen format`

Format code.

```bash
gwen format [options]
```

**Options:**
- `--check` - Check if files are formatted (don't modify)
- `--write` - Write changes to files
- `--parser <parser>` - Specify parser (typescript, javascript)

**Example:**
```bash
# Check formatting
gwen format --check

# Auto-format all files
gwen format --write
```

---

## Scaffolding

### Project Structure

When you create a new project with `pnpm create @gwen/app`, you get:

#### `gwen.config.ts`

Main configuration file for your game:

```typescript
import { defineConfig } from '@gwen/engine-core';
import { Canvas2DRenderer } from '@gwen/renderer-canvas2d';
import { InputPlugin } from '@gwen/plugin-input';

export default defineConfig({
  // Engine options
  engine: {
    maxEntities: 10000,
    targetFPS: 60,
    debug: false,
  },

  // Plugins to use
  plugins: [
    new Canvas2DRenderer({
      canvas: 'game',
      width: 1280,
      height: 720,
    }),
    new InputPlugin(),
  ],

  // WASM options
  wasm: {
    path: '/wasm/gwen_core.wasm',
  },
});
```

#### `src/main.ts`

Entry point of your game:

```typescript
import { getEngine } from '@gwen/engine-core';
import config from '../gwen.config';
import { GameScene } from './scenes/GameScene';

const engine = getEngine(config);

// Load initial scene
engine.scene.load(GameScene);

// Start game
engine.start();
```

#### `src/scenes/GameScene.ts`

Main game scene:

```typescript
import { defineScene } from '@gwen/engine-core';
import type { GwenServices } from '../types';

export const GameScene = defineScene<GwenServices>({
  name: 'GameScene',

  onEnter(api) {
    console.log('Game scene loaded');
    // Initialize game entities
  },

  onExit(api) {
    console.log('Game scene unloaded');
    // Cleanup
  },
});
```

#### `src/components/index.ts`

Define your game components:

```typescript
import { defineComponent, Types } from '@gwen/engine-core';

export const Position = defineComponent('Position', {
  x: Types.f32,
  y: Types.f32,
});

export const Velocity = defineComponent('Velocity', {
  x: Types.f32,
  y: Types.f32,
});

export const Health = defineComponent('Health', {
  current: Types.f32,
  max: Types.f32,
});
```

#### `src/systems/index.ts`

Implement your game logic:

```typescript
import { defineSystem } from '@gwen/engine-core';
import { Position, Velocity } from '../components';

export const MovementSystem = defineSystem({
  name: 'movement',
  onUpdate(api, dt) {
    const entities = api.query([Position, Velocity]);
    for (const [id, pos, vel] of entities) {
      pos.x += vel.x * dt;
      pos.y += vel.y * dt;
    }
  },
});
```

---

## Configuration

### gwen.config.ts

Main configuration file:

```typescript
import { defineConfig, type EngineConfig } from '@gwen/engine-core';

export default defineConfig({
  // Core engine config
  engine: {
    maxEntities: 10000,
    targetFPS: 60,
    debug: process.env.NODE_ENV === 'development',
  },

  // Plugins
  plugins: [
    // Add your plugins here
  ],

  // WASM module path
  wasm: {
    path: '/wasm/gwen_core.wasm',
  },

  // Vite config (optional)
  vite: {
    // Vite options passed through
  },
});
```

### tsconfig.json

Generated with proper GWEN aliases:

```json
{
  "extends": "./.gwen/tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./src/*"],
      "@components/*": ["./src/components/*"],
      "@systems/*": ["./src/systems/*"]
    }
  }
}
```

### vite.config.ts

Configured for GWEN:

```typescript
import { defineConfig } from 'vite';
import { gwen } from '@gwen/vite-plugin';

export default defineConfig({
  plugins: [
    gwen({
      cratePath: '../crates/gwen-core',
      watch: true,
    }),
  ],
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
});
```

---

## Advanced Usage

### Environment Variables

Use in `gwen.config.ts`:

```typescript
export default defineConfig({
  engine: {
    debug: process.env.NODE_ENV === 'development',
    maxEntities: parseInt(process.env.MAX_ENTITIES || '10000'),
  },
});
```

In `.env`:
```
NODE_ENV=development
MAX_ENTITIES=5000
```

### Custom Templates

Create custom project templates:

```bash
# Use custom template
pnpm create @gwen/app my-game --template my-template
```

Templates go in `packages/create-gwen-app/templates/`

---

### Monorepo Setup

For managing multiple games:

```
projects/
├── game-1/
│   ├── gwen.config.ts
│   ├── src/
│   └── package.json
├── game-2/
│   ├── gwen.config.ts
│   ├── src/
│   └── package.json
└── package.json (root)
```

Root `pnpm-workspace.yaml`:
```yaml
packages:
  - 'projects/*'
```

Then:
```bash
pnpm -r dev  # Dev all projects
pnpm -r build  # Build all projects
```

---

### Hot Module Replacement (HMR)

GWEN automatically enables HMR for:

- ✅ Component definition changes
- ✅ System logic updates
- ✅ Scene transitions
- ✅ Plugin hot-reload
- ✅ WASM code changes (auto-rebuild)

**No page refresh needed!**

---

## Troubleshooting

### "gwen: command not found"

```bash
# Install globally
npm install -g @gwen/cli

# Or use with pnpm
pnpm create @gwen/app my-game
```

---

### "Can't find gwen.config.ts"

Make sure you're in project root and file exists:

```bash
ls gwen.config.ts

# If missing, regenerate with prepare
gwen prepare
```

---

### "Port already in use"

Use different port:

```bash
gwen dev --port 3001
```

---

### "WASM module not found"

Run prepare:

```bash
gwen prepare
```

Then rebuild:

```bash
gwen build
```

---

## Next Steps

- 📖 [Read the Getting Started guide](./GETTING_STARTED.md)
- 🔗 [View the API Reference](./API.md)
- 🎮 [Create your first game](./GETTING_STARTED.md#creating-your-first-game)


