---
layout: home

hero:
  name: GWEN
  text: Web Game Framework
  tagline: Build games with TypeScript, powered by Rust/WASM
  actions:
    - theme: brand
      text: Quick Start
      link: /guide/quick-start
    - theme: alt
      text: View on GitHub
      link: https://github.com/djodjonx/gwen

features:
  - icon: 🎯
    title: Scene-Driven
    details: Organize your game with scenes, systems, and prefabs for clear structure and reusability.

  - icon: 🔧
    title: TypeScript-First
    details: Write game logic with defineComponent, defineScene, definePrefab helpers and full type safety.

  - icon: ⚡
    title: High Performance
    details: Rust/WASM ECS core delivers 10K+ entities at 60 FPS without breaking a sweat.

  - icon: 🔌
    title: Plugin System
    details: Compose features with official plugins (input, audio, renderer, debug, UI) or create your own.

  - icon: 🎨
    title: Renderer-Agnostic UI
    details: Use Canvas2D, HTML/CSS, WebGL, or mix them. Choose your rendering layer, GWEN doesn't force it.

  - icon: 📦
    title: CLI Scaffolding
    details: Start in seconds with 'pnpm create gwen-app' and focus on gameplay.
---

## What is GWEN?

GWEN is a **composable web game framework** designed for TypeScript developers who want structure without complexity.

Your game is organized in clear folders:
- **components/** - data definitions
- **scenes/** - game flow and lifecycle
- **systems/** - gameplay logic
- **prefabs/** - reusable entities
- **ui/** - custom rendering

Everything is configured in one place (`gwen.config.ts`) and runs with `gwen dev`.

## Quick Example

```typescript
import { defineComponent, Types, defineSystem, defineScene } from '@djodjonx/gwen-engine-core';

export const Position = defineComponent({
  name: 'position',
  schema: { x: Types.f32, y: Types.f32 }
});

export const PlayerSystem = defineSystem({
  name: 'PlayerSystem',
  onUpdate(api, dt) {
    const keyboard = api.services.get('keyboard');
    const entities = api.query(['position']);

    for (const id of entities) {
      const pos = api.getComponent(id, Position);
      if (!pos) continue;
      if (keyboard.isPressed('ArrowRight')) {
        api.addComponent(id, Position, { x: pos.x + 100 * dt, y: pos.y });
      }
    }
  }
});

export const GameScene = defineScene('Game', () => ({
  systems: [PlayerSystem],
  onEnter(api) {
    const player = api.createEntity();
    api.addComponent(player, Position, { x: 100, y: 100 });
  },
  onExit() {},
}));
```

No manual Rust setup for app users. Focus on game logic.

## Ready to Start?

<div class="vp-doc">
  <a href="/guide/quick-start" class="vp-button brand">Get Started →</a>
</div>
