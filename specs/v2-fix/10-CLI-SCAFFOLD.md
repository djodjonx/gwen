# Fix #14 — CLI Scaffold: Turnkey Project with Landing Game

> **Agent directive:** Implement a complete `gwen init` scaffold that produces a ready-to-run game project with Vite 8, TypeScript 6, oxlint, oxfmt, and a playable "landing game" starter — analogous to what Nuxt does with its landing page.

---

## Problem Statement

The current `gwen init` command generates a minimal skeleton that is NOT ready to run:

| Gap | Current state | Expected state |
|-----|--------------|----------------|
| `tsconfig.json` | ❌ not generated | ✅ TypeScript 6, strict mode, `moduleResolution: "bundler"` |
| `oxlint.json` | ❌ not generated | ✅ pre-configured rules |
| oxfmt config | ❌ not generated | ✅ `.oxfmtrc.json` |
| `typescript` devDep | ❌ missing | ✅ `^6.0.0` |
| `oxlint` devDep | ❌ missing | ✅ latest |
| `oxfmt` devDep | ❌ missing | ✅ latest |
| Lint/format/typecheck scripts | ❌ missing | ✅ `lint`, `format`, `typecheck` scripts |
| `README.md` | ❌ missing | ✅ quick-start guide |
| `index.html` | ❌ missing (framework generates virtual entry) | ✅ only if framework does NOT provide it |
| Starter game | ❌ empty scene, blank screen | ✅ playable mini-game (see below) |

---

## Solution: "Landing Game" Concept

Inspired by Nuxt's landing page: when you run `pnpm dev` for the first time, you see **something running immediately** — a simple but polished mini-game that demonstrates the engine capabilities.

### The "Starfield Shooter" starter

A self-contained micro-game that fits in one scene file and works with zero optional modules selected:

- **Background:** scrolling star field (pure Canvas2D, no physics needed)
- **Player ship:** moves with arrow keys or WASD, fires bullets with Space
- **Enemies:** simple asteroids that drift down, wrap around screen edges
- **Collision:** AABB hit detection in JS (no physics module required)
- **Score:** displayed with Canvas2D `fillText`
- **No external assets:** all rendering is procedural (circles, polygons, lines)

**Why this game:**
- Works with 0 optional modules (no physics, no audio required)
- Demonstrates: ECS entities, components, systems, `onUpdate`, `onRender`, `useInput`
- < 200 lines of game code — readable as documentation
- Can upgrade: add `@gwenjs/physics2d` to improve collision, add `@gwenjs/audio` for sounds

### Starter files generated

```
<project-name>/
├── package.json             # Vite 8, TS 6, oxlint, oxfmt, all scripts
├── tsconfig.json            # TypeScript 6, strict, bundler moduleResolution
├── oxlint.json              # Lint rules pre-configured for GWEN projects
├── .oxfmtrc.json            # oxfmt formatting config
├── gwen.config.ts           # defineConfig with Canvas2DRenderer + InputPlugin
├── README.md                # Quick-start guide
└── src/
    ├── components/
    │   └── game.ts          # Position, Velocity, Ship, Asteroid, Bullet components
    ├── systems/
    │   ├── movement.ts      # Entity movement system
    │   ├── input.ts         # Player input → velocity system
    │   ├── collision.ts     # AABB bullet × asteroid collision
    │   └── spawn.ts         # Asteroid spawner
    └── scenes/
        └── game.ts          # Main scene wiring everything together
```

---

## Implementation Plan

### Step 1 — Update `init.ts` scaffolded `package.json`

Add missing devDependencies and scripts:

```typescript
// packages/cli/src/commands/init.ts — packageJson object
devDependencies: {
  '@gwenjs/cli': `^${gwenVersion}`,
  '@gwenjs/vite': `^${gwenVersion}`,
  'vite': '^8.0.0',
  'typescript': '^6.0.0',
  'oxlint': '^0.16.0',
  'oxfmt': '^0.36.0',
},
scripts: {
  dev: 'gwen dev',
  build: 'gwen build',
  postinstall: 'gwen prepare',
  lint: 'oxlint src/',
  'lint:fix': 'oxlint --fix src/',
  format: 'oxfmt src/',
  'format:check': 'oxfmt --check src/',
  typecheck: 'tsc --noEmit',
},
```

