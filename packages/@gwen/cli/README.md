# @gwen/cli

**GWEN CLI — Command-line interface for game development**

Build, develop, and scaffold GWEN game projects from the command line.

## Installation

```bash
npm install -D @gwen/cli
# or globally
npm install -g @gwen/cli
```

## Quick Start

### Create a New Project

```bash
npm create gwen-app@latest my-game
cd my-game
npm install
npm run dev
```

### Commands

#### `gwen dev`

Start the development server with WASM hot-reload.

```bash
gwen dev
```

Options:

- `--port 3000` — Custom port (default: 5173)
- `--open` — Auto-open in browser

#### `gwen build`

Build for production.

```bash
gwen build
```

Outputs optimized WASM and JavaScript to `dist/`.

#### `gwen prepare`

Prepare the project (one-time setup).

```bash
gwen prepare
```

#### `gwen lint`

Lint your code with oxlint.

```bash
gwen lint
# Fix issues
gwen lint --fix
```

#### `gwen format`

Format code with oxfmt.

```bash
gwen format --check  # Check only
gwen format          # Fix
```

## Configuration

### gwen.config.ts

Configure your game engine:

```typescript
// gwen.config.ts
import { defineConfig } from '@gwen/engine-core';
import { InputPlugin } from '@gwen/plugin-input';
import { AudioPlugin } from '@gwen/plugin-audio';

export default defineConfig({
  // Canvas element ID
  canvas: 'game-canvas',

  // Engine configuration
  fps: 60,

  // Plugins
  plugins: [new InputPlugin(), new AudioPlugin()],
});
```

### vite.config.ts

```typescript
import { defineConfig } from 'vite';
import { gwen } from '@gwen/vite-plugin';

export default defineConfig({
  plugins: [
    gwen({
      cratePath: './crates/gwen-core',
      watch: true,
    }),
  ],
});
```

## Project Structure

```
my-game/
├── src/
│   ├── main.ts              # Entry point
│   ├── scenes/              # Game scenes
│   │   └── GameScene.ts
│   ├── components/          # Component definitions
│   ├── systems/             # Game systems
│   └── prefabs/             # Entity prefabs
├── crates/
│   └── gwen-core/           # Rust WASM core
├── gwen.config.ts           # Engine config
├── vite.config.ts           # Build config
├── index.html               # HTML entry
└── package.json
```

## Examples

### Development Workflow

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
# → http://localhost:5173
# → WASM auto-reloads on .rs changes

# Build for production
npm run build

# Preview production build
npm run preview
```

### Create a Scene

```typescript
// src/scenes/GameScene.ts
import { defineScene, defineComponent, Types } from '@gwen/engine-core';

const Position = defineComponent('Position', {
  x: Types.f32,
  y: Types.f32,
});

export const GameScene = defineScene({
  name: 'game',
  async onInit(api) {
    const engine = api.engine;

    // Create player entity
    const player = engine.createEntity();
    engine.addComponent(player, Position, { x: 100, y: 100 });
  },
  onUpdate(delta) {
    // Game logic
  },
});
```

### Using Plugins

```typescript
// gwen.config.ts
import { InputPlugin } from '@gwen/plugin-input';
import { AudioPlugin } from '@gwen/plugin-audio';

export default defineConfig({
  plugins: [new InputPlugin(), new AudioPlugin()],
});

// In your scene:
const input = api.services.get('input');
const audio = api.services.get('audio');

if (input.isJustPressed('Space')) {
  audio.play('jump');
}
```

## Troubleshooting

### Port Already in Use

```bash
gwen dev --port 3001
```

### WASM Build Fails

- Ensure Rust toolchain is installed: `rustup target add wasm32-unknown-unknown`
- Check Cargo.toml in `crates/gwen-core/`
- Try `cargo build --target wasm32-unknown-unknown` manually

### Hot-Reload Not Working

- Verify `vite.config.ts` has `gwen()` plugin registered
- Check that `.rs` files are in the crate directory
- Enable verbose logging: `gwen({ verbose: true })`

## See Also

- [@gwen/engine-core](../engine-core/) — Core engine API
- [@gwen/vite-plugin](../vite-plugin/) — Vite integration
- [GWEN Documentation](https://gwen.dev/docs)
