/**
 * Unit tests for validation schemas
 * Tests Zod validation with various inputs
 */

import { describe, it, expect } from 'vitest';
import {
  GwenConfigSchema,
  EngineConfigSchema,
  HtmlConfigSchema,
} from '../../src/utils/validation.js';

describe('EngineConfigSchema', () => {
  it('should accept valid engine config', () => {
    const config = { maxEntities: 10000, targetFPS: 60, debug: false };
    expect(() => EngineConfigSchema.parse(config)).not.toThrow();
  });

  it('should apply defaults', () => {
    const result = EngineConfigSchema.parse({});
    expect(result.maxEntities).toBe(10_000);
    expect(result.targetFPS).toBe(60);
    expect(result.debug).toBe(false);
  });

  it('should reject maxEntities below minimum', () => {
    const config = { maxEntities: 50 };
    expect(() => EngineConfigSchema.parse(config)).toThrow('at least 100');
  });

  it('should reject targetFPS below minimum', () => {
    const config = { targetFPS: 20 };
    expect(() => EngineConfigSchema.parse(config)).toThrow('at least 30');
  });

  it('should reject targetFPS above maximum', () => {
    const config = { targetFPS: 300 };
    expect(() => EngineConfigSchema.parse(config)).toThrow('cannot exceed 240');
  });

  it('should reject non-integer maxEntities', () => {
    const config = { maxEntities: 10000.5 };
    expect(() => EngineConfigSchema.parse(config)).toThrow();
  });
});

describe('HtmlConfigSchema', () => {
  it('should accept valid html config', () => {
    const config = { title: 'My Game', background: '#ffffff' };
    expect(() => HtmlConfigSchema.parse(config)).not.toThrow();
  });

  it('should apply defaults', () => {
    const result = HtmlConfigSchema.parse({});
    expect(result.title).toBe('GWEN Project');
    expect(result.background).toBe('#000000');
  });

  it('should accept 3-digit hex color', () => {
    const config = { background: '#fff' };
    expect(() => HtmlConfigSchema.parse(config)).not.toThrow();
  });

  it('should accept 6-digit hex color', () => {
    const config = { background: '#ffffff' };
    expect(() => HtmlConfigSchema.parse(config)).not.toThrow();
  });

  it('should reject invalid hex color', () => {
    const config = { background: 'red' };
    expect(() => HtmlConfigSchema.parse(config)).toThrow('valid hex');
  });

  it('should reject invalid hex format', () => {
    const config = { background: '#gggggg' };
    expect(() => HtmlConfigSchema.parse(config)).toThrow('valid hex');
  });
});

describe('GwenConfigSchema', () => {
  it('should accept minimal valid config', () => {
    const config = { engine: {} };
    expect(() => GwenConfigSchema.parse(config)).not.toThrow();
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
  });

  it('should apply plugin defaults', () => {
    const config = { engine: {} };
    const result = GwenConfigSchema.parse(config);
    expect(result.plugins).toEqual([]);
    expect(result.scenes).toEqual([]);
  });
});
