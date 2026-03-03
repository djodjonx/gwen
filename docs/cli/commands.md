# CLI Commands

GWEN uses two CLIs:

1. `create-gwen-app` for project scaffolding
2. `gwen` for development/build commands

## Scaffold

```bash
pnpm create gwen-app my-game
```

Alternatives:

```bash
npm create gwen-app my-game
npx create-gwen-app my-game
```

## `gwen` Commands

### `gwen prepare`
Generate `.gwen/` files.

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

### `gwen build`
Build project.

```bash
gwen build
gwen build --debug
gwen build --out-dir dist
gwen build --dry-run
```

### `gwen preview`
Preview production output.

```bash
gwen preview
```

### `gwen lint`
Run linting.

```bash
gwen lint
gwen lint --fix
```

### `gwen format`
Run formatter.

```bash
gwen format
gwen format --check
```

### `gwen info`
Print parsed config.

```bash
gwen info
```

## Notes

Supported global flags by command are implemented in `@gwen/cli`.
If in doubt, run:

```bash
gwen --help
```
