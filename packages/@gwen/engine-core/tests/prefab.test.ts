import { describe, it, expect, beforeEach } from 'vitest';
import { definePrefab } from '../src/prefab';
import { EntityManager, ComponentRegistry, QueryEngine, createEngineAPI } from '../src/index';

describe('Prefab System (prefab.ts)', () => {
  let api: ReturnType<typeof createEngineAPI>;

  beforeEach(() => {
    api = createEngineAPI(new EntityManager(100), new ComponentRegistry(), new QueryEngine());
  });

  it('should register and instantiate prefabs', () => {
    const BulletPrefab = definePrefab({
      name: 'Bullet',
      create: (api, x: number, y: number) => {
        const id = api.createEntity();
        api.addComponent(id, 'Position', { x, y });
        return id;
      }
    });

    api.prefabs.register(BulletPrefab);

    expect(api.prefabs.has('Bullet')).toBe(true);

    const bulletId = api.prefabs.instantiate('Bullet', 10, 20);

    // Check if component was added correctly
    const pos = api.getComponent<{ x: number, y: number }>(bulletId, 'Position');
    expect(pos?.x).toBe(10);
    expect(pos?.y).toBe(20);
  });

  it('should throw when instantiating unknown prefab', () => {
    expect(() => api.prefabs.instantiate('Unknown')).toThrow(/Unknown prefab/);
  });
});
