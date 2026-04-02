// packages/@gwenjs/cli/tests/unit/setup-runner.test.ts
import { describe, it, expect } from 'vitest';
import { runPluginSetups, GwenSetupError } from '../../src/core/setup/setup-runner.js';
import type { GwenOptions } from '@gwenjs/schema';
import type { GwenPluginSetup, GwenModuleContext } from '../../src/core/setup/types.js';

const makeImporter =
  (modules: Record<string, unknown>) =>
  async (id: string): Promise<unknown> => {
    if (id in modules) return modules[id];
    throw Object.assign(new Error(`Not found: ${id}`), {
      code: 'ERR_MODULE_NOT_FOUND',
    });
  };

describe('runPluginSetups', () => {
  it('logger.error() → lance GwenSetupError avec pluginName et message', async () => {
    const importer = makeImporter({
      'my-plugin/setup': {
        setup: (ctx: GwenModuleContext) => ctx.logger.error('oops'),
      },
    });

    const config: GwenOptions = {
      engine: {
        maxEntities: 5000,
        targetFPS: 60,
        debug: false,
        enableStats: true,
        sparseTransformSync: true,
        loop: 'internal',
        maxDeltaSeconds: 0.1,
      },
      html: { title: 'Test', background: '#000000' },
      modules: [],
      plugins: [{ name: 'my-plugin' }],
      scenes: [],
      scenesMode: 'auto',
      srcDir: 'src',
      outDir: 'dist',
    };
    await expect(runPluginSetups('.', config, importer)).rejects.toThrow(GwenSetupError);
  });

  it("continue si le module setup n'existe pas", async () => {
    const importer = makeImporter({}); // rien n'existe
    const config: GwenOptions = {
      engine: {
        maxEntities: 5000,
        targetFPS: 60,
        debug: false,
        enableStats: true,
        sparseTransformSync: true,
        loop: 'internal',
        maxDeltaSeconds: 0.1,
      },
      html: { title: 'Test', background: '#000000' },
      modules: [],
      plugins: [{ name: 'ghost-plugin' }],
      scenes: [],
      scenesMode: 'auto',
      srcDir: 'src',
      outDir: 'dist',
    };
    await expect(runPluginSetups('.', config, importer)).resolves.toBeUndefined();
  });

  it('utilise plugin.packageName si présent', async () => {
    let importedId = '';
    const importer = async (id: string): Promise<GwenPluginSetup> => {
      importedId = id;
      return { setup: () => {} };
    };

    const config: GwenOptions = {
      engine: {
        maxEntities: 5000,
        targetFPS: 60,
        debug: false,
        enableStats: true,
        sparseTransformSync: true,
        loop: 'internal',
        maxDeltaSeconds: 0.1,
      },
      html: { title: 'Test', background: '#000000' },
      modules: [],
      plugins: [{ name: 'alias', packageName: '@scoped/real-name' }],
      scenes: [],
      scenesMode: 'auto',
      srcDir: 'src',
      outDir: 'dist',
    };
    await runPluginSetups('.', config, importer);
    expect(importedId).toBe('@scoped/real-name/setup');
  });
});
