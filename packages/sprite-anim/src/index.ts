import { definePlugin } from '@gwenengine/kit';
import type { EntityId, GwenEngine, GwenPluginMeta } from '@gwenengine/kit';
import { SpriteAnimRuntime } from './runtime';
import type {
  SpriteAnimPluginConfig,
  SpriteAnimPluginHooks,
  SpriteAnimUIExtension,
  SpriteAnimatorService,
} from './types';

export { createSpriteAnimSystem } from './systems';
export type {
  SpriteAnimClip,
  SpriteAnimCondition,
  SpriteAnimConditionOperator,
  SpriteAnimController,
  SpriteAnimControllerState,
  SpriteAnimDrawOptions,
  SpriteAnimFrameGrid,
  SpriteAnimParamType,
  SpriteAnimParamValue,
  SpriteAnimParameterDefinition,
  SpriteAnimPluginConfig,
  SpriteAnimPluginHooks,
  SpriteAnimPlayOptions,
  SpriteAnimState,
  SpriteAnimTickOptions,
  SpriteAnimTransition,
  SpriteAnimUIExtension,
  SpriteAnimatorService,
} from './types';

export const pluginMeta: GwenPluginMeta = {
  serviceTypes: {
    animator: { from: '@gwenengine/gwen-plugin-sprite-anim', exportName: 'SpriteAnimatorService' },
  },
  hookTypes: {
    'spriteAnim:complete': {
      from: '@gwenengine/gwen-plugin-sprite-anim',
      exportName: 'SpriteAnimPluginHooks',
    },
    'spriteAnim:frame': {
      from: '@gwenengine/gwen-plugin-sprite-anim',
      exportName: 'SpriteAnimPluginHooks',
    },
    'spriteAnim:transition': {
      from: '@gwenengine/gwen-plugin-sprite-anim',
      exportName: 'SpriteAnimPluginHooks',
    },
  },
  uiExtensionTypes: {
    spriteAnim: {
      from: '@gwenengine/gwen-plugin-sprite-anim',
      exportName: 'SpriteAnimUIExtension',
    },
  },
};

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
    name: '@gwenengine/sprite-anim',
    meta: pluginMeta,

    setup(engine: GwenEngine): void {
      _engine = engine;
      runtime = new SpriteAnimRuntime(
        {
          events: {
            onFrame(entityId, clip, state, frameCursor, frameIndex) {
              void (_engine?.hooks as any)?.callHook(
                'spriteAnim:frame',
                entityId,
                clip,
                state,
                frameCursor,
                frameIndex,
              );
            },
            onComplete(entityId, clip, state) {
              void (_engine?.hooks as any)?.callHook('spriteAnim:complete', entityId, clip, state);
            },
            onTransition(entityId, fromState, toState) {
              void (_engine?.hooks as any)?.callHook(
                'spriteAnim:transition',
                entityId,
                fromState,
                toState,
              );
            },
          },
          logger: debug ? undefined : { warn: () => {} },
        },
        { maxFrameAdvancesPerEntity: config.maxFrameAdvancesPerEntity },
      );

      (engine as any).provide('animator', service);

      engine.hooks.hook(
        'ui:extensions' as any,
        (uiName: unknown, entityId: unknown, extensions: unknown) => {
          const ext = (extensions as Record<string, unknown>)?.spriteAnim as
            | SpriteAnimUIExtension
            | undefined;
          if (!ext) return;
          runtime.attach(uiName as string, entityId as EntityId, ext);
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

// ─── Module, composables & type augmentations ─────────────────────────────────
export * from './augment.js';
export { useSpriteAnim } from './composables.js';
export { default } from './module.js';
