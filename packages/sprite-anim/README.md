# @gwenengine/gwen-plugin-sprite-anim

Official GWEN plugin for spritesheet animation with an Animator-like state machine.

## Installation

```bash
pnpm add @gwenengine/gwen-plugin-sprite-anim
```

## Registration

```ts
import { defineConfig } from '@gwenengine/kit';
import { SpriteAnimPlugin } from '@gwenengine/gwen-plugin-sprite-anim';

export default defineConfig({
  plugins: [
    new SpriteAnimPlugin({
      autoUpdate: true,
      fixedDelta: 1 / 60,
      maxSubSteps: 8,
      maxFrameAdvancesPerEntity: 16,
    }),
  ],
});
```

## Target DX

- Keep using `defineUI`.
- Declare `extensions.spriteAnim` for atlas, clips, controller, and transitions.
- Render through `api.services.get('animator').draw(...)`.
- Drive logic from systems (`setParam`, `setTrigger`, `setState`, `play`).

## V3 UI example

```ts
import { defineUI } from '@gwenengine/core';

export const PlayerUI = defineUI({
  name: 'PlayerUI',
  extensions: {
    spriteAnim: {
      atlas: '/sprites/player.png',
      frame: { width: 32, height: 32, columns: 8 },
      clips: {
        idle: { row: 0, from: 0, to: 3, fps: 8, loop: true },
        run: { row: 1, from: 0, to: 5, fps: 12, loop: true },
        shoot: { row: 2, from: 0, to: 2, fps: 16, loop: false, next: 'idle' },
      },
      controller: {
        initial: 'idle',
        parameters: {
          moving: { type: 'bool', default: false },
          shoot: { type: 'trigger' },
        },
        states: {
          idle: { clip: 'idle' },
          run: { clip: 'run' },
          shoot: { clip: 'shoot' },
        },
        transitions: [
          { from: 'idle', to: 'run', conditions: [{ param: 'moving', op: '==', value: true }] },
          { from: 'run', to: 'idle', conditions: [{ param: 'moving', op: '==', value: false }] },
          { from: '*', to: 'shoot', priority: 1, conditions: [{ param: 'shoot' }] },
          { from: 'shoot', to: 'idle', hasExitTime: true, exitTime: 0.95 },
        ],
      },
    },
  },

  render(api, entityId) {
    const r = api.services.get('renderer');
    const p = api.getComponent(entityId, 'position') as { x: number; y: number } | null;
    if (!p) return;

    api.services.get('animator').draw(r.ctx, entityId, p.x, p.y, {
      pixelSnap: true,
      cullRect: { x: 0, y: 0, width: r.logicalWidth, height: r.logicalHeight },
    });
  },
});
```

## Gameplay system example

```ts
const animator = api.services.get('animator');

animator.setParam(playerId, 'moving', isMoving);
if (didShoot) animator.setTrigger(playerId, 'shoot');
```

## Exposed hooks

- `spriteAnim:frame` - frame update event
- `spriteAnim:complete` - clip completed event
- `spriteAnim:transition` - controller state transition event

## Runtime benchmarks

The package includes reproducible benchmarks for the `tick()` hot path.

```bash
pnpm --filter @gwenengine/gwen-plugin-sprite-anim bench
```

Measured scenarios:

- `clip-only x2k entities (120 frames)`
- `controller x2k entities + param churn (120 frames)`
- `controller x10k entities (60 frames)`
- `attach/detach churn x2k entities (pooling)`

Quick interpretation:

- If your target scenario consistently exceeds ~1.5-2.0 ms/frame CPU for animation, consider a Rust/WASM backend.
- Otherwise, keep TS/JS and optimize allocation patterns and data layout first.
- Details: `BENCHMARKS.md`

## Detailed API docs

- `docs/API.md`
- `docs/hooks.md`
- `docs/systems.md`

## Troubleshooting Sprite Playback

### Symptom: "I see left-to-right scrolling instead of animation"

This is usually not a runtime bug. It often comes from clip layout and loop boundaries.

When you define a clip like this:

```ts
idle: { row: 0, from: 0, to: 7, fps: 10, loop: true }
```

the runtime plays frames in this exact order:

```text
0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 0 -> ...
```

If frame `0` and frame `7` are visually far apart, the `7 -> 0` loop reset can look like horizontal scrolling.

### Recommended fix

Use explicit `frames` sequences and avoid abrupt loop jumps:

```ts
idle: { frames: [1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2], fps: 9, loop: true }
```

This ping-pong pattern removes the hard wrap from the last frame back to the first frame.

### Quick diagnosis checklist

1. Verify atlas frame size and `columns` are correct.
2. Temporarily force a single frame clip (`frames: [N]`).
3. If single-frame is stable, the issue is sequence/loop perception, not sampling.
4. Reduce FPS and/or use explicit frame arrays for smoother perceived motion.

### Practical notes

- Large source frames rendered very small can amplify visual jitter.
- Frame `0` is sometimes a setup/transition frame; excluding it can improve loops.
- Use `next: 'idle'` for one-shot clips (`shoot`, `hit`) to avoid accidental wrap artifacts.
