import { definePlugin } from '@gwenjs/kit';
import type { GwenEngine } from '@gwenjs/kit';
import type { ComponentDefinition } from '@gwenjs/core';
import { Position } from './components/StandardComponents.js';
// Side-effect: augments GwenProvides with 'platformer' key, enabling typed provide/inject.
import './augment.js';

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

  const service: PlatformerKitService = { config: resolvedConfig };

  return {
    name: '@gwenjs/kit-platformer',
    setup(engine: GwenEngine): void {
      engine.provide('platformer', service);
    },
    teardown(): void {},
  };
});

/**
 * Helper to resolve a component from local options, global config, or defaults.
 *
 * @param api - Scene callback API providing access to registered services.
 * @param key - Component slot to resolve.
 * @param localOverrides - Optional scene-local component overrides.
 * @internal
 */
export function resolveComponent<K extends keyof PlatformerKitComponents>(
  api: import('./scene-utils.js').PrefabCallbackApi & {
    services?: import('./scene-utils.js').SceneCallbackApi['services'];
  },
  key: K,
  localOverrides?: Partial<PlatformerKitComponents>,
): PlatformerKitComponents[K] {
  // 1. Local override (highest priority)
  if (localOverrides?.[key]) {
    return localOverrides[key] as PlatformerKitComponents[K];
  }

  // 2. Global override via PlatformerKitPlugin
  if (api.services?.has('platformer')) {
    const service = api.services.get('platformer') as PlatformerKitService;
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
