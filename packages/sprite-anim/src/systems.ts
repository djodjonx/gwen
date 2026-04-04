import type { GwenEngine, GwenPlugin, GwenProvides } from '@gwenjs/core';
import type { SpriteAnimatorService } from './types';
import './augment';

export interface SpriteAnimSystemOptions {
  /**
   * Service key to inject from the engine's provider registry.
   * Must be a key registered in `GwenProvides` (default: `'animator'`).
   * @default 'animator'
   */
  serviceName?: keyof GwenProvides & string;
  fixedDelta?: number;
  maxSubSteps?: number;
}

/**
 * Create a reusable plugin that drives the `SpriteAnimatorService` each frame.
 *
 * The system injects the animator service by the configured `serviceName` and
 * calls its `tick()` method on every `onUpdate`. Supports an optional
 * fixed-step accumulator for deterministic animation playback.
 *
 * @param options - Configuration options.
 * @returns A `GwenPlugin` ready to pass to `engine.use()`.
 *
 * @example
 * ```ts
 * engine.use(createSpriteAnimSystem());
 * // or with fixed-step:
 * engine.use(createSpriteAnimSystem({ fixedDelta: 16.67, maxSubSteps: 4 }));
 * ```
 */
export function createSpriteAnimSystem(options: SpriteAnimSystemOptions = {}): GwenPlugin {
  const serviceName = (options.serviceName ?? 'animator') as keyof GwenProvides;
  const fixedDelta = options.fixedDelta;
  const maxSubSteps = Math.max(1, Math.floor(options.maxSubSteps ?? 8));

  let accumulator = 0;
  let _animator: SpriteAnimatorService | undefined;

  return {
    name: 'SpriteAnimSystem',

    setup(engine: GwenEngine): void {
      _animator = engine.tryInject(serviceName) as SpriteAnimatorService | undefined;
    },

    onUpdate(dt: number): void {
      if (!_animator) return;

      if (!fixedDelta || fixedDelta <= 0) {
        _animator.tick(dt);
        return;
      }

      accumulator += dt;
      let steps = 0;
      while (accumulator >= fixedDelta && steps < maxSubSteps) {
        _animator.tick(fixedDelta);
        accumulator -= fixedDelta;
        steps += 1;
      }

      if (steps >= maxSubSteps) {
        accumulator = 0;
      }
    },
  };
}
