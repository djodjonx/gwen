import { definePlugin } from '@gwenjs/kit';
import type { EntityId, GwenEngine } from '@gwenjs/kit';
import { SpriteAnimRuntime } from './runtime';
import type {
  SpriteAnimPluginConfig,
  SpriteAnimUIExtension,
  SpriteAnimatorService,
} from '../types';
import '../augment';

export const SpriteAnimPlugin = definePlugin((config: SpriteAnimPluginConfig = {}) => {
  const autoUpdate = config.autoUpdate ?? true;
  const debug = config.debug ?? false;
  const fixedDelta = config.fixedDelta;
  const maxSubSteps = Math.max(1, Math.floor(config.maxSubSteps ?? 8));

  let accumulator = 0;
  let _engine: GwenEngine | null = null;

  let runtime = new SpriteAnimRuntime(
    { logger: debug ? undefined : { warn: () => {} } },
    { maxFrameAdvancesPerEntity: config.maxFrameAdvancesPerEntity },
  );

  const service: SpriteAnimatorService = {
    attach(uiName: string, entityId: EntityId, extension: SpriteAnimUIExtension) {
      runtime.attach(uiName, entityId, extension);
    },
    detach(entityId) {
      runtime.detach(entityId);
    },
    has(entityId) {
      return runtime.has(entityId);
    },
    tick(deltaTime, options) {
      runtime.tick(deltaTime, options);
    },
    draw(ctx, entityId, x, y, options) {
      return runtime.draw(ctx, entityId, x, y, options);
    },
    play(entityId, clip, options) {
      return runtime.play(entityId, clip, options);
    },
    setState(entityId, state, options) {
      return runtime.setState(entityId, state, options);
    },
    setParam(entityId, name, value) {
      return runtime.setParam(entityId, name, value);
    },
    getParam(entityId, name) {
      return runtime.getParam(entityId, name);
    },
    setTrigger(entityId, name) {
      return runtime.setTrigger(entityId, name);
    },
    resetTrigger(entityId, name) {
      return runtime.resetTrigger(entityId, name);
    },
    pause(entityId) {
      runtime.pause(entityId);
    },
    resume(entityId) {
      runtime.resume(entityId);
    },
    stop(entityId) {
      runtime.stop(entityId);
    },
    setSpeed(entityId, speed) {
      runtime.setSpeed(entityId, speed);
    },
    setVisible(entityId, visible) {
      runtime.setVisible(entityId, visible);
    },
    setCulled(entityId, culled) {
      runtime.setCulled(entityId, culled);
    },
    isCulled(entityId) {
      return runtime.isCulled(entityId);
    },
    getState(entityId) {
      return runtime.getState(entityId);
    },
    clear() {
      runtime.clear();
    },
  };

  return {
    name: '@gwenjs/sprite-anim',

    setup(engine: GwenEngine): void {
      _engine = engine;
      runtime = new SpriteAnimRuntime(
        {
          events: {
            onFrame(entityId, clip, state, frameCursor, frameIndex) {
              void _engine?.hooks.callHook(
                'spriteAnim:frame',
                entityId,
                clip,
                state,
                frameCursor,
                frameIndex,
              );
            },
            onComplete(entityId, clip, state) {
              void _engine?.hooks.callHook('spriteAnim:complete', entityId, clip, state);
            },
            onTransition(entityId, fromState, toState) {
              void _engine?.hooks.callHook('spriteAnim:transition', entityId, fromState, toState);
            },
          },
          logger: debug ? undefined : { warn: () => {} },
        },
        { maxFrameAdvancesPerEntity: config.maxFrameAdvancesPerEntity },
      );

      engine.provide('animator', service);

      engine.hooks.hook(
        'ui:extensions',
        (uiName: string, entityId: EntityId, extensions: Readonly<Partial<unknown>>) => {
          const ext = (extensions as Record<string, unknown>)?.spriteAnim as
            | SpriteAnimUIExtension
            | undefined;
          if (!ext) return;
          runtime.attach(uiName, entityId, ext);
        },
      );

      engine.hooks.hook('entity:destroy', (entityId: EntityId) => {
        runtime.detach(entityId);
      });
    },

    onUpdate(dt: number): void {
      if (!autoUpdate) return;

      if (!fixedDelta || fixedDelta <= 0) {
        runtime.tick(dt);
        return;
      }

      accumulator += dt;
      let steps = 0;
      while (accumulator >= fixedDelta && steps < maxSubSteps) {
        runtime.tick(fixedDelta);
        accumulator -= fixedDelta;
        steps += 1;
      }

      if (steps >= maxSubSteps) {
        accumulator = 0;
      }
    },

    teardown(): void {
      runtime.clear();
      accumulator = 0;
      _engine = null;
    },
  };
});

export function spriteAnim(config: SpriteAnimPluginConfig = {}) {
  return SpriteAnimPlugin(config);
}
