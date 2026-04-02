# CLI Overview

The `gwen` CLI is the primary development tool for GWEN projects. It wraps Vite and the GWEN build pipeline, exposing commands for dev, build, and type generation.

## Installation

The CLI is included automatically when you scaffold a new project:

```sh
pnpm create @gwenjs/create my-game
```

You can also add it manually to an existing project:

```sh
pnpm add -D @gwenjs/cli
```

After installation, the `gwen` binary is available via your `package.json` scripts:

```json
{
  "scripts": {
    "dev": "gwen dev",
    "build": "gwen build",
    "prepare": "gwen prepare"
  }
}
```

## The gwen binary

The `gwen` binary is a thin wrapper around Vite and the GWEN toolchain. It:

- Reads `gwen.config.ts` at the project root before running any command
- Sets up `SharedArrayBuffer` headers for dev and preview servers
- Coordinates WASM compilation and module loading alongside the Vite pipeline

## Commands summary

| Command | Description |
|---|---|
| `gwen dev` | Start the development server with WASM hot-reload |
| `gwen build` | Production build via Vite + Rollup/Rolldown with WASM optimization |
| `gwen preview` | Locally preview the production build |
| `gwen prepare` | Generate `.gwen/types/` service type declarations |

See [CLI Commands](./commands.md) for the full reference with options.

## Config file detection

By default, the CLI looks for `gwen.config.ts` in the project root (same directory as `package.json`). To use a different path:

```sh
gwen dev --config path/to/gwen.config.ts
```

::: warning
All commands require a `gwen.config.ts`. If the file is missing, the CLI will exit with an error.
:::
