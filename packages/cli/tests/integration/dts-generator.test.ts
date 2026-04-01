import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { join } from 'pathe';
import { generateDts } from '../../src/core/prepare/dts-generator.js';
import type { CollectedPluginTypingMeta } from '../../src/core/prepare/plugin-resolver.js';
import { makeTmpDir, writeConfig } from '../utils.js';

describe('dts generator', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    configPath = join(tmpDir, 'gwen.config.ts');
    writeConfig(tmpDir, 'export default defineConfig({ plugins: [] });\n', 'gwen.config.ts');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates direct imports and strict interfaces when metadata is provided', async () => {
    const meta: CollectedPluginTypingMeta = {
      typeReferences: ['@gwenengine/gwen-plugin-html-ui/vite-env'],
      serviceTypes: {
        keyboard: { from: '@gwenengine/input', exportName: 'KeyboardInput' },
      },
      hookTypes: {
        'physics:collision': {
          from: '@gwenengine/physics2d',
          exportName: 'CollisionHook',
        },
      },
      prefabExtensionTypes: {},
      sceneExtensionTypes: {},
      uiExtensionTypes: {},
    };

    const out = await generateDts(tmpDir, configPath, meta);

    expect(out).toContain("import type { KeyboardInput } from '@gwenengine/input';");
    expect(out).toContain("import type { CollisionHook } from '@gwenengine/physics2d';");
    expect(out).toContain('interface GwenDefaultServices {');
    expect(out).toContain('keyboard: KeyboardInput;');
    expect(out).toContain('interface GwenDefaultHooks extends CollisionHook');
    expect(out).not.toContain('[key: string]');
  });

  it('generates empty defaults when no metadata is provided', async () => {
    const out = await generateDts(tmpDir, configPath);
    expect(out).toContain('interface GwenDefaultServices {  }');
    expect(out).toContain('interface GwenDefaultHooks {  }');
    expect(out).toContain('type GwenServices = GwenDefaultServices;');
  });
});
