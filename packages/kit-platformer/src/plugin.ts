import { definePlugin } from '@gwenengine/kit';
import type { ComponentDefinition } from '@gwenengine/core';
import { Position } from './components/StandardComponents.js';

/**
 * Defines the components used by the Platformer Kit.
 */
export interface PlatformerKitComponents {
  /** The component used for 2D positioning. Must have x and y fields. */
  position: ComponentDefinition<any>;
}

/**
 * Configuration for the Platformer Kit.
 */
export interface PlatformerKitConfig {
  /** Global component overrides. */
  components?: Partial<PlatformerKitComponents>;
}

/**
 * Internal service to store Kit configuration.
 */
export interface PlatformerKitService {
  config: Required<PlatformerKitConfig>;
}

/**
 * PlatformerKitPlugin — provides global configuration for the platformer kit.
 *
 * This plugin allows you to override standard components used by the kit
 * (like Position) at the engine level.
 *
 * @example
 * ```ts
 * // gwen.config.ts
 * export default defineConfig({
 *   plugins: [
 *     new PlatformerKitPlugin({
 *       components: { position: MyAdvancedPosition }
 *     })
 *   ]
 * });
 * ```
 */
export const PlatformerKitPlugin = definePlugin((config: PlatformerKitConfig = {}) => {
  const resolvedConfig: Required<PlatformerKitConfig> = {
    components: {
      position: config.components?.position ?? Position,
    },
  };

  return {
    name: 'PlatformerKit',
    provides: {
      platformerKit: { config: resolvedConfig } as PlatformerKitService,
    },
  };
});

/**
 * Helper to resolve a component from local options, global config, or defaults.
 *
 * @internal
 */
export function resolveComponent<K extends keyof PlatformerKitComponents>(
  api: any,
  key: K,
  localOverrides?: Partial<PlatformerKitComponents>,
): PlatformerKitComponents[K] {
  // 1. Local override (highest priority)
  if (localOverrides?.[key]) {
    return localOverrides[key] as PlatformerKitComponents[K];
  }

  // 2. Global override via PlatformerKitPlugin
  if (api.services.has('platformerKit')) {
    const service = api.services.get('platformerKit') as PlatformerKitService;
    const component = service.config.components[key];
    if (component) {
      return component;
    }
  }

  // 3. Default (fallback)
  const defaults: PlatformerKitComponents = {
    position: Position,
  };

  return defaults[key];
}
