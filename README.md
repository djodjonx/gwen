# GWEN (Game Web Engine)

[![CI Status](https://github.com/djodjonx/gwen/workflows/CI/badge.svg)](https://github.com/djodjonx/gwen/actions)
[![npm version](https://badge.fury.io/js/%40gwen%2Fengine-core.svg)](https://www.npmjs.com/package/@gwen/engine-core)
[![Docs](https://img.shields.io/badge/Docs-GitHub%20Pages-blue)](https://djodjonx.github.io/gwen/)
[![License: MPL-2.0](https://img.shields.io/badge/License-MPL--2.0-brightgreen.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-blue)](https://www.typescriptlang.org/)

**Composable web game framework with a Rust/WASM ECS core and TypeScript-first DX.**

GWEN helps you build games with a clear structure:
- scenes for game flow
- systems for logic
- components for data
- prefabs for reusable entities
- UI modules for menus/HUD

[Quick Start](#quick-start) · [Documentation](https://djodjonx.github.io/gwen/) · [Project Structure](#project-structure) · [CLI](#cli)

---

## Why GWEN?

- **Config-first workflow** via `gwen.config.ts`
- **CLI scaffolding** for fast project creation
- **Plugin architecture** (input, audio, renderer, debug, html-ui)
- **High-performance ECS** powered by Rust + WASM
- **Type-safe APIs** for systems, scenes, services, and plugins

---

## Quick Start

### 1) Scaffold a game project (recommended)

```bash
pnpm create @gwen/app my-game
cd my-game
pnpm dev
```

### 2) Open the dev server

```bash
# Usually
http://localhost:3000
```

### 3) Build for production

```bash
gwen build
```

---

## CLI

GWEN ships with a CLI designed around the same workflow as the playground.

```bash
# Create project
pnpm create @gwen/app my-game

# Development
gwen dev

# Prepare generated typing/runtime files
gwen prepare

# Production build
gwen build

# Code quality
gwen lint
gwen format --check
```

See full command reference in [`docs/CLI.md`](docs/CLI.md).

---

## Project Structure

GWEN targets a structure like the `playground` app:

```text
src/
  components/   # ECS component definitions
  prefabs/      # reusable entity blueprints
  scenes/       # game flow and scene lifecycle
  systems/      # gameplay logic (runs every frame/event)
  ui/           # HUD/menu UI modules
```

This structure is intentional: it keeps gameplay code discoverable as the project grows.

---

## Core Workflow

1. Configure engine and plugins in `gwen.config.ts`
2. Define components in `src/components`
3. Implement systems in `src/systems`
4. Compose scenes in `src/scenes`
5. Reuse entities via `src/prefabs`
6. Start with `gwen dev`

Example config shape:

```ts
import { defineConfig } from '@gwen/engine-core';
import { InputPlugin } from '@gwen/plugin-input';
import { AudioPlugin } from '@gwen/plugin-audio';
import { Canvas2DRenderer } from '@gwen/renderer-canvas2d';

export default defineConfig({
  engine: { maxEntities: 2000, targetFPS: 60, debug: false },
  plugins: [
    new InputPlugin(),
    new AudioPlugin(),
    new Canvas2DRenderer({ width: 480, height: 640 }),
  ],
});
```

---

## Architecture (high level)

```text
Your Game (Scenes / Systems / Components / UI)
  -> GWEN Plugins (Renderer, Input, Audio, Debug, ...)
    -> GWEN Core (Rust/WASM ECS)
```

For technical details, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Documentation

**Full Documentation:** [https://djodjonx.github.io/gwen/](https://djodjonx.github.io/gwen/)

Reference files:
- [`docs/GETTING_STARTED.md`](docs/GETTING_STARTED.md) - setup and first run
- [`docs/CLI.md`](docs/CLI.md) - command reference and scaffolding
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) - technical architecture
- [`CONTRIBUTING.md`](CONTRIBUTING.md) - contribution guide
- [`SECURITY.md`](SECURITY.md) - vulnerability reporting

---

## Contributing

We welcome issues, ideas, and PRs.

- Report bugs: https://github.com/djodjonx/gwen/issues
- Discuss features: https://github.com/djodjonx/gwen/discussions
- Read contribution guide: [`CONTRIBUTING.md`](CONTRIBUTING.md)

---

## License

GWEN is licensed under **Mozilla Public License 2.0 (MPL-2.0)**.
See [`LICENSE`](LICENSE).
