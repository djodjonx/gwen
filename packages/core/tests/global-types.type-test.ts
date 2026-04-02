import { describe, it, expectTypeOf } from 'vitest';
import type { GwenHooks } from '../src/hooks/types';

describe('global default type strictness', () => {
  it('GwenPrefabExtensions has open index signature', () => {
    expectTypeOf<GwenPrefabExtensions>().toMatchTypeOf<Record<string, unknown>>();
  });
});
