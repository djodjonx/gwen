import { describe, it, expect, beforeEach } from 'vitest';
import { definePrefab } from '../src/core/prefab';
import { EntityManager, ComponentRegistry, QueryEngine, createEngineAPI } from '../src/index';

describe('Prefab System (prefab.ts)', () => {
  let api: ReturnType<typeof createEngineAPI>;

  beforeEach(() => {
    api = createEngineAPI(new EntityManager(100), new ComponentRegistry(), new QueryEngine());
  });

  // ── Forme 1 — objet direct ────────────────────────────────────────────────

  it('forme 1 — register and instantiate', () => {
    const BulletPrefab = definePrefab({
      name: 'Bullet',
      create: (api, x: number, y: number) => {
        const id = api.createEntity();
        api.addComponent(id, 'Position', { x, y });
        return id;
      },
    });

    api.prefabs.register(BulletPrefab);
    expect(api.prefabs.has('Bullet')).toBe(true);

    const bulletId = api.prefabs.instantiate('Bullet', 10, 20);
    const pos = api.getComponent<{ x: number; y: number }>(bulletId, 'Position');
    expect(pos?.x).toBe(10);
    expect(pos?.y).toBe(20);
  });

  it('forme 1 — throw on unknown prefab', () => {
    expect(() => api.prefabs.instantiate('Unknown')).toThrow(/Unknown prefab/);
  });

  // ── Forme 2 — factory ─────────────────────────────────────────────────────

  it('forme 2 — factory : name extrait correctement', () => {
    const def = definePrefab('Enemy', () => ({
      create: (api: any) => api.createEntity(),
    }));
    expect(def.name).toBe('Enemy');
    expect(typeof def.create).toBe('function');
  });

  it('forme 2 — factory : closure state locale', () => {
    let callCount = 0;
    const def = definePrefab('Counter', () => {
      callCount++; // factory appelée une seule fois
      return {
        create: (api: any) => api.createEntity(),
      };
    });
    expect(callCount).toBe(1);
    expect(def.name).toBe('Counter');
  });

  it('forme 2 — factory : register et instantiate fonctionnent', () => {
    const EnemyPrefab = definePrefab('FastEnemy', () => {
      const speed = 120;
      return {
        create: (api: any, x: number, y: number) => {
          const id = api.createEntity();
          api.addComponent(id, 'Velocity', { vx: 0, vy: speed });
          api.addComponent(id, 'Position', { x, y });
          return id;
        },
      };
    });

    api.prefabs.register(EnemyPrefab);
    const id = api.prefabs.instantiate('FastEnemy', 100, 50);
    const vel = api.getComponent<{ vx: number; vy: number }>(id, 'Velocity');
    expect(vel?.vy).toBe(120);
  });
});
