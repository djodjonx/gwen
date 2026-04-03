/**
 * @file Tests for `emit()` — RFC-011 Task 8
 *
 * Verifies that `emit` is sugar over `engine.hooks.callHook` and that it
 * throws with a `[GWEN]` prefix when called outside an engine context.
 */

import { describe, it, expect, vi } from 'vitest';
import { emit } from '../../src/scene/emit.js';
import { createEngine } from '../../src/engine/gwen-engine.js';
import { engineContext } from '../../src/context.js';

describe('emit()', () => {
  it('calls engine.hooks.callHook with name and args', async () => {
    const engine = await createEngine();
    const spy = vi.fn();
    // entity:spawn is a valid GwenRuntimeHooks key
    engine.hooks.hook('entity:spawn' as never, spy);

    engine.run(() => {
      emit('entity:spawn' as never, 1n as never);
    });

    expect(spy).toHaveBeenCalledWith(1n);
  });

  it('throws with [GWEN] prefix when called outside engine context', () => {
    // Ensure no context is active before the assertion
    engineContext.unset();
    expect(() => emit('engine:init' as never)).toThrow('[GWEN]');
  });
});
