# Plugin Hooks Guide

This guide explains how plugin authors can expose typed hook contracts that end users consume with full TypeScript support.

## Why plugin hooks?

Services are great for pull-style APIs (`api.services.get(...)`).
Hooks are useful for push-style events (`collision`, `beforeStep`, `afterStep`, etc.).

## 1) Declare hook types in your plugin

```ts
export interface Physics2DHooks {
  'physics:collision': (event: CollisionEvent) => void;
  'physics:beforeStep': (deltaTime: number) => void;
  'physics:afterStep': () => void;
}
```

## 2) Expose hook typing metadata

In your plugin class:

```ts
import type { GwenPlugin } from '@djodjonx/gwen-engine-core';

export class Physics2DPlugin
  implements GwenPlugin<'Physics2D', Physics2DServices, Physics2DHooks>
{
  readonly name = 'Physics2D' as const;
  readonly provides = { physics: {} as Physics2DManager };
  readonly providesHooks = {} as Physics2DHooks;
}
```

## 3) Emit hooks from plugin runtime

```ts
api.hooks.callHook('physics:beforeStep' as any, dt);
api.hooks.callHook('physics:afterStep' as any);
api.hooks.callHook('physics:collision' as any, event);
```

## 4) Consume hooks in app/game code

```ts
export const CollisionSystem = defineSystem({
  name: 'CollisionSystem',
  onInit(api) {
    api.hooks.hook('physics:collision' as any, (event) => {
      // typed event once metadata is resolved
    });
  },
});
```

## 5) Package metadata for discovery

When needed, expose metadata in your package so tooling can discover type contracts.

```json
{
  "name": "@djodjonx/gwen-plugin-physics2d",
  "gwenHooks": "./src/types.ts"
}
```

## Naming convention

Use namespaced hook ids:

- `physics:collision`
- `input:keyDown`
- `audio:play`

Avoid generic names like `event`, `init`, `update`.

## End-user DX

After `gwen prepare`, generated types augment global hook typing so users get auto-complete and static checks in systems and scenes.

## Related docs

- [API Overview](/api/overview)
- [Helpers](/api/helpers)
- [Creating Plugins](/plugins/creating)
