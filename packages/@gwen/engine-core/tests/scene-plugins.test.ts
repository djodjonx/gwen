import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Engine, SceneManager, type Scene, type TsPlugin } from '../src/index';
import { _injectMockWasmEngine, _resetWasmBridge } from '../src/wasm-bridge';

function makeMock() {
  return {
    create_entity: vi.fn(() => ({ index: 0, generation: 0 })),
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
    tick: vi.fn(),
    frame_count: vi.fn(() => BigInt(0)),
    delta_time: vi.fn(() => 0.016),
    total_time: vi.fn(() => 0),
    stats: vi.fn(() => '{}'),
  };
}

describe('SceneManager + Local Plugins', () => {
  beforeEach(() => {
    _resetWasmBridge();
    _injectMockWasmEngine(makeMock());
  });
  afterEach(() => _resetWasmBridge());

  it('should register and unregister scene local plugins on transition', () => {
    const engine = new Engine({ targetFPS: 60, maxEntities: 1000 });
    const scenes = new SceneManager();
    engine.registerSystem(scenes);

    const activePlugin: TsPlugin = {
      name: 'GameSystem',
      onInit: vi.fn(),
      onDestroy: vi.fn(),
    };

    const GameScene: Scene = {
      name: 'Game',
      plugins: [activePlugin],
      onEnter: vi.fn(),
      onExit: vi.fn(),
    };

    const MenuScene: Scene = {
      name: 'Menu',
      onEnter: vi.fn(),
      onExit: vi.fn(),
    };

    scenes.register(GameScene).register(MenuScene);

    // Initial state: plugin not loaded
    expect(engine.hasSystem('GameSystem')).toBe(false);

    // Enter Game scene
    scenes.loadSceneImmediate('Game', engine.getAPI());
    expect(engine.hasSystem('GameSystem')).toBe(true);
    expect(activePlugin.onInit).toHaveBeenCalled();

    // Leave Game scene -> Menu
    scenes.loadSceneImmediate('Menu', engine.getAPI());
    expect(engine.hasSystem('GameSystem')).toBe(false);
    expect(activePlugin.onDestroy).toHaveBeenCalled();
  });
});
