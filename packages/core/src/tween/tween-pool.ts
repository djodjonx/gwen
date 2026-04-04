/**
 * Fixed-size object pool for tween animations.
 *
 * Provides zero-allocation tween gameplay via pre-allocated {@link TweenSlot} objects.
 * The pool reserves a fixed number of slots upfront. Each slot is a complete
 * {@link TweenHandle} implementation that mutates in place during playback.
 *
 * @since 1.0.0
 */

import { EASING_MAP, type EasingName } from './easing.js';
import type { TweenHandle, TweenOptions, TweenableValue } from './tween-types.js';
import { lerp } from '@gwenjs/math';

// ── Type Aliases ─────────────────────────────────────────────────────────────

/**
 * Value type identifier for interpolation dispatch.
 *
 * @internal
 */
type ValueType = 'number' | 'vec2' | 'vec3' | 'color';

// ── TweenSlot: The pooled tween object ───────────────────────────────────────

/**
 * A pre-allocated slot that implements the {@link TweenHandle} interface.
 * Slots are mutable in place and mutate during gameplay without heap allocation.
 *
 * @internal
 */
export class TweenSlot implements TweenHandle<TweenableValue> {
  // ─ Configuration (set on play()) ────────────────────────────────────────
  private _from: TweenableValue = 0;
  private _to: TweenableValue = 0;
  private _duration: number = 1;
  private _easingFn: (t: number) => number = (t: number) => t;
  private _loop: boolean = false;
  private _yoyo: boolean = false;

  // ─ Runtime state ────────────────────────────────────────────────────────
  private _value: TweenableValue = 0;
  private _playing: boolean = false;
  private _elapsed: number = 0;
  private _completeCbs: Array<() => void> = [];
  private _valueType: ValueType = 'number';
  private _onReturnLeg: boolean = false; // True during yoyo reverse

  // ─ Pre-allocated scratch objects for zero-alloc vector updates ──────────
  private readonly _vec2Scratch = { x: 0, y: 0 };
  private readonly _vec3Scratch = { x: 0, y: 0, z: 0 };
  private readonly _colorScratch = { r: 0, g: 0, b: 0, a: 0 };

  /**
   * Current interpolated value of the tween.
   * Updated automatically each frame via {@link tick}.
   *
   * @readonly
   * @since 1.0.0
   */
  get value(): TweenableValue {
    return this._value;
  }

  /**
   * Whether the tween is currently animating.
   *
   * @readonly
   * @since 1.0.0
   */
  get playing(): boolean {
    return this._playing;
  }

  /**
   * Start a new tween animation from `from` to `to`.
   * Immediately updates {@link value} to `from`.
   * Sets {@link playing} to true.
   *
   * Clears previously registered onComplete listeners before starting.
   *
   * Can be called while a tween is already playing to restart it.
   *
   * @param targets - Animation targets: `{ from: T; to: T }`
   * @since 1.0.0
   */
  play(targets: { from: TweenableValue; to: TweenableValue }): void {
    this._completeCbs.length = 0;
    this._from = targets.from;
    this._to = targets.to;
    this._value = targets.from;
    this._elapsed = 0;
    this._playing = true;
    this._onReturnLeg = false;
    this._detectValueType(targets.from);
  }

  /**
   * Pause the tween at its current position.
   * Sets {@link playing} to false, preserves {@link value}.
   *
   * @since 1.0.0
   */
  pause(): void {
    this._playing = false;
  }

  /**
   * Resume animation from the current {@link value}.
   * Sets {@link playing} to true.
   * Has no effect if already playing or if play() has never been called.
   *
   * @since 1.0.0
   */
  resume(): void {
    if (this._from !== undefined) {
      this._playing = true;
    }
  }

  /**
   * Stop and reset the tween to its initial `from` value.
   * Sets {@link playing} to false.
   *
   * @since 1.0.0
   */
  reset(): void {
    this._playing = false;
    this._elapsed = 0;
    this._value = this._from;
    this._onReturnLeg = false;
  }

  /**
   * Register a callback to fire when the tween completes a cycle.
   * For looping tweens, fires at the end of each cycle.
   * For non-looping tweens, fires exactly once when duration is reached.
   *
   * @param cb - Callback function (no arguments)
   * @since 1.0.0
   */
  onComplete(cb: () => void): void {
    this._completeCbs.push(cb);
  }

