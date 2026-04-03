# create-gwen-app

> Scaffold a new [GWEN Engine](https://github.com/gwenjs/gwen) game project — no global CLI required.

`create-gwen-app` is a thin shim package that lets you bootstrap a fully working GWEN game project
with a single command. Internally it delegates every argument to `gwen init` from the bundled
`@gwenjs/cli` dependency, so you never have to install the CLI globally.

---

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | ≥ 20 |
| npm / pnpm / yarn | any recent version |

---

## Usage

Pick whichever package manager you prefer — the result is identical.

```bash
# npm  (always pin to @latest to get the newest scaffolding)
npm create gwen-app@latest my-game

# pnpm
pnpm create gwen-app my-game

# yarn
yarn create gwen-app my-game

# npx (equivalent, explicit binary name)
npx create-gwen-app my-game
```

If you omit the project name you will be prompted for one interactively (default: `my-game`).

---

## Interactive prompts

When run without flags `gwen init` asks two questions:

1. **Project name** — the directory that will be created (e.g. `my-game`).
2. **Optional modules** — a multi-select list of extra `@gwenjs/*` packages to add.

---

## CLI options

All arguments after the package name are forwarded verbatim to `gwen init`.

| Argument | Type | Description |
|---|---|---|
| `[name]` | positional | Project directory name. Prompted interactively if omitted. |
| `--modules`, `-m` | `string` | Comma-separated list of optional modules. Skips the interactive module prompt. |

### Examples

```bash
# Scaffold with a name, pick modules interactively
pnpm create gwen-app my-game

# Scaffold with a name and pre-select modules (no prompts)
pnpm create gwen-app my-game --modules @gwenjs/physics2d,@gwenjs/audio

# Scaffold with no extra modules (skip the prompt entirely)
pnpm create gwen-app my-game --modules ""
```

---

## Optional modules

`@gwenjs/renderer-canvas2d` and `@gwenjs/input` are **always included** — they power the starter
Starfield Shooter game and are required for the project to run out of the box.

The following modules can be added via `--modules` or the interactive prompt:

| Package | Description |
|---|---|
| `@gwenjs/physics2d` | Rapier-based 2D physics |
| `@gwenjs/physics3d` | Rapier-based 3D physics |
| `@gwenjs/audio` | Web Audio API integration |
| `@gwenjs/r3f` | React Three Fiber renderer adapter |
| `@gwenjs/debug` | Performance HUD and inspector |

---

## Generated project structure

Running `pnpm create gwen-app my-game` creates the following files inside `my-game/`:

```
my-game/
├── package.json                  # Vite 8 · TypeScript 6 · oxlint · oxfmt · all scripts
├── tsconfig.json                 # strict mode, bundler moduleResolution
├── oxlint.json                   # no-explicit-any: error
├── .oxfmtrc.json                 # indent 2, lineWidth 100, singleQuote
├── gwen.config.ts                # Canvas2DRenderer + InputPlugin (+ selected modules)
├── README.md                     # Quick-start guide with controls and commands
└── src/
    ├── components/
    │   └── game.ts               # ECS component definitions (Position, Velocity, …)
    ├── systems/
    │   ├── movement.ts           # Advances entities with Position + Velocity
    │   ├── input.ts              # Keyboard → player ship movement and firing
    │   ├── collision.ts          # AABB bullet × asteroid hit detection
    │   ├── spawn.ts              # Periodically spawns asteroids from the top
    │   └── render.ts             # Canvas2D render pass (stars, bullets, ship, HUD)
    └── scenes/
        └── game.ts               # Scene that wires all systems together
```

### Key generated files

#### `gwen.config.ts`

The engine config is ready to run immediately:

```ts
import { defineConfig } from '@gwenjs/app'
import { Canvas2DRenderer } from '@gwenjs/renderer-canvas2d'
import { InputPlugin } from '@gwenjs/input'

export default defineConfig({
  engine: { maxEntities: 2_000, targetFPS: 60 },
  modules: [],
  plugins: [
    Canvas2DRenderer({ width: 800, height: 600, background: '#0a0a1a' }),
    InputPlugin(),
  ],
})
```

Selected optional modules are appended to the `modules` array automatically.

#### `package.json` scripts

| Script | Command | Description |
|---|---|---|
| `dev` | `gwen dev` | Start the development server (http://localhost:5173) |
| `build` | `gwen build` | Production build |
| `postinstall` | `gwen prepare` | One-time post-install setup (runs automatically) |
| `lint` | `oxlint src/` | Lint source files |
| `lint:fix` | `oxlint --fix src/` | Auto-fix lint issues |
| `format` | `oxfmt src/` | Format source files |
| `format:check` | `oxfmt --check src/` | Check formatting without writing |
| `typecheck` | `tsc --noEmit` | TypeScript type check |

---

## Next steps after scaffolding

```bash
cd my-game
pnpm install     # installs dependencies and runs gwen prepare
pnpm dev         # open http://localhost:5173
```

You will see the **Starfield Shooter** landing game — a playable mini-game built with the
scaffolded ECS components and systems.

| Key | Action |
|---|---|
| Arrow keys / WASD | Move the ship |
| Space | Fire |

---

## How it works

`create-gwen-app` resolves the `gwen` binary from its bundled `@gwenjs/cli` peer dependency and
calls `gwen init <name> [args…]` via `spawnSync`. This means:

- No global `gwen` install is needed.
- The version of the CLI used for scaffolding is always the one pinned in this package's
  `dependencies`, keeping scaffolded projects consistent across machines.

---

## See also

- [`@gwenjs/cli`](../cli/README.md) — full CLI reference (`gwen dev`, `gwen build`, `gwen add`, …)
- [GWEN Engine documentation](https://gwen.dev/docs)
