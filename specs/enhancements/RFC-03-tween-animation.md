# RFC-03 — Tween & Animation System

## Status
`draft`

## Summary

Add `useTween<T>()` and `defineSequence()` composables to `@gwenjs/core` for
animating gameplay values (HP, score, camera position, color fades, UI counters).

These composables are **not** for CSS/DOM animation (that lives in `@gwenjs/ui`).
They target **gameplay scalar and vector values** that change over time, with
pool-based allocation (zero GC pressure per tween play).

---

## Motivation

Without a tween system, developers write manual interpolation in `onUpdate`:

```typescript
// ❌ Before — manual, verbose, hard to chain
let t = 0
onUpdate((dt) => {
  t += dt / 0.5
  camera.x = lerp(start.x, end.x, Math.min(t, 1))
})
```

With `useTween`:

```typescript
// ✅ After — declarative, chainable, zero-allocation
const cam = useTween<Vec2>({ duration: 0.5, easing: 'easeOutQuad' })
cam.play({ from: start, to: end })
cam.onComplete(() => scene.router.go('GameOver'))
```

---

## Supported Types

| Type | Example |
|------|---------|
| `number` | HP bar, score counter, opacity |
| `Vec2` | Camera target, entity position |
| `Vec3` | 3D position, RGB color |
| `Color` | RGBA fade, health color |

---

## API

### `useTween<T>(options)`

Called inside `defineSystem()` or `defineActor()`.

```typescript
export interface TweenOptions<T> {
  /** Duration in seconds. */
  duration: number
  /** Easing function name or custom function. @default 'linear' */
  easing?: EasingName | ((t: number) => number)
  /** If true, tween loops forever. @default false */
  loop?: boolean
  /** If true, tween plays back and forth. @default false */
  yoyo?: boolean
}

export interface TweenHandle<T> {
  /** Current interpolated value. */
  readonly value: T
  /** True if the tween is currently playing. */
  readonly playing: boolean
  /** Start the tween from `from` to `to`. */
  play(targets: { from: T; to: T }): void
  /** Pause the tween at current position. */
  pause(): void
  /** Resume from pause. */
  resume(): void
  /** Reset to start position and stop. */
  reset(): void
  /** Register a callback fired when the tween completes (or each cycle if loop). */
  onComplete(cb: () => void): void
  /** Manually advance the tween by `dt` seconds (called automatically by the system). */
  tick(dt: number): void
}
```

**Usage:**

```typescript
const KartSystem = defineSystem(() => {
  const speedTween = useTween<number>({ duration: 0.3, easing: 'easeOutCubic' })

  onUpdate((dt) => {
    if (input.held('accelerate')) {
      speedTween.play({ from: 0, to: maxSpeed })
    }
    kart.velocity.x = speedTween.value
  })
})
```

---

### `defineSequence(steps)`

A timeline of tweens and delays played in order.

```typescript
export type SequenceStep<T> =
  | { tween: TweenHandle<T>; from: T; to: T }
  | { wait: number }  // pause in seconds

export interface SequenceHandle {
  play(): void
  pause(): void
  reset(): void
  onComplete(cb: () => void): void
}

export function defineSequence(steps: SequenceStep<unknown>[]): SequenceHandle
```

**Usage (death sequence):**

```typescript
const PlayerActor = defineActor(PlayerPrefab, () => {
  const flash   = useTween<number>({ duration: 0.1, easing: 'linear' })
  const fadeOut = useTween<number>({ duration: 0.5, easing: 'easeInQuad' })

  const deathSequence = defineSequence([
    { tween: flash,   from: 1, to: 0 },
    { tween: flash,   from: 0, to: 1 },
    { wait: 0.2 },
    { tween: fadeOut, from: 1, to: 0 },
  ])

  return {
    die() {
      deathSequence.play()
      deathSequence.onComplete(() => {
        // emit death event, trigger respawn layout, etc.
      })
    }
  }
})
```

---

## Easing Functions

Tree-shakeable — only imported easings are included in the bundle.

```typescript
export type EasingName =
  | 'linear'
  | 'easeInQuad'   | 'easeOutQuad'   | 'easeInOutQuad'
  | 'easeInCubic'  | 'easeOutCubic'  | 'easeInOutCubic'
  | 'easeInQuart'  | 'easeOutQuart'  | 'easeInOutQuart'
  | 'easeInSine'   | 'easeOutSine'   | 'easeInOutSine'
  | 'easeInExpo'   | 'easeOutExpo'   | 'easeInOutExpo'
  | 'easeInBack'   | 'easeOutBack'   | 'easeInOutBack'
  | 'easeInElastic'| 'easeOutElastic'| 'easeInOutElastic'
  | 'easeInBounce' | 'easeOutBounce' | 'easeInOutBounce'
  | 'spring'
```

