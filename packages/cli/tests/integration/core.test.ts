/**
 * Integration tests for core functions
 * Tests actual business logic
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { join } from 'pathe';
import os from 'node:os';
import { prepare, lint, format } from '../../src';

describe('Core functions integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(join(os.tmpdir(), 'gwen-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('prepare', () => {
    it('should create .gwen directory', async () => {
      // Create minimal config
      fs.writeFileSync(
        join(tmpDir, 'gwen.config.ts'),
        'export default { engine: { maxEntities: 1000 } };',
      );

      const result = await prepare({ projectDir: tmpDir });
      expect(result.success).toBe(true);
      expect(fs.existsSync(join(tmpDir, '.gwen'))).toBe(true);
    });

    it('should generate tsconfig.json', async () => {
      fs.writeFileSync(join(tmpDir, 'gwen.config.ts'), 'export default { engine: {} };');

      const result = await prepare({ projectDir: tmpDir });
      expect(result.success).toBe(true);
      expect(fs.existsSync(join(tmpDir, '.gwen', 'tsconfig.json'))).toBe(true);
    });

    it('should generate auto-imports.d.ts', async () => {
      fs.writeFileSync(join(tmpDir, 'gwen.config.ts'), 'export default { engine: {} };');

      const result = await prepare({ projectDir: tmpDir });
      expect(result.success).toBe(true);
      expect(fs.existsSync(join(tmpDir, '.gwen', 'types', 'auto-imports.d.ts'))).toBe(true);
    });

    it('should return list of generated files', async () => {
      fs.writeFileSync(join(tmpDir, 'gwen.config.ts'), 'export default { engine: {} };');

      const result = await prepare({ projectDir: tmpDir });
      expect(result.files.length).toBeGreaterThan(0);
      expect(result.files.some((f: string) => f.endsWith('auto-imports.d.ts'))).toBe(true);
    });
  });

  describe('lint', () => {
    it('should return success structure', async () => {
      const result = await lint({ path: '.' });
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('exitCode');
      expect(result).toHaveProperty('output');
    });

    it('should accept fix option', async () => {
      const result = await lint({ fix: true, path: '.' });
      expect(result).toBeDefined();
    });
  });

  describe('format', () => {
    it('should return success structure', async () => {
      const result = await format({ path: '.' });
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('exitCode');
      expect(result).toHaveProperty('output');
    });

    it('should accept check option', async () => {
      const result = await format({ check: true, path: '.' });
      expect(result).toBeDefined();
    });
  });
});
