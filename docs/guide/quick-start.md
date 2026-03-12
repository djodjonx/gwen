# Quick Start

Get your first GWEN game running in under 5 minutes.

## Prerequisites

- Node.js 18+
- pnpm (recommended)

You do **not** need to configure Rust/WASM manually for standard app development.

## 1) Create a project

```bash
npx @djodjonx/create-gwen-app my-game
cd my-game
```

## 2) Install dependencies

```bash
pnpm install
```

## 3) Start dev server

```bash
pnpm dev
```

Open the local URL shown in the terminal (usually `http://localhost:3000`).

## 4) Understand generated files

A scaffolded app typically contains:

```text
src/
  components/
  prefabs/
  scenes/
  systems/
  ui/
gwen.config.ts
package.json
tsconfig.json
```

Read [Project Structure](/guide/project-structure) for details.

## 5) Add your first gameplay logic

Example system:

```ts
import { defineSystem } from '@djodjonx/gwen-engine-core';
import { Position, Velocity } from '../components';

export const MovementSystem = defineSystem({
  name: 'MovementSystem',
  onUpdate(api, dt) {
    const entities = api.query([Position, Velocity]);
    for (const id of entities) {
      const pos = api.getComponent(id, Position);
      const vel = api.getComponent(id, Velocity);
      if (!pos || !vel) continue;
      api.addComponent(id, Position, {
        x: pos.x + vel.vx * dt,
        y: pos.y + vel.vy * dt,
      });
    }
  },
});
```

## Common commands

```bash
pnpm dev
pnpm build
pnpm preview
pnpm lint
pnpm format
```

## Next steps

- [Philosophy](/guide/philosophy)
- [Core Concepts](/core/components)
- [API Overview](/api/overview)
- [CLI Commands](/cli/commands)
