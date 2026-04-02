# Kit Overview

`@gwenjs/kit` is the authoring toolkit for GWEN extensions.

Use the Kit when you want to:

- create a runtime plugin (TS-only or TS + WASM)
- create a framework module (`modules: []` in `gwen.config.ts`)
- expose typed services/hooks to app code
- generate typed declarations during `gwen prepare`

## What Is Runtime vs Build-time?

- Runtime plugin: runs in the browser/game loop (`setup`, `onUpdate`, `teardown`, etc.).
- Build-time module: runs in Node.js during `gwen dev`, `gwen build`, `gwen prepare` and registers plugins/types/auto-imports.

In module-first projects, a module is the composition root and installs one or more runtime plugins.

## Quick Example

```ts
import { defineGwenModule } from '@gwenjs/kit'
import { MyPlugin } from './plugin'

export default defineGwenModule({
  meta: { name: '@acme/gwen-my-module' },
  setup(_options, kit) {
    kit.addPlugin(MyPlugin())
  },
})
```

## In This Section

- [Create a Custom Plugin](/kit/custom-plugin)
- [Create a Custom Module](/kit/custom-module)
- [Kit Helpers API](/kit/helpers-api)
