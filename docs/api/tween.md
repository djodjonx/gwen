# Tween API

Complete API reference for the GWEN Tween & Animation system (`@gwenjs/core/tween`).

> **See also:** [Tween & Animation guide](/guide/tween) for usage patterns and examples.

## `useTween<T>(options)`

Returns a tween handle for animating a value of type `T` over time.

**Must** be called inside an active engine context (`defineSystem`, `defineActor`, or `engine.run()`).

```typescript
function useTween<T extends TweenableValue>(options: TweenOptions<T>): TweenHandle<T>
```

### Parameters

| Parameter          | Type                          | Required | Description                                     |
|--------------------|-------------------------------|----------|-------------------------------------------------|
| `options.duration` | `number`                      | ✅        | Duration in seconds. Must be positive.           |
| `options.easing`   | `EasingName \| (t) => number` | —        | Easing to apply. Default: `'linear'`.            |
| `options.loop`     | `boolean`                     | —        | Repeat indefinitely after reaching the end.      |
| `options.yoyo`     | `boolean`                     | —        | Reverse direction each cycle. Requires `loop`.  |

### Returns

[`TweenHandle<T>`](#tweenhandlet) — a pool-backed animation handle.

### Throws

- `GwenContextError` — if called outside an active engine context.

### Example

```typescript
const fade = useTween<number>({ duration: 0.4, easing: 'easeOutQuad' })
fade.play({ from: 1, to: 0 })
fade.onComplete(() => actor.destroy())
```

---

## `defineSequence(steps)`

Creates a sequence of tweens and delays that play one after another.

```typescript
function defineSequence(steps: SequenceStep[]): SequenceHandle
```

### Parameters

| Parameter | Type             | Description                                      |
|-----------|------------------|--------------------------------------------------|
| `steps`   | `SequenceStep[]` | Ordered array of tween animations and wait steps |

### Returns

[`SequenceHandle`](#sequencehandle) — a controllable sequence runner.

### Example

```typescript
const seq = defineSequence([
  { tween: scaleDown, from: 1.0, to: 0.0 },
  { wait: 0.1 },
  { tween: fadeOut,   from: 1.0, to: 0.0 },
])
seq.play()
seq.onComplete(() => entity.destroy())
```

---

## `TweenOptions<T>`

Configuration passed to `useTween`.

```typescript
interface TweenOptions<T extends TweenableValue> {
  duration: number
  easing?:  EasingName | ((t: number) => number)
  loop?:    boolean
  yoyo?:    boolean
}
```

| Field      | Type                                 | Default    | Description                                      |
|------------|--------------------------------------|------------|--------------------------------------------------|
| `duration` | `number`                             | —          | Animation duration in seconds. Required.         |
| `easing`   | `EasingName \| (t: number) => number`| `'linear'` | Easing curve by name or custom function.         |
| `loop`     | `boolean`                            | `false`    | Loop indefinitely when the animation completes.  |
| `yoyo`     | `boolean`                            | `false`    | Ping-pong: reverse direction on each cycle.      |

---

## `TweenHandle<T>`

Returned by `useTween`. Provides control and state inspection.

```typescript
interface TweenHandle<T extends TweenableValue> {
  readonly value:   T
  readonly playing: boolean

  play(targets: { from: T; to: T }): void
  pause(): void
  resume(): void
  reset(): void
  onComplete(cb: () => void): void
  tick(dt: number): void
}
```

### Properties

| Property  | Type      | Description                                           |
|-----------|-----------|-------------------------------------------------------|
| `value`   | `T`       | Current interpolated value. Updated every frame.      |
| `playing` | `boolean` | `true` while the tween is advancing each frame.       |

### Methods

| Method               | Description                                                         |
|----------------------|---------------------------------------------------------------------|
| `play(targets)`      | Start animating from `targets.from` to `targets.to`. Can restart.  |
| `pause()`            | Pause at the current value. Resume with `resume()`.                 |
| `resume()`           | Resume from the current position after a `pause()`.                 |
| `reset()`            | Stop and rewind to the initial `from` value.                        |
| `onComplete(cb)`     | Register a callback fired when a cycle completes.                   |
| `tick(dt)`           | Advance the tween by `dt` seconds (called by the engine; rarely needed directly). |

---

## `TweenableValue`

Union of all types that `useTween` can animate.

```typescript
type TweenableValue = number | Vec2 | Vec3 | Color
```

| Type     | Import from      | Shape                                    |
|----------|------------------|------------------------------------------|
| `number` | —                | scalar                                   |
| `Vec2`   | `@gwenjs/math`   | `{ x: number; y: number }`               |
| `Vec3`   | `@gwenjs/math`   | `{ x: number; y: number; z: number }`    |
| `Color`  | `@gwenjs/math`   | `{ r: number; g: number; b: number; a: number }` |

---

## `SequenceStep`

A single element in a `defineSequence` step array. Either a tween step or a wait delay.

```typescript
type SequenceStep =
  | { tween: TweenHandle<TweenableValue>; from: TweenableValue; to: TweenableValue }
  | { wait: number }
```

### Tween step

| Field   | Type                          | Description                       |
|---------|-------------------------------|-----------------------------------|
| `tween` | `TweenHandle<TweenableValue>` | Tween handle to play for this step |
| `from`  | `TweenableValue`              | Starting value                    |
| `to`    | `TweenableValue`              | Target value                      |

### Wait step

| Field  | Type     | Description              |
|--------|----------|--------------------------|
| `wait` | `number` | Delay in seconds to wait |

---

## `SequenceHandle`

Returned by `defineSequence`. Provides control over the sequence lifecycle.

```typescript
interface SequenceHandle {
  play(): void
  pause(): void
  reset(): void
  onComplete(cb: () => void): void
}
```

| Method           | Description                                             |
|------------------|---------------------------------------------------------|
| `play()`         | Start or restart the sequence from the first step.      |
| `pause()`        | Pause at the current step.                              |
| `reset()`        | Reset to the beginning without playing.                 |
| `onComplete(cb)` | Register a callback fired when all steps complete.      |

---

## `EasingName`

String union of all built-in easing function names.

```typescript
type EasingName =
  | 'linear'
  | 'easeInQuad'     | 'easeOutQuad'     | 'easeInOutQuad'
  | 'easeInCubic'    | 'easeOutCubic'    | 'easeInOutCubic'
  | 'easeInQuart'    | 'easeOutQuart'    | 'easeInOutQuart'
  | 'easeInSine'     | 'easeOutSine'     | 'easeInOutSine'
  | 'easeInExpo'     | 'easeOutExpo'     | 'easeInOutExpo'
  | 'easeInBack'     | 'easeOutBack'     | 'easeInOutBack'
  | 'easeInElastic'  | 'easeOutElastic'  | 'easeInOutElastic'
  | 'easeInBounce'   | 'easeOutBounce'   | 'easeInOutBounce'
  | 'spring'
```

See the [Easing Functions section](/guide/tween#easing-functions) of the guide for descriptions of each family.

---

## Individual Easing Functions

All easing functions are named exports from `@gwenjs/core/tween`:

```typescript
import { easeOutQuad, spring, linear } from '@gwenjs/core/tween'
```

Signature: `(t: number) => number` — accepts normalised time `t ∈ [0, 1]`.

| Function            | Family       | Description                              |
|---------------------|--------------|------------------------------------------|
| `linear`            | Linear       | Constant speed                           |
| `easeInQuad`        | Quadratic    | Slow start, accelerates                  |
| `easeOutQuad`       | Quadratic    | Fast start, decelerates                  |
| `easeInOutQuad`     | Quadratic    | Slow at both ends                        |
| `easeInCubic`       | Cubic        | Stronger slow start                      |
| `easeOutCubic`      | Cubic        | Stronger fast start                      |
| `easeInOutCubic`    | Cubic        | Smooth S-curve                           |
| `easeInQuart`       | Quartic      | Very slow start                          |
| `easeOutQuart`      | Quartic      | Very fast start                          |
| `easeInOutQuart`    | Quartic      | Pronounced S-curve                       |
| `easeInSine`        | Sine         | Gentle acceleration                      |
| `easeOutSine`       | Sine         | Gentle deceleration                      |
| `easeInOutSine`     | Sine         | Very smooth S-curve                      |
| `easeInExpo`        | Exponential  | Near-zero start, sharp launch            |
| `easeOutExpo`       | Exponential  | Sharp start, near-zero end               |
| `easeInOutExpo`     | Exponential  | Extreme S-curve                          |
| `easeInBack`        | Back         | Pulls back before launching              |
| `easeOutBack`       | Back         | Overshoots target, snaps back            |
| `easeInOutBack`     | Back         | Overshoots both ends                     |
| `easeInElastic`     | Elastic      | Elastic wind-up before moving            |
| `easeOutElastic`    | Elastic      | Elastic snap at the end                  |
| `easeInOutElastic`  | Elastic      | Elastic at both ends                     |
| `easeInBounce`      | Bounce       | Bounces at the start                     |
| `easeOutBounce`     | Bounce       | Bounces at the end (most natural)        |
| `easeInOutBounce`   | Bounce       | Bounces at both ends                     |
| `spring`            | Spring       | Overdamped spring, overshoots once       |

---

## `TweenPool` (Advanced)

The `TweenPool` manages a fixed-size array of tween slots. It is created internally by the engine; most users never interact with it directly.

```typescript
class TweenPool {
  /** Number of available slots. Default: 256. */
  readonly capacity: number

  /** Claim an unused slot for a new tween. */
  claim(options: TweenOptions<TweenableValue>): TweenHandle<TweenableValue>

  /** Release a previously claimed slot back to the pool. */
  release(slot: TweenHandle<TweenableValue>): void

  /** Advance all active slots by `dt` seconds. Called by the engine each frame. */
  tick(dt: number): void
}
```

### When to use `TweenPool` directly

You generally don't need to. `useTween` claims slots automatically. Direct pool access is useful when:

- Building custom animation middleware.
- Writing a plugin that needs to manage its own tween lifecycle independently.
- Testing pool exhaustion scenarios.

---

## `TweenManager` (Advanced)

`TweenManager` wraps `TweenPool` with engine lifecycle integration.

```typescript
class TweenManager {
  /** Claim a tween slot from the backing pool. */
  claim(options: TweenOptions<TweenableValue>): TweenHandle<TweenableValue>

  /** Release a slot back to the pool. */
  release(slot: TweenHandle<TweenableValue>): void

  /** Advance all active tweens. Called by the engine on each step. */
  tick(dt: number): void
}
```

Obtain the manager inside an engine context:

```typescript
import { useEngine } from '@gwenjs/core'
import { getTweenManager } from '@gwenjs/core/tween'

const engine = useEngine()
const manager = getTweenManager(engine)
```
