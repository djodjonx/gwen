# Vite Plugin

Package: `@gwenjs/vite`

Vite integration for GWEN projects: WASM handling, scene scanning, and manifest injection.

## Install

```bash
pnpm add -D @gwenjs/vite vite
```

## Register

```ts
import { defineConfig } from 'vite';
import { gwen } from '@gwenjs/vite';

export default defineConfig({
  plugins: [
    gwen({
      watch: true,
      wasmMode: 'debug',
      verbose: false,
    }),
  ],
});
```

## API

Main export:
- `gwen(options?)`

`GwenPluginOptions` (key fields):
- `variant?: 'light' | 'physics2d' | 'physics3d'`
- `cratePath?: string`
- `wasmPublicPath?: string`
- `watch?: boolean`
- `wasmMode?: 'release' | 'debug'`
- `manifestPath?: string`
- `verbose?: boolean`

Features:
- WASM hot reload in dev
- scene scanning from `src/scenes`
- virtual modules for bootstrapping
- manifest injection in build/runtime

## Example

```ts
const plugin = gwen({
  variant: 'physics2d',
  wasmPublicPath: '/wasm',
  watch: true,
});
```

## Source

- `packages/vite/src/index.ts`
