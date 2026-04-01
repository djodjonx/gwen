// packages/@gwenengine/cli/tests/unit/setup-runner.test.ts
import { describe, it, expect } from 'vitest';
import { runPluginSetups, GwenSetupError } from '../../src/core/setup/setup-runner.js';

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
        setup: (ctx: any) => ctx.logger.error('oops'),
      },
    });

    const config = { plugins: [{ name: 'my-plugin' }] };
    await expect(runPluginSetups('.', config as any, importer)).rejects.toThrow(GwenSetupError);
  });

  it("continue si le module setup n'existe pas", async () => {
    const importer = makeImporter({}); // rien n'existe
    const config = { plugins: [{ name: 'ghost-plugin' }] };
    await expect(runPluginSetups('.', config as any, importer)).resolves.toBeUndefined();
  });

  it('utilise plugin.packageName si présent', async () => {
    let importedId = '';
    const importer = async (id: string) => {
      importedId = id;
      return { setup: () => {} };
    };

    const config = {
      plugins: [{ name: 'alias', packageName: '@scoped/real-name' }],
    };
    await runPluginSetups('.', config as any, importer);
    expect(importedId).toBe('@scoped/real-name/setup');
  });
});
