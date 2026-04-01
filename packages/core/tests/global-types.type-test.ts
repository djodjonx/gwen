import { describe, it, expectTypeOf } from 'vitest';
import type { GwenHooks } from '../src/hooks/types';

describe('global default type strictness', () => {
  it('GwenDefaultServices starts empty before prepare', () => {
    expectTypeOf<GwenDefaultServices>().toEqualTypeOf<{}>();
  });

  it('GwenDefaultHooks starts empty before prepare', () => {
    expectTypeOf<GwenDefaultHooks>().toMatchTypeOf<GwenHooks>();
  });
});
