# Sprite Animation Plugin

**Package:** `@gwenjs/sprite-anim`
**Service key:** `spriteAnim` (`SpriteAnimService`)

Frame-by-frame sprite sheet animation. Define named clips with a frame range and frame rate, then drive them per-entity with a single method call. Designed to work alongside [`@gwenjs/renderer-canvas2d`](/plugins/renderer-canvas2d), which reads the current frame from `SpriteAnimComponent` automatically.

## Install

```bash
gwen add @gwenjs/sprite-anim
```

## Register

```typescript
// gwen.config.ts
import { defineConfig } from '@gwenjs/app';

export default defineConfig({
  modules: [['@gwenjs/renderer-canvas2d', { width: 800, height: 600 }], '@gwenjs/sprite-anim'],
});
```

::: tip Order matters
Register `@gwenjs/renderer-canvas2d` before `@gwenjs/sprite-anim` so the renderer's `onRender` hook runs after animations have advanced the current frame.
:::

## Service API

### Defining clips

Clips are defined when you set up a `SpriteAnimComponent` on an entity, or registered globally as reusable clip libraries:

```typescript
spriteAnim.defineClip('run', {
  sheet: 'player', // sprite sheet id (matched to SpriteComponent.sheet)
  startFrame: 0,
  endFrame: 7,
  fps: 12,
  loop: true,
});

spriteAnim.defineClip('jump', {
  sheet: 'player',
  startFrame: 8,
  endFrame: 11,
  fps: 10,
  loop: false,
});
```

### Playback

| Method                                      | Description                                                                            |
| ------------------------------------------- | -------------------------------------------------------------------------------------- |
| `spriteAnim.play(entityId, clipName)`       | Start playing a clip on the entity. Resets if already on a different clip.             |
| `spriteAnim.stop(entityId)`                 | Stop animation and reset to frame 0 of the current clip.                               |
| `spriteAnim.pause(entityId)`                | Freeze on the current frame.                                                           |
| `spriteAnim.resume(entityId)`               | Continue a paused animation.                                                           |
| `spriteAnim.setSpeed(entityId, multiplier)` | Scale playback speed (default `1.0`).                                                  |
| `spriteAnim.isPlaying(entityId, clipName?)` | Returns `true` if the entity has an active animation (optionally for a specific clip). |
| `spriteAnim.onFinish(entityId, cb)`         | Register a one-shot callback for when a non-looping clip ends.                         |

### `SpriteAnimClip` shape

```typescript
interface SpriteAnimClip {
  sheet: string; // sprite sheet identifier
  startFrame: number;
  endFrame: number;
  fps: number;
  loop?: boolean; // default true
}
```

## Options

`SpriteAnimPlugin` takes no constructor options. Clips are defined programmatically at runtime.

## Example

```typescript
import { defineSystem, useService, onUpdate } from '@gwenjs/core';
import { useQuery } from '@gwenjs/core';
import { Position, PlayerState } from '../components';

export const playerAnimSystem = defineSystem(() => {
  const spriteAnim = useService('spriteAnim');
  const inputMapper = useService('inputMapper');
  const entities = useQuery([Position, PlayerState]);

  // Register clips once at setup time
  spriteAnim.defineClip('idle', { sheet: 'hero', startFrame: 0, endFrame: 3, fps: 6, loop: true });
  spriteAnim.defineClip('run', { sheet: 'hero', startFrame: 4, endFrame: 11, fps: 12, loop: true });
  spriteAnim.defineClip('jump', {
    sheet: 'hero',
    startFrame: 12,
    endFrame: 15,
    fps: 10,
    loop: false,
  });
  spriteAnim.defineClip('land', {
    sheet: 'hero',
    startFrame: 16,
    endFrame: 18,
    fps: 8,
    loop: false,
  });

  onUpdate(() => {
    for (const entity of entities) {
      const state = entity.get(PlayerState);

      if (state.isJumping && !spriteAnim.isPlaying(entity.id, 'jump')) {
        spriteAnim.play(entity.id, 'jump');
        spriteAnim.onFinish(entity.id, () => spriteAnim.play(entity.id, 'idle'));
      } else if (inputMapper.isDown('left') || inputMapper.isDown('right')) {
        spriteAnim.play(entity.id, 'run');
      } else if (!state.isJumping) {
        spriteAnim.play(entity.id, 'idle');
      }
    }
  });
});
```

## Related

- [Canvas2D Renderer](/plugins/renderer-canvas2d) — renders the animated frames
- [Input Plugin](/plugins/input) — drive animations from player input
- [Kit: Platformer](/examples/patterns) — includes ready-made animation state machines
