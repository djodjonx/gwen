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
      typeReferences: ['@gwen/plugin-html-ui/vite-env'],
      serviceTypes: {
        keyboard: { from: '@gwen/plugin-input', exportName: 'KeyboardInput' },
      },
      hookTypes: {
        'physics:collision': { from: '@gwen/plugin-physics2d', exportName: 'CollisionHook' },
      },
    };

    const out = await generateDts(tmpDir, configPath, meta);

    expect(out).toContain("import type { KeyboardInput } from '@gwen/plugin-input';");
    expect(out).toContain("import type { CollisionHook } from '@gwen/plugin-physics2d';");
    expect(out).toContain('interface GwenDefaultServices extends _FallbackServices');
    expect(out).toContain('keyboard: KeyboardInput;');
    expect(out).toContain("'physics:collision': CollisionHook;");
    expect(out).not.toContain('[key: string]');
  });

  it('keeps fallback inference when no metadata is provided', async () => {
    const out = await generateDts(tmpDir, configPath);
    expect(out).toContain('type _FallbackServices = GwenConfigServices<typeof _cfg>;');
    expect(out).toContain('interface GwenDefaultServices extends _FallbackServices');
    expect(out).toContain('type GwenServices = GwenDefaultServices;');
  });
});
