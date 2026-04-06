---
name: gwen-community-plugin
description: Use when creating, scaffolding, or implementing a GWEN community plugin package — new plugin from scratch, adding a service, writing composables, or publishing to npm.
---

# GWEN Community Plugin Authoring

## Overview

A GWEN community plugin is a TypeScript package with **two usage modes**: module-first (Nuxt-like, zero config) and manual (explicit import). Both modes are supported from a single package with two entry points.

**Always start with the scaffold command — it generates all 9 files correctly.**

---

## Quick Start

```bash
# Inside any directory — generates <name>/ with all files ready
gwen scaffold package my-plugin

# With explicit GWEN version
gwen scaffold package my-plugin --gwen-version "^0.2.0"
```

Then implement logic in:
- `src/types.ts` — config & service interface
- `src/plugin.ts` — runtime logic

---

## File Structure (9 files)

```
@community/gwen-<name>/
├── package.json       — exports "." and "./module", minimal deps
├── tsconfig.json      — ES2022, bundler resolution, strict
├── vite.config.ts     — dual entry (index + module), externals
└── src/
    ├── types.ts       — <Name>Config, <Name>Service interfaces
    ├── augment.ts     — declare module '@gwenjs/core' { GwenProvides }
    ├── plugin.ts      — definePlugin() — runtime only
    ├── composables.ts — use<Name>() — calls engine.tryInject()
    ├── module.ts      — defineGwenModule() — build-time only
    └── index.ts       — re-exports plugin + composables + types
```

### Import graph (follow strictly — no exceptions)

```
          types.ts
         /   |   \
plugin.ts  augment.ts  composables.ts
    \                      /
     module.ts        index.ts
```

`module.ts` and `index.ts` are leaves. **They never import each other.**

---

## The Two Modes

```typescript
// Mode 1 — Module (automatic, zero config)
// gwen.config.ts
export default defineConfig({
  modules: ['@community/gwen-audio']
  // → plugin registered, useAudio() auto-imported everywhere, types generated
})

// Mode 2 — Manual (explicit)
// gwen.config.ts
import { AudioPlugin } from '@community/gwen-audio'
export default defineConfig({
  plugins: [AudioPlugin({ masterVolume: 0.8 })]
})
// In code:
import { useAudio } from '@community/gwen-audio'
```

---

## Each File's Job

### `src/types.ts`
Public types only. No imports from the project.
```typescript
export interface <Name>Config { /* user options */ }
export interface <Name>Service { /* public API methods */ }
```

### `src/augment.ts`
Declaration merging — makes `engine.inject('<name>')` typed automatically.
```typescript
import type { <Name>Service } from './types.js'
declare module '@gwenjs/core' {
  interface GwenProvides { <name>: <Name>Service }
}
export {}
```

### `src/plugin.ts`
Runtime logic. Imports from `types.ts` only — never from `index.ts`.
```typescript
import { definePlugin } from '@gwenjs/kit'
import type { GwenEngine } from '@gwenjs/core'
import type { <Name>Config, <Name>Service } from './types.js'

export const <Name>Plugin = definePlugin((config: <Name>Config = {}) => {
  let service: <Name>Service | null = null
  return {
    name: '@community/gwen-<name>',
    setup(engine: GwenEngine) {
      service = createService(config)
      engine.provide('<name>', service)
    },
    teardown() { service = null },
  }
})
```

### `src/composables.ts`
Imports `augment.ts` as side-effect for typed `engine.inject()` in manual mode.
```typescript
import { useEngine, GwenPluginNotFoundError } from '@gwenjs/core'
import type { <Name>Service } from './types.js'
import './augment.js'

export function use<Name>(): <Name>Service {
  const engine = useEngine()
  const s = engine.tryInject('<name>')
  if (s) return s
  throw new GwenPluginNotFoundError({
    pluginName: '@community/gwen-<name>',
    hint: "Add '@community/gwen-<name>' to modules in gwen.config.ts",
  })
}
```

### `src/module.ts`
Build-time only. Imports from `plugin.ts` directly — **never from `index.ts`**.
```typescript
import { defineGwenModule, definePluginTypes } from '@gwenjs/kit'
import type { <Name>Config } from './types.js'

export default defineGwenModule<<Name>Config>({
  meta: { name: '@community/gwen-<name>' },
  defaults: {},
  async setup(options, kit) {
    const { <Name>Plugin } = await import('./plugin.js')  // ← direct, not index
    kit.addPlugin(<Name>Plugin(options))
    kit.addAutoImports([{ name: 'use<Name>', from: '@community/gwen-<name>' }])
    kit.addTypeTemplate({
      filename: '<name>.d.ts',
      getContents: () => definePluginTypes({
        imports: ["import type { <Name>Service } from '@community/gwen-<name>'"],
        provides: { '<name>': '<Name>Service' },
      })
    })
  },
})
```

### `src/index.ts`
Manual-mode entry point. Imports `augment.ts` as side-effect. **Never re-exports `module.ts`.**
```typescript
import './augment.js'                                    // side-effect: types engine.inject()
export { <Name>Plugin } from './plugin.js'
export { use<Name> } from './composables.js'
export type { <Name>Config, <Name>Service } from './types.js'
// Do NOT re-export module.ts — circular dependency
```

---

## `package.json` — Critical Rules

```json
{
  "name": "@community/gwen-<name>",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".":        { "types": "./dist/index.d.ts",  "import": "./dist/index.js" },
    "./module": { "types": "./dist/module.d.ts", "import": "./dist/module.js" }
  },
  "dependencies": {
    "@gwenjs/core": "^0.x.x",
    "@gwenjs/kit":  "^0.x.x"
  },
  "devDependencies": {
    "typescript": "^6.0.0",
    "vite": "^8.0.0",
    "vite-plugin-dts": "^4.0.0",
    "vitest": "^4.0.0"
  }
}
```

**Scripts use `oxlint` and `oxfmt` — not eslint/prettier.**

```json
"scripts": {
  "build":     "vite build",
  "test":      "vitest run",
  "typecheck": "tsc --noEmit",
  "lint":      "oxlint src/",
  "format":    "oxfmt src/"
}
```

---

## Common Mistakes (from baseline testing)

| Wrong | Correct |
|-------|---------|
| `name: "gwen-particles"` | `name: "@community/gwen-particles"` |
| `peerDependencies: { gwen }` | `dependencies: { @gwenjs/core, @gwenjs/kit }` |
| Build with `tsup` | Build with `vite` + `vite-plugin-dts` |
| Lint with `eslint` | Lint with `oxlint` |
| Format with `prettier` | Format with `oxfmt` |
| Single entry point `"."` | Two entry points `"."` and `"./module"` |
| `module.ts` imports from `index.ts` | `module.ts` imports from `plugin.ts` directly |
| `index.ts` re-exports `module.ts` | `index.ts` never imports `module.ts` |
| No `augment.ts` | `augment.ts` required for typed `engine.inject()` |
| `require` + `default` exports | ESM only — `import` only in exports |
| Version `1.0.0` | Start at `0.1.0` |

---

## Spec Reference

Full canonical spec: `specs/plugin-package-architecture.md`
