# Tween & Animation

Animating values over time is one of the most common needs in games: fade a sprite in, slide a UI panel off-screen, bounce an enemy on hit, spring a camera to its target. Without a tween system you end up writing per-frame interpolation logic scattered across dozens of systems, each managing its own `t`, `elapsed`, and callback state.

GWEN's tween system solves this with **`useTween`** — a composable that returns a typed, pool-backed animation handle you control with `play()`, `pause()`, `resume()`, and `reset()`. The engine advances all active tweens automatically; you just read `.value` in your system.

## Quick Start

```typescript
import { defineSystem } from '@gwenjs/core';
import { useTween } from '@gwenjs/core/tween';

export const FadeInSystem = defineSystem(() => {
  // Create a tween handle — backed by the engine's TweenPool.
  const opacity = useTween<number>({
    duration: 0.4, // seconds
    easing: 'easeOutQuad',
  });

  // Start animating on the first frame.
  opacity.play({ from: 0, to: 1 });

  return {
    onStep() {
      // Read the current interpolated value each frame.
      mySprite.alpha = opacity.value;
    },
  };
});
```

## Supported Types

`useTween<T>` works with any `TweenableValue`:

| Type     | Shape                                            | Example                              |
| -------- | ------------------------------------------------ | ------------------------------------ |
| `number` | scalar                                           | `useTween<number>({ duration: 1 })`  |
| `Vec2`   | `{ x: number; y: number }`                       | `useTween<Vec2>({ duration: 0.5 })`  |
| `Vec3`   | `{ x: number; y: number; z: number }`            | `useTween<Vec3>({ duration: 2 })`    |
| `Color`  | `{ r: number; g: number; b: number; a: number }` | `useTween<Color>({ duration: 0.3 })` |

```typescript
// Vec2 example — smoothly move a UI element
const pos = useTween<Vec2>({ duration: 0.6, easing: 'easeOutBack' });
pos.play({ from: { x: -200, y: 0 }, to: { x: 0, y: 0 } });

// Color example — fade from transparent red to opaque white
const col = useTween<Color>({ duration: 1, easing: 'easeInOutSine' });
col.play({ from: { r: 1, g: 0, b: 0, a: 0 }, to: { r: 1, g: 1, b: 1, a: 1 } });
```

## Easing Functions

All 26 built-in easing functions accept a normalised time `t ∈ [0, 1]`.

### Linear

| Name     | Description                |
| -------- | -------------------------- |
| `linear` | Constant speed — no easing |

### Quadratic

| Name            | Description                             |
| --------------- | --------------------------------------- |
| `easeInQuad`    | Slow start, accelerates                 |
| `easeOutQuad`   | Fast start, decelerates — great default |
| `easeInOutQuad` | Slow start and end, fast middle         |

### Cubic

| Name             | Description         |
| ---------------- | ------------------- |
| `easeInCubic`    | Stronger slow start |
| `easeOutCubic`   | Stronger fast start |
| `easeInOutCubic` | Smooth S-curve      |

### Quartic

| Name             | Description        |
| ---------------- | ------------------ |
| `easeInQuart`    | Very slow start    |
| `easeOutQuart`   | Very fast start    |
| `easeInOutQuart` | Pronounced S-curve |

### Sine

| Name            | Description         |
| --------------- | ------------------- |
| `easeInSine`    | Gentle acceleration |
| `easeOutSine`   | Gentle deceleration |
| `easeInOutSine` | Very smooth S-curve |

### Exponential

| Name            | Description                   |
| --------------- | ----------------------------- |
| `easeInExpo`    | Near-zero start, sharp launch |
| `easeOutExpo`   | Sharp start, near-zero end    |
| `easeInOutExpo` | Extreme S-curve               |

### Back

Overshoots slightly before/after the target — great for UI elements.

| Name            | Description                         |
| --------------- | ----------------------------------- |
| `easeInBack`    | Pulls back before launching         |
| `easeOutBack`   | Overshoots target, snaps back       |
| `easeInOutBack` | Pulls back and overshoots both ends |

### Elastic

Spring-like oscillation — looks like a rubber band snapping.

| Name               | Description                     |
| ------------------ | ------------------------------- |
| `easeInElastic`    | Elastic wind-up before the move |
| `easeOutElastic`   | Elastic snap at the end         |
| `easeInOutElastic` | Elastic at both ends            |

### Bounce

