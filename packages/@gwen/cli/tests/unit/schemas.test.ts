/**
 * Unit tests for validation schemas
 */

import { describe, it, expect } from 'vitest';
import {
  PortSchema,
  SafePathSchema,
  BuildModeSchema,
  EngineConfigSchema,
  HtmlConfigSchema,
  GwenConfigSchema,
} from '../../src/utils/validation.js';

describe('PortSchema', () => {
  it('should accept valid ports', () => {
    expect(PortSchema.parse('3000')).toBe(3000);
    expect(PortSchema.parse(8080)).toBe(8080);
    expect(PortSchema.parse('65535')).toBe(65535);
  });

  it('should reject privileged ports', () => {
    expect(() => PortSchema.parse('80')).toThrow('Port must be >= 1024');
    expect(() => PortSchema.parse('443')).toThrow('Port must be >= 1024');
  });

  it('should reject out of range ports', () => {
    expect(() => PortSchema.parse('999')).toThrow('Port must be >= 1024');
    expect(() => PortSchema.parse('99999')).toThrow('Port must be <= 65535');
  });

  it('should coerce strings to numbers', () => {
    expect(PortSchema.parse('3000')).toBe(3000);
    expect(PortSchema.parse('5173')).toBe(5173);
  });
});

describe('SafePathSchema', () => {
  it('should accept safe paths', () => {
    expect(SafePathSchema.parse('src')).toBe('src');
    expect(SafePathSchema.parse('src/components')).toBe('src/components');
    expect(SafePathSchema.parse('./src')).toBe('./src');
  });

  it('should reject path traversal attempts', () => {
    expect(() => SafePathSchema.parse('../etc')).toThrow('traversal');
    expect(() => SafePathSchema.parse('src/../../etc')).toThrow('traversal');
    expect(() => SafePathSchema.parse('../../password')).toThrow('traversal');
  });

  it('should reject empty paths', () => {
    expect(() => SafePathSchema.parse('')).toThrow('cannot be empty');
  });
});

describe('BuildModeSchema', () => {
  it('should accept valid modes', () => {
    expect(BuildModeSchema.parse('release')).toBe('release');
    expect(BuildModeSchema.parse('debug')).toBe('debug');
  });

  it('should default to release', () => {
    expect(BuildModeSchema.parse(undefined)).toBe('release');
  });

  it('should reject invalid modes', () => {
    expect(() => BuildModeSchema.parse('production')).toThrow();
    expect(() => BuildModeSchema.parse('development')).toThrow();
  });
});

describe('EngineConfigSchema', () => {
  it('should accept valid engine config', () => {
    const config = { maxEntities: 10000, targetFPS: 60, debug: false };
    expect(EngineConfigSchema.parse(config)).toMatchObject(config);
  });

  it('should apply defaults', () => {
    const result = EngineConfigSchema.parse({});
    expect(result.maxEntities).toBe(10_000);
    expect(result.targetFPS).toBe(60);
    expect(result.debug).toBe(false);
  });

  it('should reject maxEntities below minimum', () => {
    expect(() => EngineConfigSchema.parse({ maxEntities: 50 })).toThrow('at least 100');
  });

  it('should reject targetFPS below minimum', () => {
    expect(() => EngineConfigSchema.parse({ targetFPS: 20 })).toThrow('at least 30');
  });

  it('should reject targetFPS above maximum', () => {
    expect(() => EngineConfigSchema.parse({ targetFPS: 300 })).toThrow('cannot exceed 240');
  });
});

describe('HtmlConfigSchema', () => {
  it('should accept valid html config', () => {
    const config = { title: 'My Game', background: '#ffffff' };
    expect(HtmlConfigSchema.parse(config)).toMatchObject(config);
  });

  it('should apply defaults', () => {
    const result = HtmlConfigSchema.parse({});
    expect(result.title).toBe('GWEN Project');
    expect(result.background).toBe('#000000');
  });

  it('should accept 3-digit hex colors', () => {
    expect(HtmlConfigSchema.parse({ background: '#fff' })).toBeDefined();
    expect(HtmlConfigSchema.parse({ background: '#abc' })).toBeDefined();
  });

  it('should accept 6-digit hex colors', () => {
    expect(HtmlConfigSchema.parse({ background: '#ffffff' })).toBeDefined();
    expect(HtmlConfigSchema.parse({ background: '#123456' })).toBeDefined();
  });

  it('should reject invalid hex colors', () => {
    expect(() => HtmlConfigSchema.parse({ background: 'red' })).toThrow('valid hex');
    expect(() => HtmlConfigSchema.parse({ background: '#gggggg' })).toThrow('valid hex');
    expect(() => HtmlConfigSchema.parse({ background: '#12345' })).toThrow('valid hex');
  });
});

describe('GwenConfigSchema', () => {
  it('should accept minimal valid config', () => {
    const config = { engine: {} };
    expect(GwenConfigSchema.parse(config)).toBeDefined();
  });

  it('should parse full config', () => {
    const config = {
      engine: { maxEntities: 5000, targetFPS: 120 },
      html: { title: 'Test Game', background: '#1a1a1a' },
      plugins: [],
      scenes: ['scene1', 'scene2'],
    };
    const result = GwenConfigSchema.parse(config);
    expect(result.engine.maxEntities).toBe(5000);
    expect(result.html?.title).toBe('Test Game');
    expect(result.plugins).toHaveLength(0);
  });

  it('should apply plugin defaults', () => {
    const config = { engine: {} };
    const result = GwenConfigSchema.parse(config);
    expect(result.plugins).toEqual([]);
    expect(result.scenes).toEqual([]);
  });
});
