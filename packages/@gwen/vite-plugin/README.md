# @gwen/vite-plugin

**GWEN Vite Plugin — WASM hot-reload, asset management, and scene auto-discovery**

Integrate GWEN with Vite for seamless development with WASM hot-reloading.

## Installation

```bash
npm install -D @gwen/vite-plugin
```

## Quick Start

### Add to vite.config.ts

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

### Add to TypeScript Config

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { gwen } from '@gwen/vite-plugin';

export default defineConfig({
  plugins: [gwen()],
});
```

## Features

### 1. **WASM Hot-Reload**

Automatically rebuilds Rust/WASM code when `.rs` files change, then triggers HMR.

```typescript
new GwenPlugin({
  cratePath: '../crates/gwen-core',
  watch: true,
  wasmMode: 'debug', // 'debug' for dev, 'release' for build
})
```

### 2. **Scene Auto-Discovery**

Scans `src/scenes/` and generates scene registry automatically.

```typescript
// Scenes are auto-discovered from src/scenes/*.ts
// Example: src/scenes/GameScene.ts → auto-registered
```

### 3. **Manifest Injection**

Injects `gwen-manifest.json` as a virtual module.

```typescript
import manifest from 'virtual:gwen-manifest';

console.log(manifest.version);
console.log(manifest.buildDate);
```

## Configuration

```typescript
interface GwenPluginOptions {
  // Path to Rust crate (containing Cargo.toml)
  cratePath?: string;

  // URL prefix for served WASM files (default: '/wasm')
  wasmPublicPath?: string;

  // Enable WASM file watching (default: true in dev, false in build)
  watch?: boolean;

  // Compilation mode: 'debug' (fast) or 'release' (optimized)
  wasmMode?: 'release' | 'debug';

  // Path to gwen-manifest.json (optional)
  manifestPath?: string;

  // Enable verbose logging
  verbose?: boolean;
}
```

## Examples

### Development Setup

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { gwen } from '@gwen/vite-plugin';

export default defineConfig({
  plugins: [
    gwen({
      cratePath: './crates/gwen-core',
      watch: process.env.NODE_ENV === 'development',
      wasmMode: 'debug',
      verbose: true,
    }),
  ],
});
```

### Production Optimized Build

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [
    gwen({
      cratePath: './crates/gwen-core',
      wasmMode: 'release', // Optimized binary
      watch: false,
    }),
  ],
});
```

### With Scene Auto-Discovery

```typescript
// src/scenes/GameScene.ts
import { defineScene } from '@gwen/engine-core';

export const GameScene = defineScene({
  name: 'game',
  onInit(api) {
    console.log('Game started!');
  },
  onUpdate(delta) {
    // Game logic
  },
});

// src/scenes/MenuScene.ts
export const MenuScene = defineScene({
  name: 'menu',
  onInit(api) {
    console.log('Menu opened!');
  },
});

// Scenes are auto-discovered and registered ✨
```

## Virtual Modules

### `virtual:gwen-manifest`

Access build metadata:

```typescript
import manifest from 'virtual:gwen-manifest';

console.log(manifest.version);      // Package version
console.log(manifest.buildDate);    // Build timestamp
console.log(manifest.wasmPath);     // Path to WASM binary
```

## Troubleshooting

### WASM Files Not Updating

- Ensure `watch: true` is set in dev mode
- Check that `cratePath` points to the correct Cargo.toml
- Verify WASM builds succeed with `cargo build --target wasm32-unknown-unknown`

### Scene Discovery Not Working

- Place scenes in `src/scenes/` directory
- Use `defineScene()` or export as class
- Check browser console for auto-discovery logs with `verbose: true`

## Performance Tips

- Use `wasmMode: 'debug'` during development (faster rebuilds)
- Use `wasmMode: 'release'` for production builds
- Enable `watch: false` in production configuration

## See Also

- [@gwen/engine-core](../engine-core/) — Core engine
- [@gwen/cli](../cli/) — Command-line interface
- [Vite Documentation](https://vitejs.dev)

