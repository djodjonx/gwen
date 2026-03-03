/**
 * Tests for defineSystem() — game system definition helper
 */

import { describe, it, expect } from 'vitest';
import { defineSystem } from '../src/plugin-system/system';
import type { SystemFactory } from '../src/plugin-system/system';

describe('defineSystem()', () => {
  describe('Form 1 — direct object', () => {
    it('should create a system from an object definition', () => {
      const TestSystem = defineSystem({
        name: 'TestSystem',
        onUpdate: () => {
          // no-op
        },
      });

      expect(TestSystem).toBeDefined();
      expect(TestSystem.name).toBe('TestSystem');
      expect(typeof TestSystem.onUpdate).toBe('function');
    });

    it('should support all lifecycle methods', () => {
      const FullSystem = defineSystem({
        name: 'FullSystem',
        onInit: () => {},
        onBeforeUpdate: () => {},
        onUpdate: () => {},
        onRender: () => {},
        onDestroy: () => {},
      });

      expect(FullSystem.onInit).toBeDefined();
      expect(FullSystem.onBeforeUpdate).toBeDefined();
      expect(FullSystem.onUpdate).toBeDefined();
      expect(FullSystem.onRender).toBeDefined();
      expect(FullSystem.onDestroy).toBeDefined();
    });

    it('should allow minimal definition (just name)', () => {
      const MinimalSystem = defineSystem({
        name: 'MinimalSystem',
      });

      expect(MinimalSystem.name).toBe('MinimalSystem');
      expect(MinimalSystem.onUpdate).toBeUndefined();
    });
  });

  describe('Form 2 — factory', () => {
    it('should create a system factory', () => {
      const CounterSystem = defineSystem('CounterSystem', () => {
        let count = 0;
        return {
          onInit() {
            count = 0;
          },
          onUpdate() {
            count++;
          },
          getCount() {
            return count;
          },
        };
      });

      expect(typeof CounterSystem).toBe('function');
      expect((CounterSystem as SystemFactory).systemName).toBe('CounterSystem');
    });

    it('should allow creating multiple independent instances', () => {
      const CounterSystem = defineSystem('CounterSystem', () => {
        let count = 0;
        return {
          onInit() {
            count = 0;
          },
          onUpdate() {
            count++;
          },
        };
      });

      const instance1 = (CounterSystem as SystemFactory)();
      const instance2 = (CounterSystem as SystemFactory)();

      expect(instance1).not.toBe(instance2);
      expect(instance1.name).toBe('CounterSystem');
      expect(instance2.name).toBe('CounterSystem');
    });

    it('should maintain separate state per instance', () => {
      let sharedCounter = 0;

      const TimerSystem = defineSystem('TimerSystem', () => {
        let localTimer = 0;
        return {
          onUpdate() {
            localTimer++;
            sharedCounter++;
          },
          getLocalTimer() {
            return localTimer;
          },
        };
      });

      const timer1 = (TimerSystem as SystemFactory)();
      const timer2 = (TimerSystem as SystemFactory)();

      // Simulate updates
      timer1.onUpdate?.();
      timer1.onUpdate?.();
      timer2.onUpdate?.();

      // Each instance should have separate count, but share outer scope
      expect(sharedCounter).toBe(3);
    });

    it('should support factory with arguments', () => {
      interface SpawnerConfig {
        spawnInterval: number;
      }

      const SpawnerSystem = defineSystem(
        'SpawnerSystem',
        (config: SpawnerConfig) => {
          let timer = 0;
          return {
            onUpdate() {
              timer += 1;
            },
            shouldSpawn() {
              return timer >= config.spawnInterval;
            },
          };
        },
      );

      const spawner = (SpawnerSystem as SystemFactory<[SpawnerConfig]>)({
        spawnInterval: 10,
      });

      expect(spawner.name).toBe('SpawnerSystem');
      expect(typeof spawner.onUpdate).toBe('function');
    });
  });

  describe('Type safety', () => {
    it('should enforce name property', () => {
      const system = defineSystem({
        name: 'TestSystem' as const,
        onUpdate: () => {},
      });

      const name: 'TestSystem' = system.name;
      expect(name).toBe('TestSystem');
    });

    it('should have systemName on factory', () => {
      const factory = defineSystem('MySystem', () => ({
        onUpdate: () => {},
      }));

      expect((factory as any).systemName).toBe('MySystem');
    });
  });
});
