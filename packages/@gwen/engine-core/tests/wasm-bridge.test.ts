/**
 * WasmBridge tests
 *
 * Le WASM est obligatoire — les méthodes du bridge throw si non initialisé.
 * Les tests avec mock utilisent _injectMockWasmEngine().
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getWasmBridge,
  _injectMockWasmEngine,
  _resetWasmBridge,
  type WasmBridge,
  type WasmEngine,
  type WasmEntityId,
} from '../src/wasm-bridge';
import { Engine } from '../src/engine';

// ── Mock helper ───────────────────────────────────────────────────────────────

function createMockEngine(): WasmEngine {
  return {
    create_entity: vi.fn((): WasmEntityId => ({ index: 0, generation: 0 })),
    delete_entity: vi.fn(() => true),
    is_alive: vi.fn(() => true),
    count_entities: vi.fn(() => 0),
    register_component_type: vi.fn(() => 0),
    add_component: vi.fn(() => true),
    remove_component: vi.fn(() => true),
    has_component: vi.fn(() => false),
    get_component_raw: vi.fn(() => new Uint8Array(0)),
    update_entity_archetype: vi.fn(),
    query_entities: vi.fn(() => new Uint32Array(0)),
    get_entity_generation: vi.fn(() => 0),
    tick: vi.fn(),
    frame_count: vi.fn(() => BigInt(1)),
    delta_time: vi.fn(() => 0.016),
    total_time: vi.fn(() => 1.0),
    stats: vi.fn(() => '{"entities":0,"frame":1}'),
  };
}

// ── Sans WASM (non initialisé) ────────────────────────────────────────────────

describe('WasmBridge — non initialisé', () => {
  beforeEach(() => _resetWasmBridge());

  it('isActive() returns false', () => {
    expect(getWasmBridge().isActive()).toBe(false);
  });

  it('engine() throws', () => {
    expect(() => getWasmBridge().engine()).toThrow('WASM');
  });

  it('createEntity() throws', () => {
    expect(() => getWasmBridge().createEntity()).toThrow('WASM');
  });

  it('deleteEntity() throws', () => {
    expect(() => getWasmBridge().deleteEntity(0, 0)).toThrow('WASM');
  });

  it('isAlive() throws', () => {
    expect(() => getWasmBridge().isAlive(0, 0)).toThrow('WASM');
  });

  it('countEntities() throws', () => {
    expect(() => getWasmBridge().countEntities()).toThrow('WASM');
  });

  it('registerComponentType() throws', () => {
    expect(() => getWasmBridge().registerComponentType()).toThrow('WASM');
  });

  it('addComponent() throws', () => {
    expect(() => getWasmBridge().addComponent(0, 0, 0, new Uint8Array(4))).toThrow('WASM');
  });

  it('tick() throws', () => {
    expect(() => getWasmBridge().tick(16)).toThrow('WASM');
  });

  it('stats() throws', () => {
    expect(() => getWasmBridge().stats()).toThrow('WASM');
  });
});

// ── Avec mock injecté ─────────────────────────────────────────────────────────

describe('WasmBridge — avec mock injecté', () => {
  let bridge: WasmBridge;
  let mock: WasmEngine;

  beforeEach(() => {
    _resetWasmBridge();
    mock = createMockEngine();
    _injectMockWasmEngine(mock);
    bridge = getWasmBridge();
  });

  afterEach(() => _resetWasmBridge());

  it('isActive() returns true', () => {
    expect(bridge.isActive()).toBe(true);
  });

  it('engine() returns the mock', () => {
    expect(bridge.engine()).toBe(mock);
  });

  it('createEntity() delegates to mock', () => {
    const id = bridge.createEntity();
    expect(mock.create_entity).toHaveBeenCalled();
    expect(id).toEqual({ index: 0, generation: 0 });
  });

  it('deleteEntity() delegates to mock', () => {
    bridge.deleteEntity(0, 0);
    expect(mock.delete_entity).toHaveBeenCalledWith(0, 0);
  });

  it('isAlive() delegates to mock', () => {
    bridge.isAlive(0, 0);
    expect(mock.is_alive).toHaveBeenCalledWith(0, 0);
  });

  it('registerComponentType() delegates to mock', () => {
    const id = bridge.registerComponentType();
    expect(mock.register_component_type).toHaveBeenCalled();
    expect(id).toBe(0);
  });

  it('addComponent() delegates to mock', () => {
    const data = new Uint8Array([1, 2, 3]);
    bridge.addComponent(0, 0, 1, data);
    expect(mock.add_component).toHaveBeenCalledWith(0, 0, 1, data);
  });

  it('removeComponent() delegates to mock', () => {
    bridge.removeComponent(0, 0, 1);
    expect(mock.remove_component).toHaveBeenCalledWith(0, 0, 1);
  });

  it('hasComponent() delegates to mock', () => {
    bridge.hasComponent(0, 0, 1);
    expect(mock.has_component).toHaveBeenCalledWith(0, 0, 1);
  });

  it('getComponentRaw() delegates to mock', () => {
    bridge.getComponentRaw(0, 0, 1);
    expect(mock.get_component_raw).toHaveBeenCalledWith(0, 0, 1);
  });

  it('updateEntityArchetype() passes Uint32Array to mock', () => {
    bridge.updateEntityArchetype(0, [1, 2, 3]);
    expect(mock.update_entity_archetype).toHaveBeenCalledWith(0, new Uint32Array([1, 2, 3]));
  });

  it('queryEntities() returns packed EntityIds from mock', () => {
    (mock.query_entities as ReturnType<typeof vi.fn>).mockReturnValueOnce(new Uint32Array([0, 1, 2]));
    // get_entity_generation retourne 0 pour tous → packed = (0 << 20) | index = index
    const result = bridge.queryEntities([0]);
    expect(result).toEqual([0, 1, 2]); // generation=0 → packed === index
  });

  it('tick() delegates to mock', () => {
    bridge.tick(16.5);
    expect(mock.tick).toHaveBeenCalledWith(16.5);
  });

  it('stats() returns mock stats string', () => {
    const s = bridge.stats();
    expect(s).toBe('{"entities":0,"frame":1}');
  });
});

// ── Singleton ─────────────────────────────────────────────────────────────────

describe('WasmBridge — singleton', () => {
  it('getWasmBridge() toujours la même instance', () => {
    _resetWasmBridge();
    const a = getWasmBridge();
    const b = getWasmBridge();
    expect(a).toBe(b);
  });

  it('_resetWasmBridge() remet isActive() à false', () => {
    _injectMockWasmEngine(createMockEngine());
    expect(getWasmBridge().isActive()).toBe(true);
    _resetWasmBridge();
    expect(getWasmBridge().isActive()).toBe(false);
  });
});

// ── Intégration Engine ────────────────────────────────────────────────────────

describe('Engine — WASM bridge integration', () => {
  beforeEach(() => {
    _resetWasmBridge();
    _injectMockWasmEngine(createMockEngine());
  });
  afterEach(() => _resetWasmBridge());

  it('getWasmBridge() accessible depuis Engine', () => {
    const engine = new Engine({ maxEntities: 100 });
    expect(engine.getWasmBridge()).toBe(getWasmBridge());
    engine.stop();
  });

  it('getStats() wasmActive: true avec mock', () => {
    const engine = new Engine({ maxEntities: 100 });
    expect(engine.getStats().wasmActive).toBe(true);
    engine.stop();
  });

  it('start() throw si WASM non initialisé', () => {
    _resetWasmBridge();
    const engine = new Engine({ maxEntities: 100 });
    expect(() => engine.start()).toThrow('WASM');
    engine.stop();
  });

  it('bridge tick est appelé à chaque tick engine (via mock tick)', () => {
    const mock = createMockEngine();
    _resetWasmBridge();
    _injectMockWasmEngine(mock);
    const engine = new Engine({ maxEntities: 100 });
    // On simule un tick interne
    (engine as any).tick(performance.now());
    expect(mock.tick).toHaveBeenCalled();
    engine.stop();
  });
});

