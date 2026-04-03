/**
 * Template factory for the scaffolded project's `README.md`.
 *
 * Generates a friendly quick-start guide with controls, available commands,
 * and a brief description of the landing game starter.
 */

/**
 * Returns the `README.md` content for a newly scaffolded GWEN project.
 *
 * @param name - The project name used as the README title.
 * @returns The Markdown string (with trailing newline).
 */
export function readmeTemplate(name: string): string {
  return `# ${name}

A game built with the [GWEN Engine](https://github.com/gwenjs/gwen) — a hybrid Rust/WASM + TypeScript 2D/3D web game engine.

## Getting started

\`\`\`bash
pnpm install
pnpm dev
\`\`\`

Open **http://localhost:5173** and you'll see the **Starfield Shooter** landing game running immediately.

## Controls

| Key | Action |
|-----|--------|
| **Arrow keys** / **WASD** | Move ship |
| **Space** | Fire |

## Commands

| Command | Description |
|---------|-------------|
| \`pnpm dev\` | Start dev server with hot-reload |
| \`pnpm build\` | Production build |
| \`pnpm lint\` | Run oxlint on \`src/\` |
| \`pnpm lint:fix\` | Auto-fix lint issues |
| \`pnpm format\` | Format with oxfmt |
| \`pnpm format:check\` | Check formatting without writing |
| \`pnpm typecheck\` | TypeScript type check (no emit) |

## Project structure

\`\`\`
src/
├── components/
│   └── game.ts          # ECS component definitions
├── systems/
│   ├── movement.ts      # Entity movement (position += velocity × dt)
│   ├── input.ts         # Player input → velocity + shooting
│   ├── collision.ts     # Bullet × asteroid AABB hit detection
│   └── spawn.ts         # Periodic asteroid spawner
└── scenes/
    └── game.ts          # Scene wiring all systems together
gwen.config.ts           # Engine configuration (renderer, plugins, modules)
\`\`\`

## Adding features

Extend the game by adding modules in \`gwen.config.ts\`:

\`\`\`typescript
// gwen.config.ts
export default defineConfig({
  modules: [
    '@gwenjs/physics2d',   // Rapier 2D physics
    '@gwenjs/audio',       // Web Audio API
    '@gwenjs/debug',       // Performance HUD
  ],
  // ...
})
\`\`\`

Then install:

\`\`\`bash
pnpm add @gwenjs/physics2d @gwenjs/audio @gwenjs/debug
\`\`\`

## Learn more

- [GWEN documentation](https://gwenjs.dev)
- [ECS guide](https://gwenjs.dev/docs/ecs)
- [Plugin authoring](https://gwenjs.dev/docs/plugins)
`;
}
