import { defineSystem } from '@djodjonx/gwen-engine-core';
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

  return defineSystem({
    name: 'SpriteAnimSystem' as const,
    onUpdate(api, dt) {
      const animator = api.services.get(serviceName) as SpriteAnimatorService | undefined;
      if (!animator) return;

      if (!fixedDelta || fixedDelta <= 0) {
        animator.tick(dt);
        return;
      }

      accumulator += dt;
      let steps = 0;
      while (accumulator >= fixedDelta && steps < maxSubSteps) {
        animator.tick(fixedDelta);
        accumulator -= fixedDelta;
        steps += 1;
      }

      if (steps >= maxSubSteps) {
        accumulator = 0;
      }
    },
  });
}
