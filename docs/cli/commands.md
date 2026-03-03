# CLI Commands

GWEN's CLI helps you scaffold, develop, and build games.

## Available Commands

### create

Scaffold a new game project:

```bash
pnpm create @gwen/app my-game
```

Options:
- `--template <name>` - Use a specific template (default: `default`)
- `--no-install` - Skip dependency installation

### dev

Start the development server:

```bash
gwen dev
```

Options:
- `--port <number>` - Port to run on (default: 3000)
- `--open` - Open browser automatically
- `--verbose` - Detailed logging

### build

Build for production:

```bash
gwen build
```

Output goes to `dist/`

### prepare

Generate type definitions and runtime files:

```bash
gwen prepare
```

Usually runs automatically with `gwen dev`.

### lint

Check code quality:

```bash
gwen lint
```

Auto-fix:

```bash
gwen lint --fix
```

### format

Format code:

```bash
gwen format --check  # Check only
gwen format --write  # Auto-format
```

## Next Steps

- [Quick Start](/guide/quick-start) - Create your first game

