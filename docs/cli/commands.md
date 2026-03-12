# CLI Commands

GWEN exposes two end-user CLI entry points:

1. **Scaffold CLI**: `@djodjonx/create-gwen-app`
2. **Project CLI**: `gwen` (provided by `@djodjonx/gwen-cli`)

## Scaffold a project

```bash
npx @djodjonx/create-gwen-app my-game
cd my-game
pnpm install
pnpm dev
```

## `gwen` commands

### `gwen prepare`

Generate `.gwen/` artifacts (types + helper metadata).

```bash
gwen prepare
gwen prepare --verbose
```

### `gwen dev`

Run development server.

```bash
gwen dev
gwen dev --port 3000
gwen dev --open
gwen dev --verbose
```

Flags:
- `--port <n>` (dev server)
- `--open`
- `--verbose`

### `gwen build`

Build production output.

```bash
gwen build
gwen build --out-dir dist
gwen build --debug
gwen build --dry-run
gwen build --verbose
```

### `gwen preview`

Preview production build.

```bash
gwen build
gwen preview
gwen preview --preview-port 5000
```

Flags:
- `--preview-port <n>`
- `--port <n>` (legacy fallback)

Preview prints the resolved listening URL:

```text
[gwen] Preview server listening on http://localhost:4173/
```

### `gwen lint`

Run linting.

```bash
gwen lint
gwen lint --fix
```

### `gwen format`

Run formatting.

```bash
gwen format
gwen format --check
```

### `gwen info`

Print resolved `gwen.config.ts` information.

```bash
gwen info
```

## Help

```bash
gwen --help
```

## Related pages

- [Quick Start](/guide/quick-start)
- [CLI Guide](/CLI)
