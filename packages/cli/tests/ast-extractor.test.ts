/**
 * Unit tests for the AST extractor helper functions.
 *
 * These tests exercise the two recently-fixed code paths:
 *   1. `extractSchemaFromFactory` — block-body arrow functions with `return { schema: ... }`
 *   2. `extractSystemsFromSceneFactory` — `engine.use(SystemName)` detection in defineScene
 *
 * Tests spin up a real ts-morph `Project` in memory so no `.wasm` or build output is needed.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { extractProjectMetadata } from '../src/core/prepare/ast-extractor.js';
import * as path from 'node:path';
import * as fs from 'node:fs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal temporary project directory that ts-morph can analyse.
 *
 * @param id - Unique suffix appended to the temp directory name (avoid collisions between parallel tests)
 * @param files - Map of relative paths (under `src/`) to file contents
 * @returns Absolute path to the project root
 */
function createTempProject(id: string, files: Record<string, string>): string {
  const dir = path.join(process.cwd(), `temp-ast-test-${id}`);
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(
    path.join(dir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { target: 'ESNext', module: 'ESNext' },
      include: ['src/**/*.ts'],
    }),
  );

  const srcDir = path.join(dir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });

  for (const [relativePath, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(srcDir, relativePath), content);
  }

  return dir;
}

/** Removes a previously created temp project directory. */
function removeTempProject(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ast-extractor', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      removeTempProject(dir);
    }
  });

  // -------------------------------------------------------------------------
  // extractSchemaFromFactory()
  // -------------------------------------------------------------------------

  describe('extractSchemaFromFactory()', () => {
    it('extracts schema from arrow expression body', () => {
      const dir = createTempProject('expr-body', {
        'Health.ts': `
          import { defineComponent, Types } from '@gwenjs/core';
          export const Health = defineComponent('Health', () => ({
            schema: { hp: Types.f32, maxHp: Types.f32 }
          }));
        `,
      });
      tempDirs.push(dir);

      const metadata = extractProjectMetadata(dir);

      expect(metadata.components.has('Health')).toBe(true);
      expect(metadata.components.get('Health')?.schema).toEqual({ hp: 'f32', maxHp: 'f32' });
    });

    it('extracts schema from block body with return statement', () => {
      const dir = createTempProject('block-body', {
        'Stamina.ts': `
          import { defineComponent, Types } from '@gwenjs/core';
          export const Stamina = defineComponent('Stamina', () => {
            return { schema: { value: Types.f32 } };
          });
        `,
      });
      tempDirs.push(dir);

      const metadata = extractProjectMetadata(dir);

      expect(metadata.components.has('Stamina')).toBe(true);
      expect(metadata.components.get('Stamina')?.schema).toEqual({ value: 'f32' });
    });

    it('extracts schema from block body with parenthesised return', () => {
      const dir = createTempProject('block-body-paren', {
        'Mana.ts': `
          import { defineComponent, Types } from '@gwenjs/core';
          export const Mana = defineComponent('Mana', () => {
            return ({ schema: { current: Types.f32, max: Types.f32 } });
          });
        `,
      });
      tempDirs.push(dir);

      const metadata = extractProjectMetadata(dir);

      expect(metadata.components.has('Mana')).toBe(true);
      expect(metadata.components.get('Mana')?.schema).toEqual({ current: 'f32', max: 'f32' });
    });

    it('returns no component entry for dynamic (non-static) schema factories', () => {
      // When the factory does not return a statically-analysable object literal,
      // the extractor must not register a component (schema would be undefined).
      const dir = createTempProject('dynamic-schema', {
        'Dynamic.ts': `
          import { defineComponent } from '@gwenjs/core';
          const buildSchema = () => ({ hp: 'f32' });
          export const Dynamic = defineComponent('Dynamic', () => {
            const s = buildSchema();
            return { schema: s };
          });
        `,
      });
      tempDirs.push(dir);

      const metadata = extractProjectMetadata(dir);

      // A dynamically computed schema cannot be statically extracted, so no entry is created.
      expect(metadata.components.has('Dynamic')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // extractSystemsFromSceneFactory()
  // -------------------------------------------------------------------------

  describe('extractSystemsFromSceneFactory()', () => {
    it('extracts system names from engine.use() calls in defineScene', () => {
      const dir = createTempProject('scene-systems', {
        'GameScene.ts': `
          import { defineScene } from '@gwenjs/core';
          import { PlayerSystem } from './PlayerSystem';
          import { EnemySystem } from './EnemySystem';
          export const GameScene = defineScene('GameScene', (engine) => {
            engine.use(PlayerSystem);
            engine.use(EnemySystem);
            return {};
          });
        `,
      });
      tempDirs.push(dir);

      const metadata = extractProjectMetadata(dir);

      expect(metadata.scenes.has('GameScene')).toBe(true);
      const scene = metadata.scenes.get('GameScene')!;
      expect(scene.systems).toContain('PlayerSystem');
      expect(scene.systems).toContain('EnemySystem');
      expect(scene.systems).toHaveLength(2);
    });

    it('handles defineScene with no engine.use() calls (returns empty array)', () => {
      const dir = createTempProject('scene-no-systems', {
        'EmptyScene.ts': `
          import { defineScene } from '@gwenjs/core';
          export const EmptyScene = defineScene('EmptyScene', () => {
            return {};
          });
        `,
      });
      tempDirs.push(dir);

      const metadata = extractProjectMetadata(dir);

      expect(metadata.scenes.has('EmptyScene')).toBe(true);
      expect(metadata.scenes.get('EmptyScene')?.systems).toEqual([]);
    });
  });
});
