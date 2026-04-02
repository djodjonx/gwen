# Create A Custom Module

A GWEN module is a build-time unit that configures your project in module-first mode.

Modules run in Node.js during:

- `gwen dev`
- `gwen build`
- `gwen prepare`

## Basic Module

```ts
import { defineGwenModule } from '@gwenjs/kit'
import { CounterPlugin } from './plugin'

interface CounterModuleOptions {
  enabled?: boolean
}

export default defineGwenModule<CounterModuleOptions>({
  meta: { name: '@acme/counter-module', configKey: 'counter' },
  defaults: { enabled: true },

  setup(options, kit) {
    if (!options.enabled) {
      return
    }

    kit.addPlugin(CounterPlugin())
    kit.addAutoImports([{ name: 'useCounter', from: '@acme/counter-module' }])
  },
})
```

## Register In `gwen.config.ts`

```ts
import { defineConfig } from '@gwenjs/app'
import counter from '@acme/counter-module/module'

export default defineConfig({
  modules: [counter()],
})
```

## Build-time Hook Usage

```ts
kit.hook('build:before', () => {
  // read files, validate setup, generate artifacts, etc.
})
```

## Type Templates

Generate declaration files in `.gwen/types`:

```ts
kit.addTypeTemplate({
  filename: 'counter.d.ts',
  getContents: () => `declare module '@gwenjs/core' { interface GwenProvides { counter: CounterService } }`,
})
```
