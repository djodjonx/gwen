# Systems - gwen-plugin-sprite-anim

## `createSpriteAnimSystem(options?)`

Composable system that calls `animator.tick()`.

Options:

- `serviceName?: string` (default: `animator`)
- `fixedDelta?: number`
- `maxSubSteps?: number`

Example:

```ts
import { createSpriteAnimSystem } from '@gwenengine/gwen-plugin-sprite-anim';

const SpriteAnimSystem = createSpriteAnimSystem({
  fixedDelta: 1 / 60,
  maxSubSteps: 8,
});
```

Use this when plugin `autoUpdate` is set to `false` and you want explicit system ordering.
