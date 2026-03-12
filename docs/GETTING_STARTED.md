# Getting Started

This page is for **end users building games with GWEN**.

If you are looking for monorepo contributor setup, use repository contributor docs instead.

## Prerequisites

- Node.js 18+
- pnpm (recommended)

## Create an app

```bash
npx @djodjonx/create-gwen-app my-game
cd my-game
pnpm install
```

## Run in development

```bash
pnpm dev
```

## Build and preview

```bash
pnpm build
pnpm preview
```

## First files to open

- `gwen.config.ts` - engine + plugin configuration
- `src/scenes/` - scene lifecycle and flow
- `src/systems/` - gameplay rules
- `src/components/` - game data
- `src/ui/` - rendering layer

## Common package references

Official ecosystem packages are under `@djodjonx`:

- `@djodjonx/gwen-engine-core`
- `@djodjonx/gwen-kit`
- `@djodjonx/gwen-cli`
- `@djodjonx/create-gwen-app`
- `@djodjonx/gwen-plugin-*`

## Next steps

- [Quick Start](/guide/quick-start)
- [Project Structure](/guide/project-structure)
- [API Overview](/api/overview)
- [CLI Commands](/cli/commands)
