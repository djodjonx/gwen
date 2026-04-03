// packages/core/src/scene/define-prefab.ts
import type { PrefabComponentEntry, PrefabDefinition } from './types.js';

/**
 * Declares the ECS component layout for an actor.
 *
 * Providing a prefab lets GWEN know the component layout at setup time,
 * enabling batched ECS processing (cache-friendly SoA iteration) instead
 * of per-instance tracking.
 *
 * @param components - Component definitions with their default values.
 * @returns A frozen {@link PrefabDefinition} with `__prefabName__` set to
 *   `'anonymous'` (the Vite transform will inject the real variable name at
 *   build time).
 *
 * @example
 * ```typescript
 * export const EnemyPrefab = definePrefab([
 *   { def: Position, defaults: { x: 0, y: 0 } },
 *   { def: Health,   defaults: { hp: 100 } },
 * ]);
 * ```
 */
export function definePrefab(components: PrefabComponentEntry[]): PrefabDefinition {
  return Object.freeze({
    __prefabName__: 'anonymous',
    components: [...components],
  });
}
