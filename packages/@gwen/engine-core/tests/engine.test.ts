/**
 * Engine integration tests.
 *
 * All tests use a mock WasmEngine injected via _injectMockWasmEngine().
 * There is no TS-only fallback — WASM is mandatory.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Engine } from '../src/engine/engine';
import { getEngine, useEngine, resetEngine } from '../src/engine/engine-globals';
import { _injectMockWasmEngine, _resetWasmBridge } from '../src/engine/wasm-bridge';
import type { WasmEngine, WasmEntityId } from '../src/engine/wasm-bridge';
import { Types, defineComponent } from '../src/schema';

const Position = defineComponent('position', () => ({ schema: { x: Types.f32, y: Types.f32 } }));
const Velocity = defineComponent('velocity', () => ({ schema: { vx: Types.f32, vy: Types.f32 } }));
const Health = defineComponent('health', () => ({ schema: { hp: Types.f32 } }));

// ── Mock WasmEngine ───────────────────────────────────────────────────────────

/** Creates a complete WasmEngine mock with minimal internal state. */
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
      components.set(`${index}:${typeId}`, new Uint8Array(data));
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
        if (needed.every((t) => arch.includes(t))) result.push(index);
      }
      return new Uint32Array(result);
    }),
    get_entity_generation: vi.fn((index: number): number => {
      return entities.get(index) ?? 0xffffffff;
    }),

    tick: vi.fn(),
    frame_count: vi.fn(() => BigInt(0)),
    delta_time: vi.fn(() => 0.016),
    total_time: vi.fn(() => 0),
    alloc_shared_buffer: vi.fn(() => 4096),
    sync_transforms_to_buffer: vi.fn(),
    sync_transforms_from_buffer: vi.fn(),
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

    it('should throw if start() called without WASM initialized', async () => {
      _resetWasmBridge(); // retire le mock
      const e = new Engine({ maxEntities: 100 });
      await expect(e.start()).rejects.toThrow('WASM');
    });
  });

  // ============= Entity Management =============

  describe('Entity Management', () => {
    it('should create entities with unique IDs', async () => {
      const e1 = await engine.createEntity();
      const e2 = await engine.createEntity();
      const e3 = await engine.createEntity();
      expect(e1).not.toBe(e2);
      expect(e2).not.toBe(e3);
      expect(e1).not.toBe(e3);
    });

    it('should track entity existence correctly', async () => {
      const e = await engine.createEntity();
      expect(engine.entityExists(e)).toBe(true);
    });

    it('should destroy entity and update existence', async () => {
      const e = await engine.createEntity();
      expect(engine.entityExists(e)).toBe(true);
      expect(engine.destroyEntity(e)).toBe(true);
      expect(engine.entityExists(e)).toBe(false);
    });

    it('should return false destroying non-existent entity', async () => {
      const e = await engine.createEntity();
      engine.destroyEntity(e);
      expect(engine.destroyEntity(e)).toBe(false);
    });

    it('should track entity count accurately', async () => {
      expect(engine.getEntityCount()).toBe(0);
      const e1 = await engine.createEntity();
      const e2 = await engine.createEntity();
      expect(engine.getEntityCount()).toBe(2);
      engine.destroyEntity(e1);
      expect(engine.getEntityCount()).toBe(1);
      engine.destroyEntity(e2);
      expect(engine.getEntityCount()).toBe(0);
    });

    it('should prevent create entity beyond capacity', async () => {
      _resetWasmBridge();
      const limitedMock = createMockWasmEngine();
      let count = 0;
      limitedMock.create_entity = vi.fn(() => {
        if (count >= 100) throw new Error('[ECS] Entity capacity exceeded (max: 100)');
        return { index: count++, generation: 0 };
      });
      _injectMockWasmEngine(limitedMock);
      const small = new Engine({ maxEntities: 100 });
      for (let i = 0; i < 100; i++) await small.createEntity();
      await expect(small.createEntity()).rejects.toThrow('capacity exceeded');
      small.stop();
    });
  });

  // ============= Component Management =============

  describe('Component Management', () => {
    let entityId: number;

    beforeEach(async () => {
      entityId = await engine.createEntity();
    });

    it('should add and retrieve a component', () => {
      engine.addComponent(entityId, Position, { x: 100, y: 200 });
      const pos = engine.getComponent(entityId, Position);
      expect(pos).toEqual({ x: 100, y: 200 });
    });

    it('should return undefined for missing component', () => {
      expect(engine.getComponent(entityId, Position)).toBeUndefined();
    });

    it('should check hasComponent correctly', () => {
      expect(engine.hasComponent(entityId, Position)).toBe(false);
      engine.addComponent(entityId, Position, { x: 0, y: 0 });
      expect(engine.hasComponent(entityId, Position)).toBe(true);
    });

    it('should update component data', () => {
      engine.addComponent(entityId, Velocity, { vx: 1, vy: 0 });
      engine.addComponent(entityId, Velocity, { vx: 5, vy: 3 });
      expect(engine.getComponent(entityId, Velocity)).toEqual({ vx: 5, vy: 3 });
    });

    it('should remove component', () => {
      engine.addComponent(entityId, Health, { hp: 100 });
      expect(engine.removeComponent(entityId, Health)).toBe(true);
      expect(engine.hasComponent(entityId, Health)).toBe(false);
    });

    it('should remove all components when entity is destroyed', () => {
      engine.addComponent(entityId, Position, { x: 0, y: 0 });
      engine.addComponent(entityId, Velocity, { vx: 1, vy: 0 });
      engine.destroyEntity(entityId);
      expect(engine.getEntityCount()).toBe(0);
    });

    it('should isolate components between entities', async () => {
      const e2 = await engine.createEntity();
      engine.addComponent(entityId, Position, { x: 10, y: 10 });
      engine.addComponent(e2, Position, { x: 99, y: 99 });
      expect(engine.getComponent(entityId, Position)).toEqual({ x: 10, y: 10 });
      expect(engine.getComponent(e2, Position)).toEqual({ x: 99, y: 99 });
    });
  });

  // ============= Query System =============

  describe('Query System', () => {
    it('should query entities with matching component', async () => {
      const e1 = await engine.createEntity();
      const e2 = await engine.createEntity();
      const e3 = await engine.createEntity();

      engine.addComponent(e1, Position, { x: 0, y: 0 });
      engine.addComponent(e2, Position, { x: 0, y: 0 });
      engine.addComponent(e2, Velocity, { vx: 1, vy: 0 });

      const withPos = engine.query([Position.name]);
      expect(withPos).toContain(e1);
      expect(withPos).toContain(e2);
      expect(withPos).not.toContain(e3);
    });

    it('should require ALL components for multi-component query', async () => {
      const e1 = await engine.createEntity();
      const e2 = await engine.createEntity();

      engine.addComponent(e1, Position, { x: 0, y: 0 });
      engine.addComponent(e1, Velocity, { vx: 1, vy: 0 });
      engine.addComponent(e2, Position, { x: 0, y: 0 });

      const results = engine.query([Position.name, Velocity.name]);
      expect(results).toContain(e1);
      expect(results).not.toContain(e2);
    });

    it('should return empty array when no matches', async () => {
      await engine.createEntity();
      const results = engine.query([Position.name]);
      expect(results).toHaveLength(0);
    });

    it('should update query results after component change', async () => {
      const e = await engine.createEntity();
      expect(engine.query([Position.name])).not.toContain(e);
      engine.addComponent(e, Position, { x: 0, y: 0 });
      expect(engine.query([Position.name])).toContain(e);
      engine.removeComponent(e, Position);
      expect(engine.query([Position.name])).not.toContain(e);
    });
  });

  // ============= Event System =============

  describe('Event System', () => {
    it('should fire stop event', () => {
      let called = false;
      engine.hooks.hook('engine:stop', () => {
        called = true;
      });
      engine.stop();
      expect(called).toBe(true);
    });

    it('should remove listener with off()', () => {
      let callCount = 0;
      const listener = () => callCount++;
      engine.hooks.hook('engine:stop', listener);
      engine.hooks.removeHook('engine:stop', listener);
      engine.stop();
      expect(callCount).toBe(0);
    });

    it('should fire entityCreated event', () => {
      let created = false;
      engine.hooks.hook('entity:create', () => {
        created = true;
      });
      engine.createEntity();
      expect(created).toBe(true);
    });
  });

  // ============= Plugin System =============

  describe('Plugin System (TsPlugin lifecycle)', () => {
    it('should call onInit when plugin is registered', () => {
      let initCalled = false;
      engine.registerSystem({
        name: 'test',
        onInit: () => {
          initCalled = true;
        },
      });
      expect(initCalled).toBe(true);
    });

    it('should receive EngineAPI in onInit', () => {
      let apiReceived = false;
      engine.registerSystem({
        name: 'test',
        onInit: (api) => {
          apiReceived = api !== undefined;
        },
      });
      expect(apiReceived).toBe(true);
    });

    it('should not register same plugin twice', () => {
      let initCount = 0;
      const plugin = {
        name: 'dup',
        onInit: () => {
          initCount++;
        },
      };
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
      engine.registerSystem({
        name: 'test',
        onDestroy: () => {
          destroyed = true;
        },
      });
      engine.stop();
      expect(destroyed).toBe(true);
    });
  });

  // ============= Legacy Plugin API =============

  describe('Legacy Plugin API', () => {
    it('should load plugin and call init', () => {
      let initCalled = false;
      engine.loadPlugin('legacy', {
        init: () => {
          initCalled = true;
        },
      });
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
