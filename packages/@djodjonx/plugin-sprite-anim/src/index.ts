import { definePlugin } from '@djodjonx/gwen-kit';
import type { EntityId, GwenPluginMeta } from '@djodjonx/gwen-kit';
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
    animator: { from: '@djodjonx/gwen-plugin-sprite-anim', exportName: 'SpriteAnimatorService' },
  },
  hookTypes: {
    'spriteAnim:complete': {
      from: '@djodjonx/gwen-plugin-sprite-anim',
      exportName: 'SpriteAnimPluginHooks',
    },
    'spriteAnim:frame': {
      from: '@djodjonx/gwen-plugin-sprite-anim',
      exportName: 'SpriteAnimPluginHooks',
    },
    'spriteAnim:transition': {
      from: '@djodjonx/gwen-plugin-sprite-anim',
      exportName: 'SpriteAnimPluginHooks',
    },
  },
  uiExtensionTypes: {
    spriteAnim: {
      from: '@djodjonx/gwen-plugin-sprite-anim',
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
    name: 'SpriteAnimPlugin',
    meta: pluginMeta,
    provides: { animator: {} as SpriteAnimatorService },
    providesHooks: {} as SpriteAnimPluginHooks,

    onInit(api): void {
      runtime = new SpriteAnimRuntime(
        {
          events: {
            onFrame(entityId, clip, state, frameCursor, frameIndex) {
              void api.hooks.callHook(
                'spriteAnim:frame',
                entityId,
                clip,
                state,
                frameCursor,
                frameIndex,
              );
            },
            onComplete(entityId, clip, state) {
              void api.hooks.callHook('spriteAnim:complete', entityId, clip, state);
            },
            onTransition(entityId, fromState, toState) {
              void api.hooks.callHook('spriteAnim:transition', entityId, fromState, toState);
            },
          },
          logger: debug ? undefined : { warn: () => {} },
        },
        { maxFrameAdvancesPerEntity: config.maxFrameAdvancesPerEntity },
      );

      api.services.register('animator', service);

      api.hooks.hook('ui:extensions', (uiName, entityId, extensions) => {
        const ext = extensions?.spriteAnim as SpriteAnimUIExtension | undefined;
        if (!ext) return;
        runtime.attach(uiName, entityId, ext);
      });

      api.hooks.hook('entity:destroy', (entityId) => {
        runtime.detach(entityId);
      });
    },

    onUpdate(_api, dt): void {
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

    onDestroy(): void {
      runtime.clear();
      accumulator = 0;
    },
  };
});

export function spriteAnim(config: SpriteAnimPluginConfig = {}) {
  return new SpriteAnimPlugin(config);
}
