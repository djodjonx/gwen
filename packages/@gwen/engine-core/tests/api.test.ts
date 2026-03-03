/**
 * EngineAPI & ServiceLocator tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ServiceLocator, EngineAPIImpl, createEngineAPI } from '../src/api';
import { EntityManager, ComponentRegistry, QueryEngine } from '../src/core/ecs';

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
    const retrieved = locator.get<AudioService>('audio');
    expect(retrieved.volume).toBe(0.8);
  });

  describe('DI pattern — inject between plugins', () => {
    it('should allow plugin A to register and plugin B to consume', () => {
      // Plugin A (e.g. InputPlugin) registers its state
      const inputState = { keys: {} as Record<string, boolean> };
      locator.register('InputPlugin', inputState);

      // Plugin B (e.g. PlayerController) retrieves it in onInit
      const retrieved = locator.get<typeof inputState>('InputPlugin');
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
    it('should create entity via API', () => {
      const id = api.createEntity();
      expect(em.isAlive(id)).toBe(true);
    });

    it('should destroy entity via API', () => {
      const id = api.createEntity();
      expect(api.destroyEntity(id)).toBe(true);
      expect(em.isAlive(id)).toBe(false);
    });

    it('should return false destroying non-existent entity', () => {
      const id = api.createEntity();
      api.destroyEntity(id);
      expect(api.destroyEntity(id)).toBe(false);
    });
  });

  describe('Component operations', () => {
    it('should add and get component', () => {
      const e = api.createEntity();
      api.addComponent(e, 'position', { x: 5, y: 10 });
      expect(api.getComponent(e, 'position')).toEqual({ x: 5, y: 10 });
    });

    it('should check hasComponent', () => {
      const e = api.createEntity();
      expect(api.hasComponent(e, 'position')).toBe(false);
      api.addComponent(e, 'position', {});
      expect(api.hasComponent(e, 'position')).toBe(true);
    });

    it('should remove component', () => {
      const e = api.createEntity();
      api.addComponent(e, 'tag', 'player');
      expect(api.removeComponent(e, 'tag')).toBe(true);
      expect(api.hasComponent(e, 'tag')).toBe(false);
    });
  });

  describe('Query', () => {
    it('should query entities with component', () => {
      const e1 = api.createEntity();
      const e2 = api.createEntity();
      api.addComponent(e1, 'position', {});

      const results = api.query(['position']);
      expect(results).toContain(e1);
      expect(results).not.toContain(e2);
    });

    it('should query with multiple required components', () => {
      const e1 = api.createEntity();
      const e2 = api.createEntity();
      api.addComponent(e1, 'position', {});
      api.addComponent(e1, 'velocity', {});
      api.addComponent(e2, 'position', {});

      const results = api.query(['position', 'velocity']);
      expect(results).toContain(e1);
      expect(results).not.toContain(e2);
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

    const e = api.createEntity();
    api.addComponent(e, 'health', { hp: 100 });
    expect(api.getComponent(e, 'health')).toEqual({ hp: 100 });
    expect(api.query(['health'])).toContain(e);
  });

  it('should accept custom ServiceLocator', () => {
    const locator = new ServiceLocator();
    locator.register('custom', { value: 42 });

    const em = new EntityManager(50);
    const reg = new ComponentRegistry();
    const qe = new QueryEngine();
    const api = createEngineAPI(em, reg, qe, locator);

    expect(api.services.get<{ value: number }>('custom').value).toBe(42);
  });
});
