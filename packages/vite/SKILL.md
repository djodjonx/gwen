---
name: gwen-vite-plugin
description: Expert skill for GWEN build pipeline, Rust/WASM hot-reload, scene discovery, and virtual module injection.
---

# Vite Plugin Expert Skill

## Context
The GWEN Vite Plugin is the backbone of the development experience. it manages the compilation of Rust/WASM crates and the automatic linking of TypeScript scenes.

## Instructions

### 1. Configuration (`vite.config.ts`)
Set up the plugin to watch and compile your Rust logic.
```typescript
import { gwen } from '@gwenengine/vite';

export default defineConfig({
  plugins: [
    gwen({ 
      cratePath: './crates/game-core', 
      watch: true,     // Hot-reload .rs files (rebuilds WASM and refreshes page)
      wasmMode: 'dev', // Fast builds for dev, use 'release' for prod
      verbose: true    // Logs wasm-pack build output
    })
  ],
});
```

### 2. Scene Auto-Discovery
The plugin scans `src/scenes/` for any `.ts` files. 
- **Requirement**: Scenes must export a class or a constant using `defineScene`.
- **Naming**: The scene name is extracted from the `defineScene` call or the class name.
- **Booting**: The first scene found (or "Main", "MainMenu", "Boot") is set as the `mainScene` by default.

### 3. Virtual Modules
The plugin injects virtual modules that bridge Build-time data to Runtime:
- `virtual:gwen-manifest`: Contents of `gwen-manifest.json`.
- `/@gwenengine/gwen-scenes`: Auto-generated module that registers all discovered scenes.
- `/@gwenengine/gwen-entry`: The core bootstrap script that initializes WASM and starts the engine.

### 4. Development Server
- **Headers**: Automatically sets `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` (required for WASM SharedArrayBuffer).
- **WASM Middleware**: Serves `.wasm` files directly from `.gwen/wasm/` or from `node_modules`.

## Available Resources
- `packages/@gwenengine/vite-plugin/src/index.ts`: The complete plugin logic including `wasm-pack` spawn commands.

## Constraints
- **WASM Artifacts**: Never place `.wasm` files in the `public/` directory; this will conflict with the plugin's asset emission.
- **Scene Registration**: Don't manually import scenes in your main script; let the plugin handle it via the `/@gwenengine/gwen-scenes` virtual module.
- **Wasm-pack**: Requires `wasm-pack` to be installed globally or in your PATH.
- **Index.html**: If `index.html` is missing from the project root, the plugin serves a default one injecting the GWEN entry point.
