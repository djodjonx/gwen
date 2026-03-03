# CLI Guide

GWEN has two user-facing CLIs:

1. **Project scaffolding**: `create-gwen-app`
2. **Project runtime/build**: `gwen`

## Scaffold a new project

Use the scaffold CLI:

```bash
pnpm create gwen-app my-game
cd my-game
pnpm install
pnpm dev
```

Equivalent commands:

```bash
npm create gwen-app my-game
npx create-gwen-app my-game
```

Notes:
- Project name is optional; if omitted, the CLI asks interactively.
- The scaffold currently ships a default template.
- Advanced template flags are not exposed yet.

## Runtime CLI (`gwen`)

Available commands:

```bash
gwen prepare
gwen dev
gwen build
gwen preview
gwen lint
gwen format
gwen info
```

### `gwen prepare`
Generate `.gwen/` artifacts (types + tsconfig helpers).

```bash
gwen prepare
gwen prepare --verbose
```

### `gwen dev`
Start development server.

```bash
gwen dev
gwen dev --port 3000
gwen dev --open
gwen dev --verbose
```

Supported flags:
- `--port <n>`
- `--open`
- `--verbose`

### `gwen build`
Build production output.

```bash
gwen build
gwen build --debug
gwen build --out-dir dist
gwen build --dry-run
gwen build --verbose
```

Supported flags:
- `--debug`
- `--out-dir <path>`
- `--dry-run`
- `--verbose`

### `gwen preview`
Preview production build.

```bash
gwen preview
```

### `gwen lint`
Run oxlint on source files.

```bash
gwen lint
gwen lint --fix
```

Supported flag:
- `--fix`

### `gwen format`
Run oxfmt.

```bash
gwen format
gwen format --check
```

Supported flag:
- `--check`

### `gwen info`
Print parsed `gwen.config.ts`.

```bash
gwen info
```

## Recommended flow

```bash
pnpm create gwen-app my-game
cd my-game
pnpm install
gwen dev
```

Then iterate with scenes/systems/components.

## See also

- [Quick Start](/guide/quick-start)
- [Project Structure](/guide/project-structure)
- [CLI Commands](/cli/commands)
