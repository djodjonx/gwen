# Sprite Animation Plugin

Package: `@gwenjs/sprite-anim`

Animator-style spritesheet runtime for UI-driven rendering.

## Install

```bash
pnpm add @gwenjs/sprite-anim
```

## Register

```ts
import { defineConfig } from '@gwenjs/kit';
import { spriteAnim } from '@gwenjs/sprite-anim';

export default defineConfig({
  plugins: [
    spriteAnim({
      autoUpdate: true,
      fixedDelta: 1 / 60,
      maxSubSteps: 8,
    }),
  ],
});
```

## API

Main exports:
- `SpriteAnimPlugin(config?)`
- `spriteAnim(config?)`
- `createSpriteAnimSystem`

Service provided:
- `animator`

`SpriteAnimatorService` capabilities:
- attach/detach animation data per entity
- tick and draw
- play clips / set state
- set params and triggers
- pause/resume/stop
- getState and clear

Hooks emitted:
- `spriteAnim:frame`
- `spriteAnim:complete`
- `spriteAnim:transition`

## Example

```ts
const animator = api.services.get('animator');

animator.setParam(playerId, 'moving', isMoving);
if (didShoot) animator.setTrigger(playerId, 'shoot');

animator.draw(ctx, playerId, x, y, { pixelSnap: true });
```

## Source

- `packages/sprite-anim/src/index.ts`
- `packages/sprite-anim/src/types.ts`
