/**
 * Type Definitions and Validation Tests
 */

import { describe, it, expect } from 'vitest';
import type {
  EngineConfig,
  EntityId,
  Component,
  Transform,
  Color,
  Sprite,
  Vector2D,
  EngineStats,
  Plugin,
} from '../src/types';

describe('Types', () => {
  describe('EntityId', () => {
    it('should be a number', () => {
      const id: EntityId = 12345;
      expect(typeof id).toBe('number');
    });
  });

  describe('Vector2D', () => {
    it('should have x and y', () => {
      const v: Vector2D = { x: 10, y: 20 };
      expect(v.x).toBe(10);
      expect(v.y).toBe(20);
    });

    it('should support arithmetic', () => {
      const v1: Vector2D = { x: 10, y: 20 };
      const v2: Vector2D = { x: 5, y: 10 };

      const result: Vector2D = {
        x: v1.x + v2.x,
        y: v1.y + v2.y,
      };

      expect(result.x).toBe(15);
      expect(result.y).toBe(30);
    });
  });

  describe('Color', () => {
    it('should have RGBA components', () => {
      const color: Color = { r: 1, g: 0.5, b: 0, a: 1 };
      expect(color.r).toBe(1);
      expect(color.g).toBe(0.5);
      expect(color.b).toBe(0);
      expect(color.a).toBe(1);
    });

    it('should support color constants', () => {
      const red: Color = { r: 1, g: 0, b: 0, a: 1 };
      const green: Color = { r: 0, g: 1, b: 0, a: 1 };
      const blue: Color = { r: 0, g: 0, b: 1, a: 1 };

      expect(red.r).toBe(1);
      expect(green.g).toBe(1);
      expect(blue.b).toBe(1);
    });
  });

  describe('Transform', () => {
    it('should have position', () => {
      const t: Transform = { x: 100, y: 200, rotation: 0 };
      expect(t.x).toBe(100);
      expect(t.y).toBe(200);
    });

    it('should have optional scale', () => {
      const t: Transform = {
        x: 50,
        y: 50,
        rotation: 0,
        scaleX: 2,
        scaleY: 2,
      };

      expect(t.scaleX).toBe(2);
      expect(t.scaleY).toBe(2);
    });
  });

  describe('Sprite', () => {
    it('should have dimensions', () => {
      const sprite: Sprite = {
        width: 32,
        height: 32,
      };

      expect(sprite.width).toBe(32);
      expect(sprite.height).toBe(32);
    });

    it('should have optional color', () => {
      const sprite: Sprite = {
        width: 64,
        height: 64,
        color: { r: 1, g: 0, b: 0, a: 1 },
        opacity: 0.8,
      };

      expect(sprite.color?.r).toBe(1);
      expect(sprite.opacity).toBe(0.8);
    });
  });

  describe('Component', () => {
    it('should have type and data', () => {
      const component: Component = {
        type: 'transform',
        data: { x: 100, y: 100 },
      };

      expect(component.type).toBe('transform');
      expect(component.data.x).toBe(100);
    });
  });

  describe('EngineConfig', () => {
    it('should have required fields', () => {
      const config: EngineConfig = {
        maxEntities: 5000,
        canvas: 'game-canvas',
        width: 1280,
        height: 720,
        targetFPS: 60,
      };

      expect(config.maxEntities).toBe(5000);
      expect(config.width).toBe(1280);
      expect(config.height).toBe(720);
      expect(config.targetFPS).toBe(60);
    });

    it('should have optional fields', () => {
      const config: EngineConfig = {
        maxEntities: 5000,
        canvas: 'game-canvas',
        width: 1280,
        height: 720,
        targetFPS: 60,
        debug: true,
        enableStats: true,
        plugins: [],
      };

      expect(config.debug).toBe(true);
      expect(config.enableStats).toBe(true);
      expect(config.plugins).toEqual([]);
    });

    it('should accept canvas string or element', () => {
      // Test with string (most common)
      const config1: EngineConfig = {
        maxEntities: 5000,
        canvas: 'my-canvas',
        width: 1280,
        height: 720,
        targetFPS: 60,
      };

      expect(config1.canvas).toBe('my-canvas');
      // Note: HTMLCanvasElement type is checked at compile time
    });
  });;

  describe('EngineStats', () => {
    it('should have all stats fields', () => {
      const stats: EngineStats = {
        fps: 60,
        frameCount: 1000,
        deltaTime: 0.016,
        entityCount: 50,
        isRunning: true,
      };

      expect(stats.fps).toBe(60);
      expect(stats.frameCount).toBe(1000);
      expect(stats.deltaTime).toBeCloseTo(0.016);
      expect(stats.entityCount).toBe(50);
      expect(stats.isRunning).toBe(true);
    });
  });

  describe('Plugin', () => {
    it('should have name and version', () => {
      const plugin: Plugin = {
        name: 'my-plugin',
        version: '1.0.0',
      };

      expect(plugin.name).toBe('my-plugin');
      expect(plugin.version).toBe('1.0.0');
    });

    it('should have optional methods', () => {
      const plugin: Plugin = {
        name: 'my-plugin',
        version: '1.0.0',
        init: (engine: any) => console.log('initialized'),
        update: (dt: number) => console.log('updating'),
        destroy: () => console.log('destroyed'),
      };

      expect(typeof plugin.init).toBe('function');
      expect(typeof plugin.update).toBe('function');
      expect(typeof plugin.destroy).toBe('function');
    });
  });

  describe('Type Safety', () => {
    it('should enforce type constraints', () => {
      // This test verifies TypeScript compilation - no runtime check needed
      const color: Color = { r: 1, g: 0, b: 0, a: 1 };
      const sprite: Sprite = { width: 32, height: 32, color };
      const transform: Transform = { x: 0, y: 0, rotation: 0 };

      expect(color.r).toBe(1);
      expect(sprite.width).toBe(32);
      expect(transform.x).toBe(0);
    });
  });
});