  /**
   * Advance the tween by `dt` seconds.
   * Updates {@link value} via interpolation and fires {@link onComplete} callbacks.
   *
   * **Mutation:**
   * - Mutates `_elapsed`, `_value`, `_playing`, `_onReturnLeg` in place
   * - Never allocates new objects — all updates are direct property mutations
   *
   * @param dt - Time delta in seconds
   * @since 1.0.0
   */
  tick(dt: number): void {
    if (!this._playing) {
      return;
    }

    // Advance elapsed time
    this._elapsed += dt;

    // Determine if we've completed a cycle
    const cycleComplete = this._elapsed >= this._duration;

    // Clamp t to [0, 1] for the easing function
    let t = Math.min(this._elapsed / this._duration, 1);

    // Apply easing function
    let easedT = this._easingFn(t);

    // If yoyo and on return leg, reverse the eased value
    if (this._yoyo && this._onReturnLeg) {
      easedT = 1 - easedT;
    }

    // Compute interpolated value
    this._updateValue(easedT);

    // Handle cycle completion
    if (cycleComplete) {
      // Fire complete callbacks
      for (let i = 0; i < this._completeCbs.length; i++) {
        this._completeCbs[i]();
      }

      if (this._loop) {
        // For looping: restart from beginning, toggle direction if yoyo enabled
        this._elapsed -= this._duration;
        if (this._yoyo) {
          this._onReturnLeg = !this._onReturnLeg;
        }
      } else if (this._yoyo) {
        if (this._onReturnLeg) {
          // Return leg done — full yoyo cycle complete, STOP
          this._playing = false;
          this._onReturnLeg = false;
          this._elapsed = 0;
        } else {
          // Forward leg done — start return leg
          this._onReturnLeg = true;
          this._elapsed -= this._duration;
        }
      } else {
        // Non-looping, non-yoyo: stop
        this._playing = false;
        this._elapsed = this._duration;
      }
    }
  }

  // ─ Internal configuration methods (called by TweenPool) ──────────────────

  /**
   * Configure this slot with options from a TweenOptions object.
   * Called by TweenPool during claim().
   *
   * @internal
   */
  _configure(options: TweenOptions<TweenableValue>): void {
    this._duration = options.duration;
    this._loop = options.loop ?? false;
    this._yoyo = options.yoyo ?? false;

    // Resolve easing function
    if (typeof options.easing === 'string') {
      const easingName = options.easing as EasingName;
      this._easingFn = EASING_MAP[easingName] ?? ((t: number) => t);
    } else if (typeof options.easing === 'function') {
      this._easingFn = options.easing;
    } else {
      this._easingFn = (t: number) => t; // default: linear
    }
  }

  /**
   * Reset this slot to a pristine state for reuse.
   * Called by TweenPool during release().
   *
   * @internal
   */
  _reset(): void {
    this._from = 0;
    this._to = 0;
    this._value = 0;
    this._duration = 1;
    this._easingFn = (t: number) => t;
    this._loop = false;
    this._yoyo = false;
    this._playing = false;
    this._elapsed = 0;
    this._completeCbs.length = 0;
    this._valueType = 'number';
    this._onReturnLeg = false;
  }

  // ─ Private helpers ──────────────────────────────────────────────────────

  /**
   * Detect the value type of the input and cache it.
   * Used to dispatch to the correct interpolation path.
   *
   * @internal
   */
  private _detectValueType(val: TweenableValue): void {
    if (typeof val === 'number') {
      this._valueType = 'number';
    } else if ('z' in val && 'a' in val) {
      // Has z and a → Color
      this._valueType = 'color';
    } else if ('z' in val) {
      // Has z → Vec3
      this._valueType = 'vec3';
    } else if ('x' in val) {
      // Has x → Vec2
      this._valueType = 'vec2';
    } else {
      this._valueType = 'number';
    }
  }

  /**
   * Interpolate from `_from` to `_to` by the eased factor and update `_value`.
   * Dispatches to the correct interpolation path based on `_valueType`.
   *
   * **Mutation:**
   * The returned object reference is stable; its properties are mutated each frame.
   * Do not store references to individual properties.
   *
   * @internal
   */
  private _updateValue(easedT: number): void {
    const from = this._from;
    const to = this._to;

    switch (this._valueType) {
      case 'number': {
        this._value = lerp(from as number, to as number, easedT);
        break;
      }
      case 'vec2': {
        const fromVec2 = from as { x: number; y: number };
        const toVec2 = to as { x: number; y: number };
        this._vec2Scratch.x = lerp(fromVec2.x, toVec2.x, easedT);
        this._vec2Scratch.y = lerp(fromVec2.y, toVec2.y, easedT);
        this._value = this._vec2Scratch;
        break;
      }
      case 'vec3': {
        const fromVec3 = from as { x: number; y: number; z: number };
        const toVec3 = to as { x: number; y: number; z: number };
        this._vec3Scratch.x = lerp(fromVec3.x, toVec3.x, easedT);
        this._vec3Scratch.y = lerp(fromVec3.y, toVec3.y, easedT);
        this._vec3Scratch.z = lerp(fromVec3.z, toVec3.z, easedT);
        this._value = this._vec3Scratch;
        break;
      }
      case 'color': {
        const fromColor = from as { r: number; g: number; b: number; a: number };
        const toColor = to as { r: number; g: number; b: number; a: number };
        this._colorScratch.r = lerp(fromColor.r, toColor.r, easedT);
        this._colorScratch.g = lerp(fromColor.g, toColor.g, easedT);
        this._colorScratch.b = lerp(fromColor.b, toColor.b, easedT);
        this._colorScratch.a = lerp(fromColor.a, toColor.a, easedT);
        this._value = this._colorScratch;
        break;
      }
    }
  }
}

