/**
 * EngineAPI & ServiceLocator tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ServiceLocator, EngineAPIImpl, createEngineAPI } from '../src/api/api';
import { EntityManager, ComponentRegistry, QueryEngine } from '../src/core/ecs';
import { defineComponent, Types } from '../src/schema';

// ============= ServiceLocator =============

describe('ServiceLocator', () => {
  let locator: ServiceLocator;

  beforeEach(() => {
    locator = new ServiceLocator();
  });

  it('should register and retrieve a service', () => {
    const audio = { play: () => {} };
    locator.register('audio', audio);
    expect(locator.get('audio')).toBe(audio);
  });

  it('should throw when getting unregistered service', () => {
    expect(() => locator.get('missing')).toThrow("Service 'missing' not found");
  });

  it('should check has() correctly', () => {
    expect(locator.has('audio')).toBe(false);
    locator.register('audio', {});
    expect(locator.has('audio')).toBe(true);
  });

  it('should list registered services', () => {
    locator.register('input', {});
    locator.register('audio', {});
    const list = locator.list();
    expect(list).toContain('input');
    expect(list).toContain('audio');
    expect(list).toHaveLength(2);
  });

  it('should unregister a service', () => {
    locator.register('temp', {});
    expect(locator.unregister('temp')).toBe(true);
    expect(locator.has('temp')).toBe(false);
  });

  it('should return false unregistering non-existent service', () => {
    expect(locator.unregister('ghost')).toBe(false);
  });

  it('should overwrite on duplicate register (with warning)', () => {
    const v1 = { version: 1 };
    const v2 = { version: 2 };
    locator.register('svc', v1);
    locator.register('svc', v2); // warn but overwrite
    expect(locator.get('svc')).toBe(v2);
  });

  it('should support typed get()', () => {
    interface AudioService {
      volume: number;
    }
    const audio: AudioService = { volume: 0.8 };
    locator.register('audio', audio);
    const retrieved = locator.get('audio') as AudioService;
    expect(retrieved.volume).toBe(0.8);
  });

  describe('DI pattern — inject between plugins', () => {
    it('should allow plugin A to register and plugin B to consume', () => {
      // Plugin A (e.g. InputPlugin) registers its state
      const inputState = { keys: {} as Record<string, boolean> };
      locator.register('InputPlugin', inputState);

      // Plugin B retrieves it
      const retrieved = locator.get('InputPlugin') as typeof inputState;
      expect(retrieved).toBe(inputState);
      expect(retrieved).toBe(inputState);
    });
  });
});

// ============= EngineAPIImpl =============

describe('EngineAPIImpl', () => {
  let em: EntityManager;
  let reg: ComponentRegistry;
  let qe: QueryEngine;
  let api: EngineAPIImpl;

  beforeEach(() => {
    em = new EntityManager(100);
    reg = new ComponentRegistry();
    qe = new QueryEngine();
    api = createEngineAPI(em, reg, qe) as EngineAPIImpl;
  });

  describe('Entity operations', () => {
    it('should create entity via api.entity.create()', () => {
      const id = api.entity.create();
      expect(em.isAlive(id)).toBe(true);
    });

    it('should destroy entity via api.entity.destroy()', () => {
      const id = api.entity.create();
      expect(api.entity.destroy(id)).toBe(true);
      expect(em.isAlive(id)).toBe(false);
    });

    it('should return false destroying non-existent entity', () => {
      const id = api.entity.create();
      api.entity.destroy(id);
      expect(api.entity.destroy(id)).toBe(false);
    });

    it('api.entity.isAlive() returns correct liveness', () => {
      const id = api.entity.create();
      expect(api.entity.isAlive(id)).toBe(true);
      api.entity.destroy(id);
      expect(api.entity.isAlive(id)).toBe(false);
    });

    it('api.entity.tag / hasTag / untag work correctly', () => {
      const id = api.entity.create();
      expect(api.entity.hasTag(id, 'grounded')).toBe(false);
      api.entity.tag(id, 'grounded');
      expect(api.entity.hasTag(id, 'grounded')).toBe(true);
      api.entity.untag(id, 'grounded');
      expect(api.entity.hasTag(id, 'grounded')).toBe(false);
    });

    it('api.entity.getGeneration() returns the slot generation', () => {
      api.entity.create();
      // Generation 0 for a fresh entity
      expect(api.entity.getGeneration(0)).toBe(0);
    });

    // ── Internal helpers still accessible on EngineAPIImpl ─────────────────
    it('createEntity() / destroyEntity() still work as internal helpers', () => {
      const id = api.createEntity();
      expect(em.isAlive(id)).toBe(true);
      expect(api.destroyEntity(id)).toBe(true);
      expect(em.isAlive(id)).toBe(false);
    });
  });

  describe('Component operations', () => {
    it('api.component.add / get should store and retrieve component', () => {
      const e = api.entity.create();
      const Position = defineComponent({
        name: 'Position',
        schema: { x: Types.f32, y: Types.f32 },
      });
      api.component.add(e, Position, { x: 5, y: 10 });
      expect(api.component.get(e, Position)).toEqual({ x: 5, y: 10 });
    });

    it('api.component.has returns correct boolean', () => {
      const e = api.entity.create();
      const Pos = defineComponent({ name: 'Pos', schema: { x: Types.f32 } });
      expect(api.component.has(e, Pos)).toBe(false);
      api.component.add(e, Pos, { x: 0 });
      expect(api.component.has(e, Pos)).toBe(true);
    });

    it('api.component.remove removes the component', () => {
      const e = api.entity.create();
      const Tag = defineComponent({ name: 'Tag', schema: {} });
      api.component.add(e, Tag, {});
      expect(api.component.remove(e, Tag)).toBe(true);
      expect(api.component.has(e, Tag)).toBe(false);
    });

    it('api.component.set merges patch onto existing value', () => {
      const e = api.entity.create();
      const HP = defineComponent({ name: 'HP', schema: { current: Types.f32, max: Types.f32 } });
      api.component.add(e, HP, { current: 100, max: 100 });
      api.component.set(e, HP, { current: 60 });
      expect(api.component.get(e, HP)).toEqual({ current: 60, max: 100 });
    });

    it('api.component.set creates with defaults when component absent', () => {
      const e = api.entity.create();
      const HP = defineComponent({
        name: 'HP2',
        schema: { current: Types.f32, max: Types.f32 },
        defaults: { current: 50, max: 50 },
      });
      api.component.set(e, HP, { current: 30 });
      expect(api.component.get(e, HP)).toEqual({ current: 30, max: 50 });
    });

    it('api.component.getOrThrow throws when absent', () => {
      const e = api.entity.create();
      const Absent = defineComponent({ name: 'Absent', schema: {} });
      expect(() => api.component.getOrThrow(e, Absent)).toThrow('[GWEN]');
    });

    it('api.component.getOrThrow returns value when present', () => {
      const e = api.entity.create();
      const Present = defineComponent({ name: 'Present', schema: { v: Types.f32 } });
      api.component.add(e, Present, { v: 42 });
      expect(api.component.getOrThrow(e, Present)).toEqual({ v: 42 });
    });

    // ── Internal helpers still accessible on EngineAPIImpl ─────────────────
    it('addComponent() / getComponent() / hasComponent() / removeComponent() still work as internal helpers', () => {
      const e = api.createEntity();
      api.addComponent(e, 'position', { x: 5, y: 10 });
      expect(api.getComponent(e, 'position')).toEqual({ x: 5, y: 10 });
      expect(api.hasComponent(e, 'position')).toBe(true);
      expect(api.removeComponent(e, 'position')).toBe(true);
      expect(api.hasComponent(e, 'position')).toBe(false);
    });
  });

  describe('Query', () => {
    const Position = defineComponent({
      name: 'Position',
      schema: { x: Types.f32, y: Types.f32 },
    });

    const Velocity = defineComponent({
      name: 'Velocity',
      schema: { vx: Types.f32, vy: Types.f32 },
    });

    it('should query entities with component', () => {
      const e1 = api.entity.create();
      const e2 = api.entity.create();
      api.addComponent(e1, 'position', {});

      const results = api.query(['position']);
      expect(results).toContain(e1);
      expect(results).not.toContain(e2);
    });

    it('should query with multiple required components', () => {
      const e1 = api.entity.create();
      const e2 = api.entity.create();
      api.addComponent(e1, 'position', {});
      api.addComponent(e1, 'velocity', {});
      api.addComponent(e2, 'position', {});

      const results = api.query(['position', 'velocity']);
      expect(results).toContain(e1);
      expect(results).not.toContain(e2);
    });

    it('should return the same results for definition and name queries', () => {
      const id = api.entity.create();
      api.component.add(id, Position, { x: 1, y: 2 });

      expect(api.query([Position])).toEqual(api.query([Position.name]));
      expect(api.query([Position])).toContain(id);
    });

    it('should support mixed component references in query', () => {
      const id = api.entity.create();
      api.component.add(id, Position, { x: 0, y: 0 });
      api.component.add(id, Velocity, { vx: 1, vy: 0 });

      const mixed = api.query([Position, Velocity.name]);
      const byName = api.query([Position.name, Velocity.name]);
      expect(mixed).toEqual(byName);
      expect(mixed).toContain(id);
    });

    it('should reject invalid query component references', () => {
      expect(() => api.query([''])).toThrow('Component type must not be an empty string');
      expect(() => api.query([null as unknown as string])).toThrow(
        'Invalid component type. Expected string or ComponentDefinition',
      );
    });
  });

  describe('State (deltaTime, frameCount)', () => {
    it('should expose deltaTime from state', () => {
      api._updateState(0.016, 1);
      expect(api.deltaTime).toBeCloseTo(0.016);
    });

    it('should expose frameCount from state', () => {
      api._updateState(0.016, 42);
      expect(api.frameCount).toBe(42);
    });
  });

  describe('Services', () => {
    it('should expose ServiceLocator via api.services', () => {
      api.services.register('audio', { play: () => {} });
      expect(api.services.has('audio')).toBe(true);
    });
  });
});

// ============= createEngineAPI factory =============

describe('createEngineAPI', () => {
  it('should wire ECS together properly', () => {
    const em = new EntityManager(50);
    const reg = new ComponentRegistry();
    const qe = new QueryEngine();
    const api = createEngineAPI(em, reg, qe);

    const Health = defineComponent({ name: 'health', schema: { hp: Types.f32 } });
    const e = api.entity.create();
    api.component.add(e, Health, { hp: 100 });
    expect(api.component.get(e, Health)).toEqual({ hp: 100 });
    expect(api.query(['health'])).toContain(e);
  });

  it('should accept custom ServiceLocator', () => {
    const locator = new ServiceLocator();
    locator.register('custom', { value: 42 });

    const em = new EntityManager(50);
    const reg = new ComponentRegistry();
    const qe = new QueryEngine();
    const api = createEngineAPI(em, reg, qe, locator);

    expect((api.services.get('custom') as { value: number }).value).toBe(42);
  });
});