### Step 2 — Generate `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src/**/*", "gwen.config.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### Step 3 — Generate `oxlint.json`

```json
{
  "$schema": "https://cdn.jsdelivr.net/npm/oxlint/configuration_schema.json",
  "rules": {
    "no-unused-vars": "warn",
    "no-explicit-any": "error",
    "eqeqeq": "error"
  },
  "ignorePatterns": ["dist/", "node_modules/"]
}
```

### Step 4 — Generate `.oxfmtrc.json`

```json
{
  "indentWidth": 2,
  "lineWidth": 100,
  "trailingComma": "all",
  "singleQuote": true,
  "semi": true
}
```

### Step 5 — Update `gwen.config.ts` template

Include `Canvas2DRenderer` and `InputPlugin` by default (they are bundled, no extra install needed if already a dependency):

```typescript
import { defineConfig } from '@gwenjs/app'
import { Canvas2DRenderer } from '@gwenjs/renderer-canvas2d'
import { InputPlugin } from '@gwenjs/input'

export default defineConfig({
  core: { maxEntities: 1_000, targetFPS: 60 },
  plugins: [
    new Canvas2DRenderer({ width: 800, height: 600 }),
    new InputPlugin(),
  ],
})
```

If user did not select `@gwenjs/renderer-canvas2d` or `@gwenjs/input`, fall back to bare `defineConfig({ modules: [] })`.

### Step 6 — Generate starter game files

All files are template strings in `init.ts` (or extracted to `src/commands/init/templates/`). No external template engine needed.

**`src/components/game.ts`**
```typescript
import { defineComponent } from '@gwenjs/core'

export const Position = defineComponent('Position', { x: 0, y: 0 })
export const Velocity = defineComponent('Velocity', { vx: 0, vy: 0 })
export const Ship = defineComponent('Ship', { lives: 3, score: 0, fireRate: 0.2, cooldown: 0 })
export const Asteroid = defineComponent('Asteroid', { radius: 20, rotationSpeed: 1 })
export const Bullet = defineComponent('Bullet', { lifetime: 2 })
export const Star = defineComponent('Star', { depth: 1, rotation: 0 })
```

**`src/systems/movement.ts`** — move entities by velocity, wrap around screen
**`src/systems/input.ts`** — read `useInput()` to steer ship, fire bullets
**`src/systems/collision.ts`** — detect bullet × asteroid AABB hits, increment score
**`src/systems/spawn.ts`** — spawn asteroids periodically from top of screen

**`src/scenes/game.ts`** — `defineScene` wiring all systems + `onRender` for Canvas2D

### Step 7 — Generate `README.md`

Quick-start guide:
```markdown
# <name>

A GWEN Engine game project.

## Getting started

\`\`\`bash
pnpm install
pnpm dev
\`\`\`

Open http://localhost:5173 — a mini Starfield Shooter will be running.

## Controls

- **Arrow keys / WASD** — move ship
- **Space** — fire

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server with hot-reload |
| `pnpm build` | Production build |
| `pnpm lint` | Run oxlint |
| `pnpm format` | Format with oxfmt |
| `pnpm typecheck` | TypeScript type check |
```

### Step 8 — Conditional rendering config

The starter game requires `@gwenjs/renderer-canvas2d` and `@gwenjs/input`. The init command must:

1. If user does NOT select these modules → add them automatically to the scaffolded `package.json` dependencies (they are small, always useful)
2. OR make the mini-game purely autonomous (own canvas via `document.createElement('canvas')`) without needing the renderer plugin — uses `onRender` + `useRawCanvas()` if available

**Decision: always include `@gwenjs/renderer-canvas2d` and `@gwenjs/input` as default deps.** They are core to any GWEN game. Document this clearly.

---

## Template Organization

Extract templates from `init.ts` into dedicated template files to avoid a 500-line init command:

