# GWEN — Copilot Instructions

GWEN is a hybrid Rust/WASM + TypeScript 2D/3D web game engine. The Rust core (ECS, physics, math) is pre-compiled to WASM and shipped in npm packages — game developers never write Rust. TypeScript is used for all game logic, plugins, rendering, and tooling.

## Commands

```bash
# Install everything (JS + Rust WASM target)
pnpm install && rustup target add wasm32-unknown-unknown

# Build: Rust → WASM first, then all TS packages
pnpm build                  # full build
pnpm build:wasm             # Rust → WASM only
pnpm build:ts               # TS packages only

# Tests
pnpm test                   # all (Rust + TS)
pnpm test:ts                # TS packages only
pnpm test:cargo             # Rust only

# Run tests for a single TS package
pnpm --filter @gwenjs/core test

# Run a single Vitest test file
pnpm --filter @gwenjs/core exec vitest run tests/ecs.test.ts

# Run Rust tests for a single crate
cargo test -p gwen-core

# Lint / format (oxlint + oxfmt)
pnpm lint
pnpm lint:fix
pnpm format
pnpm format:check
pnpm typecheck

# Dev (WASM hot-reload + all packages)
pnpm dev
```

## Repository Structure

```
crates/
  gwen-core/          # Rust: ECS, physics2D/3D, game loop, WASM exports
  gwen-wasm-utils/    # Rust: shared ring buffers, debug helpers
packages/
  core/               # @gwenjs/core — engine runtime, createEngine(), ECS API, WASM bridge
  schema/             # @gwenjs/schema — config schema & validation (SSOT)
  cli/                # @gwenjs/cli — `gwen` CLI (dev server, prepare, build)
  vite/               # @gwenjs/vite — Vite plugin (WASM hot-reload, manifest)
  physics2d/          # @gwenjs/physics2d — 2D physics adapter (wraps gwen-core WASM)
  physics3d/          # @gwenjs/physics3d — 3D physics adapter
  renderer-canvas2d/  # @gwenjs/renderer-canvas2d — Canvas2D renderer plugin
  input/              # @gwenjs/input — keyboard/gamepad plugin
  audio/              # @gwenjs/audio — Web Audio plugin
  ui/                 # @gwenjs/ui — HTML/CSS UI overlay plugin
  kit/                # @gwenjs/kit — shared game-kit helpers
  kit-platformer/     # @gwenjs/kit-platformer — platformer game kit
  sprite-anim/        # @gwenjs/sprite-anim — sprite animation plugin
  math/               # @gwenjs/math — Vec2/Vec3/Mat4 utilities
  debug/              # @gwenjs/debug — debug overlay plugin
  r3f/                # @gwenjs/r3f — React Three Fiber integration
  create/             # @gwenjs/create — project scaffolding (`create-gwen-app`)
  app/                # @gwenjs/app — app-level helpers
playground/           # Example games (space-shooter, snake-html, mario-css, platformer-kit-css)
specs/                # RFCs and architecture decisions
```

## Architecture

### WASM + SharedArrayBuffer (zero-copy)

`gwen-core.wasm` and plugin WASM modules (e.g., `physics2d.wasm`) are **separate binaries** that share a `SharedArrayBuffer` as linear memory. This avoids both a monolithic WASM build (which would require Rust on the user's machine) and JS-land copying. The overhead is < 0.01ms/frame for 1000 entities.

### Plugin System

Plugins implement `GwenPlugin` and are registered with `engine.use(plugin)`. The engine context (`engineContext`, backed by `unctx`) is active during all 8 frame phases and plugin `setup()` calls, enabling composables.

### Composable Systems (RFC-005)

Systems use a composable pattern — composables are resolved once during a synchronous `setup()` phase, then used in registered callbacks. **`unctx` sync mode does not support nested `call()` with different engine instances.**

```typescript
export const playerSystem = defineSystem(() => {
  const input = useInput()           // resolved once at setup
  const entities = useQuery([Position, PlayerTag])

  onUpdate((dt) => {
    for (const e of entities) { ... }
  })
})
```

### 8-Phase Frame Loop

Each frame runs: `onBeforeUpdate` → `onUpdate` → `onAfterUpdate` → `onRender` → (+ WASM step phases). All are accessible via composables inside `defineSystem`.

### Config Entry Point

User projects define a `gwen.config.ts` at the root. The CLI reads this as the composition root:

```typescript
export default defineConfig({
  core: { maxEntities: 10_000, targetFPS: 60 },
  wasm: [physics2D({ gravity: 9.81 })],
  plugins: [new InputPlugin(), new Canvas2DRenderer({ width: 800, height: 600 })],
});
```

## Key Conventions

### Package naming

All published packages use the `@gwenjs/*` scope (not `@gwenjs/*` — that scope appears in older docs but the actual packages use `@gwenengine`).

### TypeScript packages use `src/index.ts` as the live entry point during development

The `main`/`types`/`exports` fields in `package.json` point to `./src/index.ts` directly (not `dist/`) for intra-monorepo imports. Built output goes to `dist/`.

### Testing

- TS packages use **Vitest** with config at `vitest.config.ts` in each package
- Rust crates use standard `cargo test`; integration tests live in `crates/*/tests/`
- Type-level tests use `.type-test.ts` suffix (e.g., `global-types.type-test.ts`)

### Linting & Formatting

- **oxlint** (`oxlint.json` at root) for JS/TS linting
- **oxfmt** for formatting
- Pre-commit hooks (Husky + lint-staged) auto-fix staged files

### Commit messages

Conventional Commits required (`feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`, `build`). Format: `type(scope): description`. Enforced by commit-msg hook.

### Service types — never cast manually

After running `gwen prepare` (or `pnpm dev`), service types are auto-generated into `GwenDefaultServices`. Never write `api.services.get('physics') as Physics2DAPI` — always let the generated types flow through.

### Prefabs over manual entity creation

For complex entities, always define a `definePrefab(...)` and use `api.instantiate(prefab)` rather than calling `createEntity` + individual `setComponent` calls.

### WASM module handles (RFC-008)

Community WASM plugins load via `engine.loadWasmModule({ name, url, memory?, channels?, step? })`. Per-frame logic goes in the `step` callback. Named memory regions use `handle.region(name)` and ring-buffer channels use `handle.channel(name)`.

### RFCs

Architecture decisions and implementation contracts live in `specs/`. `ARCHITECTURE.md` provides the overview; the playbook in `specs/rfc-v3/IMPLEMENTATION_PLAYBOOK_V2.md` (when present) governs execution order and frozen decisions.
