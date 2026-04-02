---
layout: home

hero:
  name: GWEN
  text: Composable Web Game Framework
  tagline: TypeScript-first developer experience, Rust/WASM performance under the hood.
  actions:
    - theme: brand
      text: Quick Start
      link: /guide/quick-start
    - theme: alt
      text: API Overview
      link: /api/overview

features:
  - icon: 🧩
    title: Composition over inheritance
    details: Build gameplay with components, systems, prefabs, and scenes that stay easy to reason about.

  - icon: ⚡
    title: Rust/WASM core
    details: Keep TypeScript ergonomics while leveraging a high-performance core for large entity counts.

  - icon: 🛠️
    title: Plugin-first architecture
    details: Add capabilities with official @gwenjs plugins (input, audio, renderer, physics, UI) or your own.

  - icon: ✅
    title: Type-safe by default
    details: Run "gwen prepare" once and services, hooks, and extensions are auto-completed everywhere.

  - icon: 🚀
    title: Fast onboarding
    details: Start a new app with pnpm create @gwenjs/create and be coding in under a minute.

  - icon: 🎨
    title: Renderer-agnostic UI
    details: Use Canvas2D, HTML UI, or custom renderers without locking your gameplay architecture.
---

## Why GWEN?

GWEN is designed for teams who want structure without ceremony.

- **Predictable architecture**: Scene lifecycle + ECS keeps game flow explicit.
- **End-user first**: You can ship full games without touching Rust internals.
- **Scalable project layout**: Consistent folders from prototype to production.
- **Extensible runtime**: Add features as plugins instead of hard-coding engine behavior.

## Create your first app

```bash
pnpm create @gwenjs/create my-game
cd my-game
pnpm install
pnpm dev
```

## Package scope reference

Official packages use the `@gwenjs` scope, for example:

- `@gwenjs/core`
- `@gwenjs/app`
- `@gwenjs/kit`
- `@gwenjs/input`
- `@gwenjs/audio`

## Continue reading

- [Philosophy](/guide/philosophy)
- [Quick Start](/guide/quick-start)
- [Project Structure](/guide/project-structure)
- [API Overview](/api/overview)
- [CLI Commands](/cli/commands)