// ── TweenPool ────────────────────────────────────────────────────────────────

/**
 * A fixed-size object pool of {@link TweenSlot} objects.
 *
 * Pre-allocates a fixed number of reusable tween slots to enable
 * zero-allocation animation playback. Supports claiming slots for active
 * tweens and releasing them when no longer needed.
 *
 * @example
 * ```typescript
 * const pool = new TweenPool(256); // 256 slots
 * const slot = pool.claim();
 * slot.play({ from: 0, to: 100 });
 * slot.tick(0.016); // advance by 16ms
 * console.log(slot.value); // Interpolated value
 * pool.release(slot);
 * ```
 *
 * @since 1.0.0
 */
export class TweenPool {
  private _slots: TweenSlot[] = [];
  private _available: TweenSlot[] = [];
  private _active: Set<TweenSlot> = new Set();
  /** Pre-allocated buffer for zero-alloc tick iteration. @since 1.0.0 */
  private readonly _tickBuffer: TweenSlot[];

  /**
   * Create a new TweenPool with a fixed capacity.
   *
   * @param size - Number of pre-allocated slots (default: 256)
   * @throws If size is less than 1
   * @since 1.0.0
   */
  constructor(size: number = 256) {
    if (size < 1) {
      throw new Error('[GWEN] TweenPool size must be >= 1');
    }

    // Pre-allocate all slots
    for (let i = 0; i < size; i++) {
      const slot = new TweenSlot();
      this._slots.push(slot);
      this._available.push(slot);
    }

    // Pre-allocate tick buffer for zero-alloc iteration
    this._tickBuffer = new Array(size) as TweenSlot[];
  }

  /**
   * Claim an available slot from the pool.
   * The slot is removed from the available pool and marked as active.
   *
   * @param options - Tween configuration
   * @returns A configured {@link TweenSlot} ready to use
   * @throws If the pool is exhausted (no available slots)
   * @since 1.0.0
   */
  claim(options: TweenOptions<TweenableValue>): TweenSlot {
    if (this._available.length === 0) {
      throw new Error('[GWEN] TweenPool exhausted: no available slots. Increase pool size.');
    }

    const slot = this._available.pop()!;
    slot._configure(options);
    this._active.add(slot);
    return slot;
  }

  /**
   * Release an active slot back to the pool.
   * The slot is reset to a clean state and returned to the available pool.
   *
   * @param slot - The slot to release
   * @since 1.0.0
   */
  release(slot: TweenSlot): void {
    if (this._active.has(slot)) {
      this._active.delete(slot);
      slot._reset();
      this._available.push(slot);
    }
  }

  /**
   * Current number of active (claimed) slots.
   * Useful for monitoring pool usage.
   *
   * @readonly
   * @since 1.0.0
   */
  get activeCount(): number {
    return this._active.size;
  }

  /**
   * Advance all active slots by `dt`.
   * Called automatically by {@link TweenManager.tick} each frame.
   *
   * **Zero-Allocation:**
   * Uses a pre-allocated buffer — no heap allocation per frame.
   * Copies active slots into the buffer, then iterates the buffer.
   * This allows onComplete callbacks to safely call release() without
   * corrupting Set iteration.
   *
   * @param dt - Time delta in seconds
   * @internal
   */
  tick(dt: number): void {
    // Copy active slots into pre-allocated buffer, then iterate buffer.
    // This allows onComplete callbacks to safely call release() without
    // corrupting Set iteration.
    let count = 0;
    for (const slot of this._active) {
      this._tickBuffer[count++] = slot;
    }
    for (let i = 0; i < count; i++) {
      this._tickBuffer[i]!.tick(dt);
    }
  }
}
