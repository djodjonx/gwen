import { describe, it, expect } from 'vitest';
import { extractProjectMetadata } from '../../src/core/prepare/ast-extractor.js';
import * as path from 'node:path';
import fs from 'node:fs';

describe('AST Extractor & Validator', () => {
  it('extracts components from defineComponent calls', () => {
    // We need to create a real directory for ts-morph to work correctly with tsconfig
    const tempDir = path.join(process.cwd(), 'temp-test-project');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    fs.writeFileSync(
      path.join(tempDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { target: 'ESNext', module: 'ESNext' },
        include: ['src/**/*.ts'],
      }),
    );

    const srcDir = path.join(tempDir, 'src');
    if (!fs.existsSync(srcDir)) fs.mkdirSync(srcDir);

    fs.writeFileSync(
      path.join(srcDir, 'Component.ts'),
      `
      import { defineComponent, Types } from '@gwenjs/core';
      export const Position = defineComponent({
        name: 'Position',
        schema: {
          x: Types.f32,
          y: Types.f32
        }
      });
      
      export const Health = defineComponent('Health', () => ({
        schema: {
          current: Types.f32,
          max: Types.f32
        }
      }));
    `,
    );

    try {
      const metadata = extractProjectMetadata(tempDir);

      expect(metadata.components.has('Position')).toBe(true);
      expect(metadata.components.get('Position')?.schema).toEqual({ x: 'f32', y: 'f32' });

      expect(metadata.components.has('Health')).toBe(true);
      expect(metadata.components.get('Health')?.schema).toEqual({ current: 'f32', max: 'f32' });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('extracts systems and required components', () => {
    const tempDir = path.join(process.cwd(), 'temp-test-project-sys');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    fs.writeFileSync(
      path.join(tempDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { target: 'ESNext', module: 'ESNext' },
        include: ['src/**/*.ts'],
      }),
    );

    const srcDir = path.join(tempDir, 'src');
    if (!fs.existsSync(srcDir)) fs.mkdirSync(srcDir);

    fs.writeFileSync(
      path.join(srcDir, 'System.ts'),
      `
      import { defineSystem } from '@gwenjs/core';
      import { Position } from './Component';
      
      export const MoveSystem = defineSystem('MoveSystem', () => {
        return {
          onUpdate(api) {
            const entities = api.query([Position, Velocity]);
          }
        };
      });
    `,
    );

    try {
      const metadata = extractProjectMetadata(tempDir);

      expect(metadata.systems.has('MoveSystem')).toBe(true);
      const sys = metadata.systems.get('MoveSystem')!;
      expect(sys.requiredComponents).toContain('Position');
      expect(sys.requiredComponents).toContain('Velocity');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('extracts systems from object definition', () => {
    const tempDir = path.join(process.cwd(), 'temp-test-project-sys-obj');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    fs.writeFileSync(
      path.join(tempDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { target: 'ESNext', module: 'ESNext' },
        include: ['src/**/*.ts'],
      }),
    );

    const srcDir = path.join(tempDir, 'src');
    if (!fs.existsSync(srcDir)) fs.mkdirSync(srcDir);

    fs.writeFileSync(
      path.join(srcDir, 'System.ts'),
      `
      import { defineSystem } from '@gwenjs/core';
      export const ObjSystem = defineSystem({
        name: 'ObjSystem',
        onUpdate(api) {
          api.query([ComponentA]);
        }
      });
    `,
    );

    try {
      const metadata = extractProjectMetadata(tempDir);
      expect(metadata.systems.has('ObjSystem')).toBe(true);
      expect(metadata.systems.get('ObjSystem')?.requiredComponents).toContain('ComponentA');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('extracts scenes', () => {
    const tempDir = path.join(process.cwd(), 'temp-test-project-scene');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    fs.writeFileSync(
      path.join(tempDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { target: 'ESNext', module: 'ESNext' },
        include: ['src/**/*.ts'],
      }),
    );

    const srcDir = path.join(tempDir, 'src');
    if (!fs.existsSync(srcDir)) fs.mkdirSync(srcDir);

    fs.writeFileSync(
      path.join(srcDir, 'Scene.ts'),
      `
      import { defineScene } from '@gwenjs/core';
      export const MyScene = defineScene('MyScene', () => {
        return {
          systems: []
        };
      });
      
      export const OtherScene = defineScene({
        name: 'OtherScene'
      });
    `,
    );

    try {
      const metadata = extractProjectMetadata(tempDir);
      expect(metadata.scenes.has('MyScene')).toBe(true);
      expect(metadata.scenes.has('OtherScene')).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

});
