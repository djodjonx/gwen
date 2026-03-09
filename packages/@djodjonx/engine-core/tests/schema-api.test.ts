import { describe, it, expect, beforeEach } from 'vitest';
import { defineComponent, Types } from '../src/schema';
import { EntityManager, ComponentRegistry, QueryEngine, createEngineAPI } from '../src/index';

describe('EngineAPI + DSL Components integration', () => {
  let api: ReturnType<typeof createEngineAPI>;

  const Position = defineComponent({
    name: 'Position',
    schema: { x: Types.f32, y: Types.f32 },
  });

  const Velocity = defineComponent({
    name: 'Velocity',
    schema: { vx: Types.f32, vy: Types.f32 },
  });

  beforeEach(() => {
    api = createEngineAPI(new EntityManager(100), new ComponentRegistry(), new QueryEngine());
  });

  it('should add, get, has, remove typed component definitions', () => {
    const id = api.createEntity();

    // Type inference check — adding missing properties would cause TS compile error
    api.addComponent(id, Position, { x: 10, y: 20 });

    expect(api.hasComponent(id, Position)).toBe(true);
    expect(api.hasComponent(id, Velocity)).toBe(false);

    const pos = api.getComponent(id, Position);
    expect(pos?.x).toBe(10);
    expect(pos?.y).toBe(20);

    // Test TS query array (fallback to string names for now)
    const entities = api.query([Position.name]);
    expect(entities).toContain(id);

    api.removeComponent(id, Position);
    expect(api.hasComponent(id, Position)).toBe(false);
  });
});
