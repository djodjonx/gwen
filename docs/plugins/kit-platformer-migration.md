# gwen-kit-platformer migration guide

This guide covers migration to the deterministic jump/grounding model.

## Why this change

The old movement model relied on inferred stationary grounding plus a broad jump cooldown.
The new model is explicit and deterministic:

- Grounded state is stabilized with frame hysteresis.
- Jump acceptance is controlled by coyote, input buffer, and post-jump lock.
- Jump consumption is tied to landing confirmation.

This reduces accidental double-jumps and makes tuning easier.

## API changes

### Player prefab options

Preferred options:

- `jumpVelocity`
- `jumpCoyoteMs`
- `jumpBufferWindowMs`
- `groundEnterFrames`
- `groundExitFrames`
- `postJumpLockMs`

Deprecated aliases (still accepted for migration):

- `jumpForce` -> `jumpVelocity`
- `coyoteMs` -> `jumpCoyoteMs`
- `jumpBufferMs` -> `jumpBufferWindowMs`

### PlatformerController fields

Preferred fields:

- `jumpVelocity`
- `jumpCoyoteMs`
- `jumpBufferWindowMs`
- `groundEnterFrames`
- `groundExitFrames`
- `postJumpLockMs`

Deprecated aliases remain available and are tagged with JSDoc `@deprecated`.

## Before / after example

```ts
// Before
const player = createPlayerPrefab({
  speed: 360,
  jumpForce: 620,
  coyoteMs: 120,
  jumpBufferMs: 110,
});

// After
const player = createPlayerPrefab({
  speed: 360,
  jumpVelocity: 620,
  jumpCoyoteMs: 120,
  jumpBufferWindowMs: 110,
  groundEnterFrames: 1,
  groundExitFrames: 4,
  postJumpLockMs: 80,
});
```

## Recommended tuning presets

- `Arcade`: coyote 100-120ms, buffer 100-130ms, lock 70-90ms
- `Precision`: coyote 60-90ms, buffer 70-100ms, lock 50-70ms
- `Simulation`: coyote 30-60ms, buffer 40-80ms, lock 30-50ms

## Validation checklist

- No immediate double-jump when repeatedly tapping jump on landing.
- Coyote jump works at platform edges.
- Buffered jump triggers on landing as expected.
- No noticeable sticky-ground delay when running off ledges.

