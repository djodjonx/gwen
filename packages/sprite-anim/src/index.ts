// Re-exports: SpriteAnimPlugin definition and plugin factory
export { SpriteAnimPlugin, spriteAnim } from './plugin/index.js';

// Systems
export { createSpriteAnimSystem } from './systems.js';

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
} from './types.js';

// Module, composables & type augmentations
export * from './augment.js';
export { useSpriteAnim } from './composables.js';
