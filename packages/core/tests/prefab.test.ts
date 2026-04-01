import { describe, it, expect, beforeEach, vi } from 'vitest';
import { definePrefab } from '../src/core/prefab';
import { defineComponent, Types } from '../src/schema';
import { EntityManager, ComponentRegistry, QueryEngine, createEngineAPI } from '../src/index';
import type { EntityId } from '../src/engine/engine-api';

describe('Prefab System (prefab.ts)', () => {
  let api: ReturnType<typeof createEngineAPI>;

  beforeEach(() => {
    api = createEngineAPI(new EntityManager(100), new ComponentRegistry(), new QueryEngine());
  });

  // ── Form 1 — direct object ────────────────────────────────────────────────

  it('form 1 — register and instantiate', () => {
    const PosComp = defineComponent({ name: 'Position', schema: { x: Types.f32, y: Types.f32 } });
    const BulletPrefab = definePrefab({
      name: 'Bullet',
      create: (api, x: number, y: number): EntityId => {
        const id = api.entity.create();
        api.component.add(id, PosComp, { x, y });
        return id;
      },
    });

    api.prefabs.register(BulletPrefab);
    expect(api.prefabs.has('Bullet')).toBe(true);

    const bulletId = api.prefabs.instantiate('Bullet', 10, 20);
    const pos = api.component.get(bulletId, PosComp);
    expect(pos?.x).toBe(10);
    expect(pos?.y).toBe(20);
  });

  it('form 1 — throw on unknown prefab', () => {
    expect(() => api.prefabs.instantiate('Unknown')).toThrow(/Unknown prefab/);
  });

  // ── Form 2 — factory ─────────────────────────────────────────────────────

  it('form 2 — factory: name extracted correctly', () => {
    const def = definePrefab('Enemy', () => ({
      create: (api: any) => api.entity.create(),
    }));
    expect(def.name).toBe('Enemy');
    expect(typeof def.create).toBe('function');
  });

  it('form 2 — factory: local closure state', () => {
    let callCount = 0;
    const def = definePrefab('Counter', () => {
      callCount++; // factory called exactly once
      return {
        create: (api: any) => api.entity.create(),
      };
    });
    expect(callCount).toBe(1);
    expect(def.name).toBe('Counter');
  });

  it('form 2 — factory: register and instantiate work', () => {
    const VelComp = defineComponent({ name: 'Velocity', schema: { vx: Types.f32, vy: Types.f32 } });
    const PosComp = defineComponent({ name: 'Position2', schema: { x: Types.f32, y: Types.f32 } });
    const EnemyPrefab = definePrefab('FastEnemy', () => {
      const speed = 120;
      return {
        create: (api, x: number, y: number) => {
          const id = api.entity.create();
          api.component.add(id, VelComp, { vx: 0, vy: speed });
          api.component.add(id, PosComp, { x, y });
          return id;
        },
      };
    });

    api.prefabs.register(EnemyPrefab);
    const id = api.prefabs.instantiate('FastEnemy', 100, 50);
    const vel = api.component.get(id, VelComp);
    expect(vel?.vy).toBe(120);
  });

  // ── Extensions ────────────────────────────────────────────────────────────

  it('extensions — fires prefab:instantiate hook with entityId and extensions', async () => {
    const handler = vi.fn();
    (api.hooks.hook as any)('prefab:instantiate', handler);

    const PlayerPrefab = definePrefab({
      name: 'Player',
      extensions: { physics: { mass: 10, isStatic: false } },
      create: (api) => api.entity.create(),
    });

    api.prefabs.register(PlayerPrefab);
    const id = api.prefabs.instantiate('Player');

    // Wait for the async IIFE dispatch to run
    await new Promise((r) => setTimeout(r, 0));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(id, { physics: { mass: 10, isStatic: false } });
  });

  it('extensions — does NOT fire hook when extensions is absent', async () => {
    const handler = vi.fn();
    (api.hooks.hook as any)('prefab:instantiate', handler);

    const BulletPrefab = definePrefab({
      name: 'Bullet',
      create: (api) => api.entity.create(),
    });

    api.prefabs.register(BulletPrefab);
    api.prefabs.instantiate('Bullet');

    expect(handler).not.toHaveBeenCalled();
  });

  it('extensions — does NOT fire hook when extensions is empty object', async () => {
    const handler = vi.fn();
    (api.hooks.hook as any)('prefab:instantiate', handler);

    const BulletPrefab = definePrefab({
      name: 'BulletEmpty',
      extensions: {},
      create: (api) => api.entity.create(),
    });

    api.prefabs.register(BulletPrefab);
    api.prefabs.instantiate('BulletEmpty');

    expect(handler).not.toHaveBeenCalled();
  });

  it('extensions — extensions object is frozen after register()', () => {
    const ext = { physics: { mass: 5 } };
    const Prefab = definePrefab({
      name: 'Frozen',
      extensions: ext,
      create: (api) => api.entity.create(),
    });

    api.prefabs.register(Prefab);

    expect(Object.isFrozen(Prefab.extensions)).toBe(true);
  });

  it('extensions — hook error is caught and does not prevent entity creation', async () => {
    (api.hooks.hook as any)('prefab:instantiate', () => {
      throw new Error('plugin failure');
    });

    const Prefab = definePrefab({
      name: 'ErrorPrefab',
      extensions: { audio: { volume: 1 } },
      create: (api) => api.entity.create(),
    });

    api.prefabs.register(Prefab);

    // instantiate() must not throw synchronously
    let id: any;
    expect(() => {
      id = api.prefabs.instantiate('ErrorPrefab');
    }).not.toThrow();
    expect(id).toBeDefined();

    // Let the .catch() microtask run — no unhandled rejection
    await new Promise((r) => setTimeout(r, 0));
  });
});
