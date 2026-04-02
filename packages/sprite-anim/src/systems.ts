import { defineSystem } from '@gwenjs/core';
import type { GwenEngine } from '@gwenjs/core';
import type { SpriteAnimatorService } from './types';

export interface SpriteAnimSystemOptions {
  serviceName?: string;
  fixedDelta?: number;
  maxSubSteps?: number;
}

export function createSpriteAnimSystem(options: SpriteAnimSystemOptions = {}) {
  const serviceName = options.serviceName ?? 'animator';
  const fixedDelta = options.fixedDelta;
  const maxSubSteps = Math.max(1, Math.floor(options.maxSubSteps ?? 8));

  let accumulator = 0;
  let _animator: SpriteAnimatorService | undefined;

  return defineSystem({
    name: 'SpriteAnimSystem' as const,
    setup(engine: GwenEngine): void {
      _animator = (engine as any).tryInject(serviceName) as SpriteAnimatorService | undefined;
    },
    onUpdate(_api: unknown, dt: number): void {
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
  } as any);
}
