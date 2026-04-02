# Getting Started

This page is for **end users building games with GWEN**.

If you are looking for monorepo contributor setup, use repository contributor docs instead.

## Prerequisites

- Node.js 18+
- pnpm (recommended)

## Create an app

```bash
pnpm create @gwenjs/create my-game
cd my-game
pnpm install
```

## Run in development

```bash
pnpm dev
```

`pnpm dev` runs `gwen prepare` and generates typed services for your project.

Use inferred services directly:

```ts
const physics = api.services.get('physics');
```

Avoid manual casts like `as Physics2DAPI` in app/playground code.

## Build and preview

```bash
pnpm build
pnpm preview
```

## First files to open

- `gwen.config.ts` - module-first framework configuration
- `src/scenes/` - scene lifecycle and flow
- `src/systems/` - gameplay rules
- `src/components/` - game data
- `src/ui/` - rendering layer

## Common package references

Official ecosystem packages are under `@gwenjs`:

- `@gwenjs/core`
- `@gwenjs/app`
- `@gwenjs/kit`
- `@gwenjs/cli`
- `@gwenjs/create`

## Next steps

- [Quick Start](/guide/quick-start)
- [Project Structure](/guide/project-structure)
- [API Overview](/api/overview)
- [CLI Commands](/cli/commands)
