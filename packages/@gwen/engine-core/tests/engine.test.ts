/**
 * Engine Integration Tests
 *
 * Tous les tests utilisent un mock du WasmEngine injecté via _injectMockWasmEngine().
 * Il n'existe plus de fallback TS — le WASM est obligatoire.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Engine, getEngine, useEngine, resetEngine } from '../src/engine';
import { _injectMockWasmEngine, _resetWasmBridge } from '../src/wasm-bridge';
import type { WasmEngine, WasmEntityId } from '../src/wasm-bridge';

// ── Mock WasmEngine ───────────────────────────────────────────────────────────

/** Crée un WasmEngine mock complet avec état interne minimal. */
function createMockWasmEngine(): WasmEngine {
  let nextIndex = 0;
  const entities = new Map<number, number>(); // index → generation
  const components = new Map<string, Uint8Array>(); // `${index}:${typeId}` → bytes
  const archetypes = new Map<number, number[]>(); // index → typeIds[]
  let nextTypeId = 0;

  return {
    create_entity: vi.fn((): WasmEntityId => {
      const index = nextIndex++;
      entities.set(index, 0);
      return { index, generation: 0 };
    }),
    delete_entity: vi.fn((index, generation): boolean => {
      if (entities.get(index) !== generation) return false;
      entities.delete(index);
      archetypes.delete(index);
      return true;
    }),
    is_alive: vi.fn((index, generation): boolean => entities.get(index) === generation),
    count_entities: vi.fn((): number => entities.size),

    register_component_type: vi.fn((): number => nextTypeId++),
    add_component: vi.fn((index, generation, typeId, data): boolean => {
      if (entities.get(index) !== generation) return false;
      components.set(`${index}:${typeId}`, data);
      return true;
    }),
    remove_component: vi.fn((index, generation, typeId): boolean => {
      if (entities.get(index) !== generation) return false;
      return components.delete(`${index}:${typeId}`);
    }),
    has_component: vi.fn((index, generation, typeId): boolean => {
      if (entities.get(index) !== generation) return false;
      return components.has(`${index}:${typeId}`);
    }),
    get_component_raw: vi.fn((index, generation, typeId): Uint8Array => {
      if (entities.get(index) !== generation) return new Uint8Array(0);
      return components.get(`${index}:${typeId}`) ?? new Uint8Array(0);
    }),
    update_entity_archetype: vi.fn((index, typeIds: Uint32Array) => {
      archetypes.set(index, Array.from(typeIds));
    }),
    remove_entity_from_query: vi.fn((index: number) => {
      archetypes.delete(index);
    }),
    query_entities: vi.fn((typeIds: Uint32Array): Uint32Array => {
      const needed = Array.from(typeIds);
      const result: number[] = [];
      for (const [index] of entities) {
        const arch = archetypes.get(index) ?? [];
        if (needed.every(t => arch.includes(t))) result.push(index);
      }
      return new Uint32Array(result);
    }),
    get_entity_generation: vi.fn((index: number): number => {
      return entities.get(index) ?? 0xFFFFFFFF;
    }),

    tick: vi.fn(),
    frame_count: vi.fn(() => BigInt(0)),
    delta_time: vi.fn(() => 0.016),
    total_time: vi.fn(() => 0),
    stats: vi.fn(() => '{"entities":0}'),
  };
}

// ── Setup global ──────────────────────────────────────────────────────────────