---

## Architecture

### Phase 1 — TypeScript pool (this RFC)

```
packages/core/src/tween/
  easing.ts          — easing functions (each exported independently for tree-shaking)
  tween-pool.ts      — object pool, reuses TweenHandle instances on play/reset
  tween-types.ts     — TweenOptions, TweenHandle, SequenceStep, SequenceHandle
  use-tween.ts       — useTween() composable (reads engine context)
  define-sequence.ts — defineSequence() factory
  tween-manager.ts   — TweenManager: registered tweens ticked each frame onUpdate
  index.ts           — barrel exports
```

**Pool strategy:**
- `TweenManager` holds a fixed pool of 256 tween slots per engine instance
- `useTween()` claims a slot from the pool on first call
- Slots are released on `dispose()` or when the actor is despawned
- No heap allocation during `play()` or `tick()`

### Phase 2 — WASM bulk (future RFC)

When 10k+ tweens run simultaneously (e.g. particle systems):
- Store `from`, `to`, `elapsed`, `duration` in `Float32Array`
- WASM `tween_bulk_tick(buffer, dt)` updates all values in one call
- JS reads back typed array view — zero copy

---

## Vite Integration (`gwen:tween`)

Vite plugin detects unused easing functions and removes them from the bundle.

```typescript
// Only 'easeOutQuad' and 'linear' used in the project
// → all other easings tree-shaken at build time

// gwen.config.ts — no extra config needed, auto-detected
```

Since `useTween` is in `@gwenjs/core`, no module declaration is needed.
The Vite plugin is shipped inside `@gwenjs/vite` as `gwen:tween`.

---

## Integration with Mario Kart-like (example)

```typescript
const KartActor = defineActor(KartPrefab, () => {
  const t = useTransform()
  const speedTween = useTween<number>({ duration: 0.4, easing: 'easeOutCubic' })
  const driftTween = useTween<number>({ duration: 0.2, easing: 'easeInOutSine' })

  onUpdate((dt) => {
    if (input.held('drift')) {
      driftTween.play({ from: 0, to: 45 })   // 45° drift angle
    } else {
      driftTween.play({ from: driftTween.value, to: 0 })
    }
    t.rotateTo(driftTween.value * DEG_TO_RAD)
  })
})
```

---

## Integration with RPG (example)

```typescript
const HUDSystem = defineSystem(() => {
  const hpTween = useTween<number>({ duration: 0.6, easing: 'easeOutCubic' })

  onUpdate(() => {
    // HP bar smoothly follows actual HP
    hpTween.play({ from: hpTween.value, to: player.hp / player.maxHp })
    ui.setBarFill('hp-bar', hpTween.value)
  })
})
```

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `packages/core/src/tween/easing.ts` | Create — 24 easing functions |
| `packages/core/src/tween/tween-types.ts` | Create — all types |
| `packages/core/src/tween/tween-pool.ts` | Create — pool implementation |
| `packages/core/src/tween/tween-manager.ts` | Create — per-engine tween tick |
| `packages/core/src/tween/use-tween.ts` | Create — composable |
| `packages/core/src/tween/define-sequence.ts` | Create — sequence factory |
| `packages/core/src/tween/index.ts` | Create — barrel |
| `packages/core/src/index.ts` | Modify — add tween exports |
| `packages/core/tests/tween/` | Create — Vitest tests |
| `packages/vite/src/plugins/tween.ts` | Create — `gwen:tween` Vite plugin |
| `packages/vite/tests/tween-plugin.test.ts` | Create — plugin tests |
| `docs/guide/tween.md` | Create — VitePress guide |
| `docs/api/tween.md` | Create — API reference |

---

## Acceptance Criteria

- [ ] `useTween<number>()` works with `easing: 'easeOutQuad'` and completes in `duration` seconds
- [ ] `useTween<Vec2>()` interpolates both x and y correctly
- [ ] Pool: no GC pressure — `performance.memory.usedJSHeapSize` stable across 10k `play()` calls
- [ ] `defineSequence()` plays steps in order, fires `onComplete` once at the end
- [ ] Unused easing functions are tree-shaken from production build
- [ ] `gwen:tween` Vite plugin correctly detects used easings via AST
- [ ] 100% Vitest coverage on `use-tween.ts`, `define-sequence.ts`, `easing.ts`
