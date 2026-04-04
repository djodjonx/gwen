// Re-exports: SpriteAnimPlugin definition and plugin factory
export { SpriteAnimPlugin, spriteAnim } from './plugin/index';

// Systems
export { createSpriteAnimSystem } from './systems';

// Types
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

// Module, composables & type augmentations
export * from './augment';
export { useSpriteAnim } from './composables';