describe('Engine', () => {
  let engine: Engine;
  let mock: WasmEngine;

  beforeEach(() => {
    _resetWasmBridge();
    mock = createMockWasmEngine();
    _injectMockWasmEngine(mock);
    resetEngine();
    engine = new Engine({ maxEntities: 1000, targetFPS: 60 });
  });

  afterEach(() => {
    engine.stop();
    resetEngine();
    _resetWasmBridge();
  });

  // ============= Lifecycle =============

  describe('Lifecycle', () => {
    it('should create engine instance', () => {
      expect(engine).toBeDefined();
      expect(engine).toBeInstanceOf(Engine);
    });

    it('should have correct config', () => {
      const config = engine.getConfig();
      expect(config.maxEntities).toBe(1000);
      expect(config.targetFPS).toBe(60);
    });

    it('should not be running initially', () => {
      expect(engine.getStats().isRunning).toBe(false);
    });

    it('should stop cleanly', () => {
      engine.stop();
      expect(engine.getStats().isRunning).toBe(false);
    });

    it('should reject invalid config', () => {
      expect(() => new Engine({ maxEntities: 50 })).toThrow('maxEntities');
    });

    it('should throw if start() called without WASM initialized', () => {
      _resetWasmBridge(); // retire le mock
      const e = new Engine({ maxEntities: 100 });
      expect(() => e.start()).toThrow('WASM');
    });
  });

  // ============= Entity Management =============

  describe('Entity Management', () => {
    it('should create entities with unique IDs', () => {
      const e1 = engine.createEntity();
      const e2 = engine.createEntity();
      const e3 = engine.createEntity();
      expect(e1).not.toBe(e2);
      expect(e2).not.toBe(e3);
      expect(e1).not.toBe(e3);
    });

    it('should track entity existence correctly', () => {
      const e = engine.createEntity();
      expect(engine.entityExists(e)).toBe(true);
    });

    it('should destroy entity and update existence', () => {
      const e = engine.createEntity();
      expect(engine.entityExists(e)).toBe(true);
      expect(engine.destroyEntity(e)).toBe(true);
      expect(engine.entityExists(e)).toBe(false);
    });

    it('should return false destroying non-existent entity', () => {
      const e = engine.createEntity();
      engine.destroyEntity(e);
      expect(engine.destroyEntity(e)).toBe(false);
    });

    it('should track entity count accurately', () => {
      expect(engine.getEntityCount()).toBe(0);
      const e1 = engine.createEntity();
      const e2 = engine.createEntity();
      expect(engine.getEntityCount()).toBe(2);
      engine.destroyEntity(e1);
      expect(engine.getEntityCount()).toBe(1);
      engine.destroyEntity(e2);
      expect(engine.getEntityCount()).toBe(0);
    });

    it('should prevent create entity beyond capacity', () => {
      _resetWasmBridge();
      const limitedMock = createMockWasmEngine();
      let count = 0;
      limitedMock.create_entity = vi.fn(() => {
        if (count >= 100) throw new Error('[ECS] Entity capacity exceeded (max: 100)');
        return { index: count++, generation: 0 };
      });
      _injectMockWasmEngine(limitedMock);
      const small = new Engine({ maxEntities: 100 });
      for (let i = 0; i < 100; i++) small.createEntity();
      expect(() => small.createEntity()).toThrow('capacity exceeded');
      small.stop();
    });
  });

  // ============= Component Management =============

  describe('Component Management', () => {
    let entityId: number;

    beforeEach(() => {
      entityId = engine.createEntity();
    });

    it('should add and retrieve a component', () => {
      engine.addComponent(entityId, 'position', { x: 100, y: 200 });
      const pos = engine.getComponent<{ x: number; y: number }>(entityId, 'position');
      expect(pos).toEqual({ x: 100, y: 200 });
    });

    it('should return undefined for missing component', () => {
      expect(engine.getComponent(entityId, 'position')).toBeUndefined();
    });

    it('should check hasComponent correctly', () => {
      expect(engine.hasComponent(entityId, 'position')).toBe(false);
      engine.addComponent(entityId, 'position', { x: 0, y: 0 });
      expect(engine.hasComponent(entityId, 'position')).toBe(true);
    });

    it('should update component data', () => {
      engine.addComponent(entityId, 'velocity', { vx: 1, vy: 0 });
      engine.addComponent(entityId, 'velocity', { vx: 5, vy: 3 });
      expect(engine.getComponent(entityId, 'velocity')).toEqual({ vx: 5, vy: 3 });
    });

    it('should remove component', () => {
      engine.addComponent(entityId, 'health', { hp: 100 });
      expect(engine.removeComponent(entityId, 'health')).toBe(true);
      expect(engine.hasComponent(entityId, 'health')).toBe(false);
    });

    it('should remove all components when entity is destroyed', () => {
      engine.addComponent(entityId, 'position', { x: 0, y: 0 });
      engine.addComponent(entityId, 'velocity', { vx: 1, vy: 0 });
      engine.destroyEntity(entityId);
      expect(engine.getEntityCount()).toBe(0);
    });

    it('should isolate components between entities', () => {
      const e2 = engine.createEntity();
      engine.addComponent(entityId, 'position', { x: 10, y: 10 });
      engine.addComponent(e2, 'position', { x: 99, y: 99 });
      expect(engine.getComponent(entityId, 'position')).toEqual({ x: 10, y: 10 });
      expect(engine.getComponent(e2, 'position')).toEqual({ x: 99, y: 99 });
    });
  });

  // ============= Query System =============

  describe('Query System', () => {
    it('should query entities with matching component', () => {
      const e1 = engine.createEntity();
      const e2 = engine.createEntity();
      const e3 = engine.createEntity();

      engine.addComponent(e1, 'position', {});
      engine.addComponent(e2, 'position', {});
      engine.addComponent(e2, 'velocity', {});

      const withPos = engine.query(['position']);
      expect(withPos).toContain(e1);
      expect(withPos).toContain(e2);
      expect(withPos).not.toContain(e3);
    });

    it('should require ALL components for multi-component query', () => {
      const e1 = engine.createEntity();
      const e2 = engine.createEntity();

      engine.addComponent(e1, 'position', {});
      engine.addComponent(e1, 'velocity', {});
      engine.addComponent(e2, 'position', {});

      const results = engine.query(['position', 'velocity']);
      expect(results).toContain(e1);
      expect(results).not.toContain(e2);
    });

    it('should return empty array when no matches', () => {
      engine.createEntity();
      const results = engine.query(['position']);
      expect(results).toHaveLength(0);
    });

    it('should update query results after component change', () => {
      const e = engine.createEntity();
      expect(engine.query(['position'])).not.toContain(e);
      engine.addComponent(e, 'position', { x: 0, y: 0 });
      expect(engine.query(['position'])).toContain(e);
      engine.removeComponent(e, 'position');
      expect(engine.query(['position'])).not.toContain(e);
    });
  });

  // ============= Event System =============

  describe('Event System', () => {
    it('should fire stop event', () => {
      let called = false;
      engine.on('stop', () => { called = true; });
      engine.stop();
      expect(called).toBe(true);
    });

    it('should remove listener with off()', () => {
      let callCount = 0;
      const listener = () => callCount++;
      engine.on('stop', listener);
      engine.off('stop', listener);
      engine.stop();
      expect(callCount).toBe(0);
    });

    it('should fire entityCreated event', () => {
      let created = false;
      engine.on('entityCreated', () => { created = true; });
      engine.createEntity();
      expect(created).toBe(true);
    });
  });

  // ============= Plugin System =============

  describe('Plugin System (TsPlugin lifecycle)', () => {
    it('should call onInit when plugin is registered', () => {
      let initCalled = false;
      engine.registerSystem({ name: 'test', onInit: () => { initCalled = true; } });
      expect(initCalled).toBe(true);
    });

    it('should receive EngineAPI in onInit', () => {
      let apiReceived = false;
      engine.registerSystem({ name: 'test', onInit: (api) => { apiReceived = api !== undefined; } });
      expect(apiReceived).toBe(true);
    });

    it('should not register same plugin twice', () => {
      let initCount = 0;
      const plugin = { name: 'dup', onInit: () => { initCount++; } };
      engine.registerSystem(plugin);
      engine.registerSystem(plugin);
      expect(initCount).toBe(1);
    });

    it('should support chaining registerSystem', () => {
      const result = engine.registerSystem({ name: 'p1' }).registerSystem({ name: 'p2' });
      expect(result).toBe(engine);
    });

    it('should call onDestroy when stopped', () => {
      let destroyed = false;
      engine.registerSystem({ name: 'test', onDestroy: () => { destroyed = true; } });
      engine.stop();
      expect(destroyed).toBe(true);
    });
  });

  // ============= Legacy Plugin API =============

  describe('Legacy Plugin API', () => {
    it('should load plugin and call init', () => {
      let initCalled = false;
      engine.loadPlugin('legacy', { init: () => { initCalled = true; } });
      expect(initCalled).toBe(true);
      expect(engine.hasPlugin('legacy')).toBe(true);
    });

    it('should retrieve loaded plugin', () => {
      const plugin = { name: 'old', version: '1.0.0' };
      engine.loadPlugin('old', plugin);
      expect(engine.getPlugin('old')).toBe(plugin);
    });
  });

  // ============= Statistics =============

  describe('Statistics', () => {
    it('should return correct stats shape', () => {
      const stats = engine.getStats();
      expect(stats).toHaveProperty('fps');
      expect(stats).toHaveProperty('frameCount');
      expect(stats).toHaveProperty('deltaTime');
      expect(stats).toHaveProperty('entityCount');
      expect(stats).toHaveProperty('isRunning');
      expect(stats).toHaveProperty('wasmActive');
    });

    it('should report wasmActive: true when mock injected', () => {
      expect(engine.getStats().wasmActive).toBe(true);
    });

    it('should update entityCount in stats', () => {
      engine.createEntity();
      engine.createEntity();
      expect(engine.getStats().entityCount).toBe(2);
    });
  });

  // ============= Global Instance =============

  describe('Global Instance', () => {
    it('getEngine() returns a singleton', () => {
      resetEngine();
      const a = getEngine();
      const b = getEngine();
      expect(a).toBe(b);
    });

    it('useEngine() returns the initialized engine', () => {
      resetEngine();
      getEngine();
      const e = useEngine();
      expect(e).toBeInstanceOf(Engine);
    });

    it('useEngine() throws if not initialized', () => {
      resetEngine();
      expect(() => useEngine()).toThrow('not initialized');
    });
  });
});
