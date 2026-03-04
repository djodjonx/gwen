import { describe, it, expect } from 'vitest';
import { defineComponent, Types } from '../src/schema';
import type { InferComponent } from '../src/schema';

describe('DSL Components (schema.ts)', () => {
  // ── Form 1 — direct object ────────────────────────────────────────────────

  it('form 1 — defines a component correctly', () => {
    const Health = defineComponent({
      name: 'Health',
      schema: {
        current: Types.f32,
        max: Types.f32,
        isPoisoned: Types.bool,
        name: Types.string,
      },
    });

    expect(Health.name).toBe('Health');
    expect(Health.schema.current).toBe(Types.f32);
    expect(Health.schema.isPoisoned).toBe(Types.bool);

    const h: InferComponent<typeof Health> = {
      current: 100,
      max: 100,
      isPoisoned: false,
      name: 'Player 1',
    };
    expect(h.current).toBe(100);
  });

  // ── Form 2 — factory ─────────────────────────────────────────────────────

  it('form 2 — factory: name extracted correctly', () => {
    const Position = defineComponent('position', () => ({
      schema: { x: Types.f32, y: Types.f32 },
    }));
    expect(Position.name).toBe('position');
    expect(Position.schema.x).toBe(Types.f32);
    expect(Position.schema.y).toBe(Types.f32);
  });

  it('form 2 — factory: called exactly once', () => {
    let calls = 0;
    const def = defineComponent('test', () => {
      calls++;
      return { schema: { v: Types.i32 } };
    });
    expect(calls).toBe(1);
    expect(def.name).toBe('test');
  });

  it('form 2 — factory: InferComponent works', () => {
    const Velocity = defineComponent('velocity', () => ({
      schema: { vx: Types.f32, vy: Types.f32 },
    }));
    const v: InferComponent<typeof Velocity> = { vx: 1.5, vy: -2.0 };
    expect(v.vx).toBeCloseTo(1.5);
  });
});
