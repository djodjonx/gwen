# gwen-kit-platformer - Advanced Usage (Level 3)

The kit exposes ECS components and internal systems for projects that need lower-level control.

## Build your own scene

```ts
import {
  PlatformerInputSystem,
  PlatformerMovementSystem,
  PlatformerController,
  PlatformerIntent,
} from '@djodjonx/gwen-kit-platformer';
import { defineScene } from '@djodjonx/gwen-engine-core';

export const CustomScene = defineScene({
  name: 'CustomGame',
  systems: [
    GroundDetectionSystem,
    PlatformerInputSystem,
    PlatformerMovementSystem,
    EnemyAISystem,
    AnimationSystem,
  ],
});
```

## Drive `PlatformerIntent` from AI

`PlatformerMovementSystem` only reads `PlatformerIntent`, so AI can write intents directly.

```ts
import { defineSystem } from '@djodjonx/gwen-engine-core';
import { PlatformerController, PlatformerIntent } from '@djodjonx/gwen-kit-platformer';

export const EnemyAISystem = defineSystem('EnemyAISystem', () => ({
  onUpdate(api) {
    for (const eid of api.query([PlatformerController, PlatformerIntent])) {
      api.addComponent(eid, PlatformerIntent, {
        moveX: 1,
        jumpJustPressed: false,
        jumpPressed: false,
      });
    }
  },
}));
```

## `PlatformerController` reference

| Field | Type | Default | Description |
|---|---|---|---|
| `units` | `string` | `'pixels'` | Movement unit: `'pixels'` or `'meters'` |
| `pixelsPerMeter` | `f32` | `50` | Conversion ratio used when `units='pixels'` |
| `speed` | `f32` | `300` | Max horizontal speed (depends on `units`) |
| `jumpVelocity` | `f32` | `500` | Jump launch velocity (depends on `units`) |
| `jumpCoyoteMs` | `f32` | `110` | Coyote time window (ms) |
| `jumpBufferWindowMs` | `f32` | `110` | Jump buffer window (ms) |
| `groundEnterFrames` | `f32` | `1` | Frames required to confirm grounded |
| `groundExitFrames` | `f32` | `4` | Frames required to confirm airborne |
| `postJumpLockMs` | `f32` | `80` | Short post-jump lockout to absorb re-contact jitter |
| `maxFallSpeed` | `f32` | `600` | Fall speed cap (depends on `units`) |

Deprecated aliases (accepted, but migrate away):

- `jumpForce` -> `jumpVelocity`
- `coyoteMs` -> `jumpCoyoteMs`
- `jumpBufferMs` -> `jumpBufferWindowMs`

## `PlatformerIntent` reference

| Field | Type | Description |
|---|---|---|
| `moveX` | `f32` | Horizontal direction: -1, 0, 1 |
| `jumpJustPressed` | `bool` | `true` on the first jump press frame |
| `jumpPressed` | `bool` | `true` while jump is held |

## Required `Physics2DAPI` contract

`PlatformerMovementSystem` uses these `Physics2DAPI` methods:

| Method | Signature | Description |
|---|---|---|
| `getLinearVelocity` | `(eid) => {x,y} \| null` | Current velocity |
| `setLinearVelocity` | `(eid, vx, vy) => void` | Applies velocity |
| `getSensorState` | `(eid, sensorId) => SensorState` | Ground check via foot sensor |

## Deterministic internals

`PlatformerMovementSystem` uses:

- `groundHysteresis.ts` to stabilize grounded state from sensor flicker.
- `jumpResolver.ts` to enforce deterministic jump gate and one-jump-per-takeoff semantics.

For migration details, see `docs/plugins/kit-platformer-migration.md`.

