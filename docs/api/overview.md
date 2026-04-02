# API Overview

This page helps you choose the right GWEN API surface quickly.

## Core helper APIs (`define*`)

Use these to declare your game architecture:

- `defineComponent`
- `defineSystem`
- `defineScene`
- `definePrefab`
- `defineUI`
- `defineConfig`

See [Helpers](/api/helpers).

## Runtime Engine API (`api`)

Inside systems/scenes/ui/prefabs, you work with `api`:

- entity lifecycle (`createEntity`, `destroyEntity`)
- components (`addComponent`, `getComponent`, `query`)
- plugins/services (`api.services.get('...')`)
- scenes (`api.scene?.load(...)`)

See [Engine API](/api/engine-api).

## Types and typing model

GWEN ships strongly typed definitions across helpers and runtime.

- schema types (`Types.f32`, `Types.i32`, etc.)
- helper inference (`InferComponent`)
- generated global types after `gwen prepare`

See [Types](/api/types).

## Plugin extension surfaces

Plugins can expose:

- services (consumed with `api.services.get(...)`)
- hook contracts
- UI/prefab/scene extension typing metadata

See [Plugin Hooks Guide](/PLUGIN_HOOKS_GUIDE) and [Plugins](/plugins/creating).

## Typical end-user flow

1. Scaffold with `pnpm create @gwenjs/create my-game`
2. Configure modules in `gwen.config.ts`
3. Build gameplay with `defineComponent` + `defineSystem`
4. Compose in scenes/prefabs/UI
5. Run `pnpm dev` / `pnpm build`

