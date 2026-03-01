import { describe, it, expect } from 'vitest';
import { defineComponent, Types } from '../src/schema';
import type { InferComponent } from '../src/schema';

describe('DSL Components (schema.ts)', () => {
  it('should define a component definition', () => {
    const Health = defineComponent({
      name: 'Health',
      schema: {
        current: Types.f32,
        max: Types.f32,
        isPoisoned: Types.bool,
        name: Types.string,
      }
    });

    expect(Health.name).toBe('Health');
    expect(Health.schema.current).toBe('f32');
    expect(Health.schema.isPoisoned).toBe('bool');

    // Type-checking test (if this compiles, InferComponent works)
    const h: InferComponent<typeof Health> = {
      current: 100,
      max: 100,
      isPoisoned: false,
      name: 'Player 1',
    };
    expect(h.current).toBe(100);
  });
});
