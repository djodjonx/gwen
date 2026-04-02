---
layout: home

hero:
  name: GWEN
  text: Composable Web Game Framework
  tagline: TypeScript-first DX, Rust/WASM performance.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/quick-start
    - theme: alt
      text: Why GWEN?
      link: /guide/what-is-gwen

features:
  - icon: ⚡
    title: Rust/WASM Performance
    details: The ECS, physics engine, and math primitives run in pre-compiled Rust/WASM. You get near-native frame performance without writing a single line of Rust.
  - icon: 🧩
    title: Composable Systems
    details: Build game logic with defineSystem() and lifecycle hooks — onUpdate, onBeforeUpdate, onAfterUpdate, onRender. Composables resolve once at setup, not every frame.
  - icon: 🛠️
    title: Plugin-first
    details: Every engine capability — physics, input, audio, rendering, UI — is a plugin. Register them with engine.use(plugin) and compose your runtime exactly as you need it.
  - icon: ✅
    title: Zero-config types
    details: Run gwen prepare once. Service types flow automatically into GwenDefaultServices — no manual casts, no boilerplate, full IDE autocomplete everywhere.
  - icon: 🚀
    title: Fast onboarding
    details: Scaffold a full project in one command. No Rust toolchain, no WASM build step — the compiled binaries ship with each npm package.
  - icon: 🎨
    title: Renderer-agnostic
    details: Swap renderers without touching game logic. Use the built-in Canvas2D plugin, the React Three Fiber integration, or bring your own renderer.
---

## Why GWEN?

Web games are stuck between two extremes: pure-JS engines that top out at a few hundred entities, and heavyweight native ports that fight the browser platform. GWEN takes a different path.

The performance-critical core — the ECS scheduler, spatial queries, physics simulation, matrix math — is written in Rust and pre-compiled to WebAssembly. It ships as ordinary npm packages. You never touch Rust. Everything else — game logic, scenes, UI, plugins — is idiomatic TypeScript with first-class type safety.

The result is a framework that feels like writing a modern Nuxt or Vite app, and performs like a native engine.

```sh
pnpm create @gwenjs/create my-game
```
