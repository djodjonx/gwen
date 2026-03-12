# CLI Guide

GWEN has two user-facing command-line tools:

1. **Scaffold CLI**: `@djodjonx/create-gwen-app`
2. **Project CLI**: `gwen` (from `@djodjonx/gwen-cli`)

## Scaffold a new project

```bash
npx @djodjonx/create-gwen-app my-game
cd my-game
pnpm install
pnpm dev
```

## Daily workflow

```bash
gwen prepare
gwen dev
gwen build
gwen preview
gwen lint
gwen format
gwen info
```

## Why `gwen prepare` matters

`gwen prepare` generates `.gwen/` type artifacts and metadata used by the runtime and IDE tooling.

In practice:

- `gwen dev` and `gwen build` run prepare-related steps automatically.
- You can still run `gwen prepare` explicitly when debugging type generation.

## Common command examples

### Development

```bash
gwen dev --port 3000 --open
```

### Production build

```bash
gwen build --out-dir dist
```

### Preview build

```bash
gwen preview --preview-port 5000
```

### Lint and format

```bash
gwen lint --fix
gwen format --check
```

## Package scope reference

All official packages are on the `@djodjonx` scope, including:

- `@djodjonx/create-gwen-app`
- `@djodjonx/gwen-cli`
- `@djodjonx/gwen-engine-core`
- `@djodjonx/gwen-kit`

## See also

- [CLI Commands](/cli/commands)
- [Quick Start](/guide/quick-start)
- [Project Structure](/guide/project-structure)
