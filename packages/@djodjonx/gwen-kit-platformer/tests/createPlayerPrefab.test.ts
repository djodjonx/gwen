// packages/@djodjonx/gwen-kit-platformer/tests/createPlayerPrefab.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createPlayerPrefab } from '../src/prefabs/player.js';
import { PLATFORMER_CONTROLLER_DEFAULTS } from '../src/components/PlatformerController.js';

const makeApi = () => {
  const components = new Map<string, any>();
  return {
    createEntity: () => 1n as any,
    addComponent: vi.fn((_id: any, def: any, data: any) => {
      components.set(def.name, data);
    }),
    _components: components,
  };
};

describe('createPlayerPrefab', () => {
  it('nom par défaut = PlatformerPlayer', () => {
    const prefab = createPlayerPrefab();
    expect(prefab.name).toBe('PlatformerPlayer');
  });

  it('nom custom', () => {
    const prefab = createPlayerPrefab({ name: 'Hero' });
    expect(prefab.name).toBe('Hero');
  });

  it('utilise les DEFAULTS sans options', () => {
    const prefab = createPlayerPrefab();
    const api = makeApi();
    prefab.create(api as any, 0, 0);
    const ctrl = api._components.get('PlatformerController');
    expect(ctrl.speed).toBe(PLATFORMER_CONTROLLER_DEFAULTS.speed);
    expect(ctrl.jumpForce).toBe(PLATFORMER_CONTROLLER_DEFAULTS.jumpForce);
    expect(ctrl.coyoteMs).toBe(PLATFORMER_CONTROLLER_DEFAULTS.coyoteMs);
  });

  it('override des valeurs', () => {
    const prefab = createPlayerPrefab({ speed: 500, jumpForce: 800 });
    const api = makeApi();
    prefab.create(api as any, 0, 0);
    const ctrl = api._components.get('PlatformerController');
    expect(ctrl.speed).toBe(500);
    expect(ctrl.jumpForce).toBe(800);
  });

  it('onCreated appelé avec api et id', () => {
    const onCreated = vi.fn();
    const prefab = createPlayerPrefab({ onCreated });
    const api = makeApi();
    prefab.create(api as any, 0, 0);
    expect(onCreated).toHaveBeenCalledWith(api, 1n);
  });

  it('PlatformerIntent initialisé à idle', () => {
    const prefab = createPlayerPrefab();
    const api = makeApi();
    prefab.create(api as any, 0, 0);
    const intent = api._components.get('PlatformerIntent');
    expect(intent.moveX).toBe(0);
    expect(intent.jumpJustPressed).toBe(false);
  });
});