```
packages/cli/src/commands/init/
├── index.ts               # Command definition + orchestration
├── prompts.ts             # Interactive prompts (name, modules)
├── templates/
│   ├── package-json.ts    # packageJson() factory
│   ├── tsconfig.ts        # tsconfigTemplate()
│   ├── oxlint.ts          # oxlintTemplate()
│   ├── oxfmt.ts           # oxfmtTemplate()
│   ├── gwen-config.ts     # gwenConfigTemplate(modules)
│   ├── readme.ts          # readmeTemplate(name)
│   └── game/
│       ├── components.ts  # componentsTemplate()
│       ├── systems.ts     # systemsTemplate()
│       └── scene.ts       # sceneTemplate()
```

---

## Tests

All tests go in `packages/cli/tests/init.test.ts`.

### Minimum test cases (≥ 10 tests)

| # | Test | What to verify |
|---|------|----------------|
| 1 | Scaffold with no modules | `package.json` has `vite ^8`, `typescript ^6`, `oxlint`, `oxfmt` |
| 2 | Scaffold with no modules | `tsconfig.json` exists, `moduleResolution: "bundler"`, `strict: true` |
| 3 | Scaffold with no modules | `oxlint.json` exists, has `no-explicit-any: "error"` |
| 4 | Scaffold with no modules | `.oxfmtrc.json` exists |
| 5 | Scaffold with no modules | `gwen.config.ts` has `Canvas2DRenderer` and `InputPlugin` |
| 6 | Scaffold with no modules | `src/scenes/game.ts` is non-empty, imports components and systems |
| 7 | Scaffold with no modules | `README.md` mentions `pnpm dev` and controls |
| 8 | Scaffold with `--modules @gwenjs/physics2d` | `gwen.config.ts` includes `@gwenjs/physics2d` |
| 9 | Scaffold with `--modules ""` (empty) | still generates all files without crash |
| 10 | `package.json` scripts | `lint`, `format`, `typecheck`, `format:check`, `lint:fix` all present |
| 11 | `src/components/game.ts` | all 6 components defined |
| 12 | Template TypeScript validity | generated files compile with `tsc --noEmit` |

### Test strategy

Use `tmp` directory in `os.tmpdir()` for each test. Tear down after. Avoid filesystem pollution.

```typescript
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rm, readFile, access } from 'node:fs/promises'
import { describe, it, expect, afterEach } from 'vitest'

const testDir = join(tmpdir(), `gwen-init-test-${Date.now()}`)
```

---

## Acceptance Criteria

- [ ] `gwen init my-game` (no flags) generates all listed files
- [ ] Generated `package.json` has `vite ^8`, `typescript ^6`, `oxlint`, `oxfmt`, all required scripts
- [ ] Generated `tsconfig.json` uses TypeScript 6 settings, strict mode, bundler moduleResolution
- [ ] Generated `oxlint.json` has `no-explicit-any: "error"`
- [ ] Generated `.oxfmtrc.json` exists and is valid JSON
- [ ] `README.md` is generated with project name, controls, and commands table
- [ ] `src/scenes/game.ts` contains a non-trivial starter game (not just empty exports)
- [ ] `src/components/game.ts` defines Position, Velocity, Ship, Asteroid, Bullet, Star
- [ ] `src/systems/` has at least movement, input, collision, spawn
- [ ] All generated `.ts` files typecheck with `tsc --noEmit` using the generated `tsconfig.json`
- [ ] All generated `.ts` files pass `oxlint src/` with zero errors
- [ ] ≥ 10 Vitest tests in `packages/cli/tests/init.test.ts`, all passing
- [ ] `pnpm lint` passes on the CLI package itself
- [ ] `pnpm typecheck` passes on the CLI package itself

---

## Notes

### Why always include renderer + input?
A game engine scaffold without a renderer is like a Nuxt app scaffold without Vue. These are first-class defaults. Users can remove them if they switch to a custom renderer.

### Landing game vs Nuxt landing page
Nuxt's `app.vue` renders a beautiful landing page by default. GWEN's `game.ts` runs a beautiful landing game. Same philosophy: **immediately useful, not blank**.

### Performance of starter game
The starter game must run at 60 FPS on mid-range hardware with 100 entities. All systems use ECS queries via `useQuery`. No N² algorithms (use spatial hashing or simple bucket if collision becomes expensive).

### Template versioning
Template files live in the CLI source, not in a separate npm package. They ship with the CLI binary. When the engine API changes, templates update in the same PR.
