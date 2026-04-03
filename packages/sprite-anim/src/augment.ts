/**
 * @file GwenProvides and GwenRuntimeHooks augmentations for @gwenjs/sprite-anim.
 *
 * Importing any symbol from `@gwenjs/sprite-anim` automatically augments
 * `@gwenjs/core` with a typed sprite animator service key and plugin hooks.
 */

import type {
  SpriteAnimatorService,
  SpriteAnimPluginHooks,
  SpriteAnimUIExtension,
} from './types.js';
import type { EntityId } from '@gwenjs/core';

declare module '@gwenjs/core' {
  /**
   * Sprite animator service slot in the engine's provide/inject registry.
   * Available after `engine.use(SpriteAnimPlugin())` completes setup.
   *
   * @example
   * ```typescript
   * const anim = engine.inject('animator') // typed as SpriteAnimatorService
   * ```
   */
  interface GwenProvides {
    animator: SpriteAnimatorService;
  }

  /**
   * Sprite animation runtime hooks augmenting the engine hook bus.
   * Includes spriteAnim:frame, spriteAnim:complete, and spriteAnim:transition.
   */
  interface GwenRuntimeHooks extends SpriteAnimPluginHooks {
    /**
     * Fired by UIManager when a UIDefinition with extensions is first mounted
     * on an entity. Sprite-anim subscribes to this hook to attach animation
     * controllers declared in the UI extension block.
     *
     * This is a partial redeclaration of the hook from `@gwenjs/schema` /
     * `@gwenjs/ui`, restricted to the shape that sprite-anim cares about.
     * The `extensions` map may carry a `spriteAnim` key with
     * `SpriteAnimUIExtension` data.
     */
    'ui:extensions': (
      uiName: string,
      entityId: EntityId,
      extensions: Readonly<
        Partial<Record<string, unknown>> & { spriteAnim?: SpriteAnimUIExtension }
      >,
    ) => void;
  }
}

export {};
