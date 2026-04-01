import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Engine } from '../src/engine/engine';
import { _injectMockWasmEngine, _resetWasmBridge } from '../src/engine/wasm-bridge';
import type { WasmEngine, WasmEntityId } from '../src/engine/wasm-bridge';
import { SharedMemoryManager } from '../src/wasm/shared-memory';

function createMockWasmEngine(): WasmEngine {
  return {
    create_entity: vi.fn((): WasmEntityId => ({ index: 0, generation: 0 })),
    delete_entity: vi.fn(() => true),
    is_alive: vi.fn(() => true),
    count_entities: vi.fn(() => 0),
    register_component_type: vi.fn(() => 0),
    add_component: vi.fn(() => true),
    remove_component: vi.fn(() => true),
    has_component: vi.fn(() => true),
    get_component_raw: vi.fn(() => new Uint8Array(0)),
    update_entity_archetype: vi.fn(),
    remove_entity_from_query: vi.fn(),
    query_entities: vi.fn(() => new Uint32Array(0)),
    query_entities_to_buffer: vi.fn(() => 0),
    get_query_result_ptr: vi.fn(() => 0),
    get_entity_generation: vi.fn(() => 0),
    tick: vi.fn(),
    frame_count: vi.fn(() => BigInt(0)),
    delta_time: vi.fn(() => 0.016),
    total_time: vi.fn(() => 0),
    alloc_shared_buffer: vi.fn(() => 1024),
    sync_transforms_to_buffer: vi.fn(),
    sync_transforms_to_buffer_sparse: vi.fn(),
    dirty_transform_count: vi.fn(() => 0),
    clear_transform_dirty: vi.fn(),
    sync_transforms_from_buffer: vi.fn(),
    stats: vi.fn(() => '{}'),
  };
}

describe('Sparse Transform Sync (RFC-V2-004)', () => {
  let mock: WasmEngine;

  beforeEach(() => {
    _resetWasmBridge();
    mock = createMockWasmEngine();
    _injectMockWasmEngine(mock);
  });

  afterEach(() => {
    _resetWasmBridge();
  });

  it('should use sparse sync when enabled and dirtyCount > 0', async () => {
    const engine = new Engine({ sparseTransformSync: true });
    // Register a mock WASM plugin to trigger sync path
    engine._registerWasmPlugin({
      name: 'mock',
      wasm: { id: 'mock', onInit: async () => {} },
    } as any);

    const manager = SharedMemoryManager.create(engine.getWasmBridge(), 100);
    engine._setSharedMemoryPtr(manager.getTransformRegion().ptr, 100, manager);

    vi.mocked(mock.dirty_transform_count).mockReturnValue(5);

    await engine.tick(performance.now());

    expect(mock.sync_transforms_to_buffer_sparse).toHaveBeenCalled();
    expect(mock.clear_transform_dirty).toHaveBeenCalled();
    expect(mock.sync_transforms_to_buffer).not.toHaveBeenCalled();
  });

  it('should skip sync when enabled and dirtyCount is 0', async () => {
    const engine = new Engine({ sparseTransformSync: true });
    // Register a mock WASM plugin to trigger sync path
    engine._registerWasmPlugin({
      name: 'mock',
      wasm: { id: 'mock', onInit: async () => {} },
    } as any);

    const manager = SharedMemoryManager.create(engine.getWasmBridge(), 100);
    engine._setSharedMemoryPtr(manager.getTransformRegion().ptr, 100, manager);

    vi.mocked(mock.dirty_transform_count).mockReturnValue(0);

    await engine.tick(performance.now());

    expect(mock.sync_transforms_to_buffer_sparse).not.toHaveBeenCalled();
    expect(mock.sync_transforms_to_buffer).not.toHaveBeenCalled();
    expect(mock.clear_transform_dirty).not.toHaveBeenCalled();
  });

  it('should fallback to full sync when sparse sync is disabled', async () => {
    const engine = new Engine({ sparseTransformSync: false });
    // Register a mock WASM plugin to trigger sync path
    engine._registerWasmPlugin({
      name: 'mock',
      wasm: { id: 'mock', onInit: async () => {} },
    } as any);

    const manager = SharedMemoryManager.create(engine.getWasmBridge(), 100);
    engine._setSharedMemoryPtr(manager.getTransformRegion().ptr, 100, manager);

    await engine.tick(performance.now());

    expect(mock.sync_transforms_to_buffer).toHaveBeenCalled();
    expect(mock.sync_transforms_to_buffer_sparse).not.toHaveBeenCalled();
    expect(mock.clear_transform_dirty).not.toHaveBeenCalled();
  });

  it('should enable sparse sync by default', async () => {
    const engine = new Engine();
    // Register a mock WASM plugin to trigger sync path
    engine._registerWasmPlugin({
      name: 'mock',
      wasm: { id: 'mock', onInit: async () => {} },
    } as any);

    const manager = SharedMemoryManager.create(
      engine.getWasmBridge(),
      engine.getConfig().maxEntities,
    );
    engine._setSharedMemoryPtr(
      manager.getTransformRegion().ptr,
      engine.getConfig().maxEntities,
      manager,
    );

    vi.mocked(mock.dirty_transform_count).mockReturnValue(1);

    await engine.tick(performance.now());

    expect(mock.sync_transforms_to_buffer_sparse).toHaveBeenCalled();
  });
});
