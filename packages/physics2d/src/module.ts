/**
 * @file GWEN Module for @gwenengine/physics2d.
 *
 * Default export — register this in `modules` inside `gwen.config.ts`:
 *
 * ```ts
 * import physics2d from '@gwenengine/physics2d/module'
 * // or via top-level re-export:
 * import physics2d from '@gwenengine/physics2d'
 *
 * export default defineConfig({ modules: [physics2d()] })
 * ```
 */

import { defineGwenModule, definePluginTypes } from '@gwenengine/kit';
import { Physics2DPlugin } from './index.js';
import type { Physics2DConfig } from './types.js';

/**
 * GWEN module for the Physics 2D plugin.
 *
 * When installed via `gwen add @gwenengine/physics2d`, this module:
 * 1. Registers the physics2d runtime plugin.
 * 2. Adds `usePhysics2D`, `useRigidBody`, `useCollider` as auto-imports.
 * 3. Generates `.gwen/types/physics2d.d.ts` with typed service/hook declarations.
 */
export default defineGwenModule<Physics2DConfig>({
  defaults: {
    gravity: { x: 0, y: -9.81 },
  },
  async setup(options, kit) {
    kit.addPlugin(Physics2DPlugin(options));

    kit.addAutoImports([
      { name: 'usePhysics2D', from: '@gwenengine/physics2d' },
      { name: 'useRigidBody', from: '@gwenengine/physics2d' },
      { name: 'useCollider', from: '@gwenengine/physics2d' },
    ]);

    kit.addTypeTemplate({
      filename: 'physics2d.d.ts',
      getContents: () =>
        definePluginTypes({
          imports: ["import type { Physics2DAPI } from '@gwenengine/physics2d'"],
          provides: { physics2d: 'Physics2DAPI' },
          hooks: {
            'physics2d:step': '(stepDt: number) => void',
            'physics2d:collisionStart': '(entityA: EntityId, entityB: EntityId) => void',
            'physics2d:collisionEnd': '(entityA: EntityId, entityB: EntityId) => void',
          },
        }),
    });
  },
});