Simulates a ball bouncing on a floor.

| Name              | Description                           |
| ----------------- | ------------------------------------- |
| `easeInBounce`    | Bounces at the start of the animation |
| `easeOutBounce`   | Bounces at the end — most natural     |
| `easeInOutBounce` | Bounces at both ends                  |

### Spring

| Name     | Description                                        |
| -------- | -------------------------------------------------- |
| `spring` | Overdamped spring — overshoots once, settles clean |

## Custom Easing

Pass any `(t: number) => number` function as the `easing` option:

```typescript
// Quadratic ease-in (same as easeInQuad, written manually)
const tween = useTween<number>({
  duration: 1.0,
  easing: (t) => t * t,
});

// Step function — instant snap at 50%
const snap = useTween<number>({
  duration: 1.0,
  easing: (t) => (t < 0.5 ? 0 : 1),
});
```

Custom functions receive `t ∈ [0, 1]` and must return a value in the same range (values outside `[0, 1]` are valid for overshoot effects).

## Sequences

Use `defineSequence` to chain multiple tweens and delays into a single controllable animation:

```typescript
import { defineSystem } from '@gwenjs/core';
import { useTween, defineSequence } from '@gwenjs/core/tween';

export const DeathAnimationSystem = defineSystem(() => {
  const scale = useTween<number>({ duration: 0.15, easing: 'easeInBack' });
  const opacity = useTween<number>({ duration: 0.2, easing: 'easeInQuad' });

  const deathSeq = defineSequence([
    // 1. Shrink the sprite.
    { tween: scale, from: 1.0, to: 0.0 },
    // 2. Wait a beat.
    { wait: 0.05 },
    // 3. Fade out.
    { tween: opacity, from: 1.0, to: 0.0 },
  ]);

  deathSeq.onComplete(() => {
    actor.destroy();
  });

  return {
    onDeath() {
      deathSeq.play();
    },
  };
});
```

### SequenceHandle API

| Method           | Description                                       |
| ---------------- | ------------------------------------------------- |
| `play()`         | Start or restart the sequence from the first step |
| `pause()`        | Pause at the current step                         |
| `reset()`        | Reset to the beginning without playing            |
| `onComplete(cb)` | Register a callback for when all steps finish     |

## Performance Notes

- **Pool-based:** The engine maintains a `TweenPool` with **256 slots** (configurable). `useTween()` claims a slot; no heap allocation occurs per call in steady state.
- **Zero GC pressure in the hot path:** The tween manager iterates slots with a plain `for` loop, no closures or array intermediaries.
- **Per-component interpolation is inlined:** `number`, `Vec2`, `Vec3`, and `Color` each have their own fast path — no dynamic dispatch on the common case.
- **Tree-shaking:** The GWEN Vite plugin (`gwen:tween`) statically analyses your source for `easing: 'name'` literals and emits `virtual:gwen/used-easings`, allowing bundlers to drop unused easing functions.

## Best Practices

### ✅ Call `useTween` inside `defineSystem` or `defineActor`

```typescript
// ✅ Correct — called inside a system setup function
export const MySystem = defineSystem(() => {
  const t = useTween<number>({ duration: 1 });
  // ...
});
```

`useTween` requires an active engine context. Calling it at module scope or inside an `onStep` callback will throw.

```typescript
// ❌ Wrong — no engine context at module scope
const t = useTween<number>({ duration: 1 });
```

### ✅ Prefer `defineSequence` over nested `onComplete` chains

```typescript
// ❌ Fragile — hard to read and cancel
fadeOut.play({ from: 1, to: 0 });
fadeOut.onComplete(() => {
  slideUp.play({ from: 0, to: -100 });
  slideUp.onComplete(() => {
    destroy();
  });
});

// ✅ Clear intent, easy to pause/reset
defineSequence([
  { tween: fadeOut, from: 1, to: 0 },
  { tween: slideUp, from: 0, to: -100 },
]).play();
```

### ✅ Use named easing strings for tree-shaking

The Vite plugin can only tree-shake easing functions referenced as **static string literals**. Computed or dynamic easing values disable tree-shaking for that call site.

```typescript
// ✅ Statically analysable — will be tree-shaken
useTween({ duration: 1, easing: 'easeOutBounce' });

// ⚠️  Dynamic — not tree-shaken, bundled as-is (still works at runtime)
const e = getEasingFromConfig();
useTween({ duration: 1, easing: e });
```
