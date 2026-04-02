# Create A Custom Plugin

This guide shows both supported plugin styles:

- TypeScript-only plugin
- TypeScript plugin with WASM integration

## 1) TS-only Plugin

```ts
import { definePlugin } from '@gwenjs/kit'
import type { GwenEngine } from '@gwenjs/core'

interface CounterService {
  getFrames(): number
}

export const CounterPlugin = definePlugin(() => {
  let frames = 0

  return {
    name: '@acme/counter',

    setup(engine: GwenEngine) {
      const service: CounterService = { getFrames: () => frames }
      engine.provide('counter' as never, service)
    },

    onBeforeUpdate() {
      frames++
    },
  }
})
```

## 2) TS + WASM Plugin

Use this when heavy simulation or data processing should live in WASM.

```ts
import { definePlugin } from '@gwenjs/kit'
import { getWasmBridge } from '@gwenjs/core'

export const MyWasmPlugin = definePlugin(() => {
  return {
    name: '@acme/wasm-plugin',

    setup() {
      const bridge = getWasmBridge()
      const memory = bridge.getLinearMemory()
      if (!memory) {
        throw new Error('WASM memory is not available')
      }
    },
  }
})
```

## Plugin Metadata (Typed Service/Hook Contracts)

Declare metadata so `gwen prepare` can generate strict types:

```ts
import type { GwenPluginMeta } from '@gwenjs/kit'

export const pluginMeta: GwenPluginMeta = {
  serviceTypes: {
    counter: { from: '@acme/counter', exportName: 'CounterService' },
  },
  hookTypes: {
    'counter:tick': { from: '@acme/counter', exportName: 'CounterHooks' },
  },
}
```

Then attach it to the plugin object (`meta: pluginMeta`).

## Good Practices

- Keep plugin state local to the plugin instance (closure or private fields).
- Avoid global mutable state.
- Expose narrow service APIs.
- Keep per-frame allocations minimal.
- Validate options in `setup()` and fail early with clear errors.
