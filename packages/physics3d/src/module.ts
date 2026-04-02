/**
 * @file GWEN Module for @gwenengine/physics3d.
 *
 * Default export — register this in `modules` inside `gwen.config.ts`:
 *
 * ```ts
 * import physics3d from '@gwenengine/physics3d/module'
 * export default defineConfig({ modules: [physics3d()] })
 * ```
 */

import { defineGwenModule, definePluginTypes } from '@gwenengine/kit';
import { Physics3DPlugin } from './index.js';
import type { Physics3DConfig } from './types.js';

/**
 * GWEN module for the Physics 3D plugin.
 */
export default defineGwenModule<Physics3DConfig>({
  defaults: {
    gravity: { x: 0, y: -9.81, z: 0 },
  },
  async setup(options, kit) {
    kit.addPlugin(Physics3DPlugin(options));

    kit.addAutoImports([{ name: 'usePhysics3D', from: '@gwenengine/physics3d' }]);

    kit.addTypeTemplate({
      filename: 'physics3d.d.ts',
      getContents: () =>
        definePluginTypes({
          imports: ["import type { Physics3DAPI } from '@gwenengine/physics3d'"],
          provides: { physics3d: 'Physics3DAPI' },
          hooks: {
            'physics3d:step': '(stepDt: number) => void',
            'physics3d:collisionStart': '(entityA: EntityId, entityB: EntityId) => void',
            'physics3d:collisionEnd': '(entityA: EntityId, entityB: EntityId) => void',
          },
        }),
    });
  },
});
