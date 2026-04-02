# Kit Helpers API

Core helpers exported by `@gwenjs/kit`.

## `definePlugin(factory)`

Creates a typed plugin factory.

```ts
import { definePlugin } from '@gwenjs/kit'

export const MyPlugin = definePlugin(() => ({
  name: '@acme/my-plugin',
  setup() {},
}))
```

## `defineGwenModule(definition)`

Creates a typed build-time module for module-first projects.

```ts
import { defineGwenModule } from '@gwenjs/kit'
```

## `definePluginTypes(options)`

Generates declaration-merging snippets for services/hooks.
Useful when adding type templates.

```ts
import { definePluginTypes } from '@gwenjs/kit'
```

## `satisfiesPluginContract(plugin)`

Asserts plugin contract at compile time.

```ts
import { satisfiesPluginContract } from '@gwenjs/kit'
```

## Types You Will Use Often

- `GwenPlugin`
- `GwenEngine`
- `GwenPluginMeta`
- `GwenModule`
- `GwenKit`
- `AutoImport`
- `GwenTypeTemplate`

All are exported from `@gwenjs/kit`.
