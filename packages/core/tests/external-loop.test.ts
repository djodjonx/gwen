/**
 * PR-03: External loop control tests.
 *
 * Verifies:
 * - advance() throws when loop is 'internal'
 * - advance() caps delta at maxDeltaSeconds (default 0.1)
 * - advance() throws on re-entrant calls
 * - start() in external mode does NOT call requestAnimationFrame
 * - start() in internal mode DOES call requestAnimationFrame
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Engine } from '../src/engine/engine';
import { resetEngine } from '../src/engine/engine-globals';
import { _injectMockWasmEngine, _resetWasmBridge } from '../src/engine/wasm-bridge';
import type { WasmEngine, WasmEntityId } from '../src/engine/wasm-bridge';

// ── Minimal mock ──────────────────────────────────────────────────────────────

function createMockWasmEngine(): WasmEngine {
  let nextIndex = 0;
  const entities = new Map<number, number>();
  let nextTypeId = 0;

  return {
    create_entity: vi.fn((): WasmEntityId => {
      const index = nextIndex++;
      entities.set(index, 0);
      return { index, generation: 0 };
    }),
    delete_entity: vi.fn((index, generation): boolean => {
      if (entities.get(index) !== generation) return false;
      entities.delete(index);
      return true;
    }),
    is_alive: vi.fn((index, generation): boolean => entities.get(index) === generation),
    count_entities: vi.fn((): number => entities.size),
    register_component_type: vi.fn((): number => nextTypeId++),
    add_component: vi.fn((): boolean => true),
    remove_component: vi.fn((): boolean => true),
    has_component: vi.fn((): boolean => false),
    get_component_raw: vi.fn((): Uint8Array => new Uint8Array(0)),
    update_entity_archetype: vi.fn(),
    remove_entity_from_query: vi.fn(),
    query_entities: vi.fn((): Uint32Array => new Uint32Array(0)),
    query_entities_to_buffer: vi.fn((): number => 0),
    get_query_result_ptr: vi.fn(() => 0),
    get_entity_generation: vi.fn((index: number): number => entities.get(index) ?? 0xffffffff),
    tick: vi.fn(),
    frame_count: vi.fn(() => BigInt(0)),
    delta_time: vi.fn(() => 0.016),
    total_time: vi.fn(() => 0),
    alloc_shared_buffer: vi.fn(() => 4096),
    sync_transforms_to_buffer: vi.fn(),
    sync_transforms_to_buffer_sparse: vi.fn(),
    dirty_transform_count: vi.fn(() => 0),
    clear_transform_dirty: vi.fn(),
    sync_transforms_from_buffer: vi.fn(),
    stats: vi.fn(() => '{"entities":0}'),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function createEngine(overrides: Record<string, unknown> = {}): Engine {
  return new Engine({ maxEntities: 100, targetFPS: 60, ...overrides });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('External loop control (PR-03)', () => {
  let mock: WasmEngine;

  beforeEach(() => {
    _resetWasmBridge();
    mock = createMockWasmEngine();
    _injectMockWasmEngine(mock);
    resetEngine();
  });

  afterEach(() => {
    resetEngine();
    _resetWasmBridge();
  });

  // ── advance() guard: internal mode ─────────────────────────────────────────

  describe('advance() in internal loop mode', () => {
    it('throws with a descriptive error', () => {
      const engine = createEngine({ loop: 'internal' });
      expect(() => engine.advance(1 / 60)).toThrow(/engine\.advance\(\) requires loop: "external"/);
    });

    it('throws even when engine has not been started', () => {
      const engine = createEngine(); // default is internal
      expect(() => engine.advance(0.016)).toThrow();
    });
  });

  // ── advance() delta cap ────────────────────────────────────────────────────

  describe('advance() delta capping', () => {
    it('caps delta at default maxDeltaSeconds (0.1 s)', async () => {
      const engine = createEngine({ loop: 'external' });
      // Spy on _tick to capture the synthetic timestamp
      const tickSpy = vi.spyOn(
        engine as Engine & { _tick: (now: number) => Promise<void> },
        '_tick',
      );

      await engine.advance(1.0); // 1 second — way above the cap

      expect(tickSpy).toHaveBeenCalledOnce();
      const firstCall = tickSpy.mock.calls[0];
      expect(firstCall).toBeDefined();
      const [syntheticNow] = firstCall!;
      // lastFrameTime starts at 0 (engine not started), capped dt = 0.1 s = 100 ms
      expect(syntheticNow).toBeCloseTo(100, 0); // 0 + 0.1 * 1000
    });

    it('does not cap delta below maxDeltaSeconds', async () => {
      const engine = createEngine({ loop: 'external' });
      const tickSpy = vi.spyOn(
        engine as Engine & { _tick: (now: number) => Promise<void> },
        '_tick',
      );

      await engine.advance(0.016); // 16 ms — well below the cap

      expect(tickSpy).toHaveBeenCalledOnce();
      const firstCall = tickSpy.mock.calls[0];
      expect(firstCall).toBeDefined();
      const [syntheticNow] = firstCall!;
      expect(syntheticNow).toBeCloseTo(16, 0); // 0 + 0.016 * 1000
    });

    it('respects a custom maxDeltaSeconds config', async () => {
      const engine = createEngine({ loop: 'external', maxDeltaSeconds: 0.05 });
      const tickSpy = vi.spyOn(
        engine as Engine & { _tick: (now: number) => Promise<void> },
        '_tick',
      );

      await engine.advance(0.2); // 200 ms — above custom 50 ms cap

      expect(tickSpy).toHaveBeenCalledOnce();
      const firstCall = tickSpy.mock.calls[0];
      expect(firstCall).toBeDefined();
      const [syntheticNow] = firstCall!;
      expect(syntheticNow).toBeCloseTo(50, 0); // 0 + 0.05 * 1000
    });

    it('passes delta unchanged when exactly equal to cap', async () => {
      const engine = createEngine({ loop: 'external', maxDeltaSeconds: 0.1 });
      const tickSpy = vi.spyOn(
        engine as Engine & { _tick: (now: number) => Promise<void> },
        '_tick',
      );

      await engine.advance(0.1);

      const firstCall = tickSpy.mock.calls[0];
      expect(firstCall).toBeDefined();
      const [syntheticNow] = firstCall!;
      expect(syntheticNow).toBeCloseTo(100, 0);
    });
  });

  // ── advance() re-entrancy guard ────────────────────────────────────────────

  describe('advance() re-entrancy guard', () => {
    it('throws if advance is called while a previous advance is still running', async () => {
      const engine = createEngine({ loop: 'external' });

      // Hold the first _tick in-flight with a controlled promise
      let resolveTick!: () => void;
      const pending = new Promise<void>((resolve) => {
        resolveTick = resolve;
      });

      vi.spyOn(
        engine as Engine & { _tick: (now: number) => Promise<void> },
        '_tick',
      ).mockReturnValueOnce(pending);

      // Start first advance — it won't resolve until we call resolveTick()
      const firstAdvance = engine.advance(0.016);

      // Second call must throw re-entrancy error immediately (synchronously)
      expect(() => engine.advance(0.016)).toThrow(/re-entrantly/);

      // Clean up: resolve the pending tick so the first advance settles
      resolveTick();
      await firstAdvance;
    });

    it('clears _advancing flag after normal completion', async () => {
      const engine = createEngine({ loop: 'external' });
      await engine.advance(0.016);
      // Second call must not throw (flag was cleared)
      await expect(engine.advance(0.016)).resolves.not.toThrow();
    });

    it('clears _advancing flag even when _tick throws', async () => {
      const engine = createEngine({ loop: 'external' });

      vi.spyOn(
        engine as Engine & { _tick: (now: number) => Promise<void> },
        '_tick',
      ).mockRejectedValueOnce(new Error('tick failure'));

      await expect(engine.advance(0.016)).rejects.toThrow('tick failure');
      // Flag must have been cleared — next advance() must not throw re-entrancy error
      vi.spyOn(
        engine as Engine & { _tick: (now: number) => Promise<void> },
        '_tick',
      ).mockResolvedValueOnce(undefined);
      await expect(engine.advance(0.016)).resolves.not.toThrow();
    });
  });

  // ── start() RAF isolation ──────────────────────────────────────────────────

  describe('start() RAF isolation', () => {
    let originalRaf: typeof globalThis.requestAnimationFrame | undefined;

    beforeEach(() => {
      // requestAnimationFrame / cancelAnimationFrame don't exist in Node — install stubs
      originalRaf = (globalThis as Record<string, unknown>).requestAnimationFrame as
        | typeof requestAnimationFrame
        | undefined;
      (globalThis as Record<string, unknown>).requestAnimationFrame = vi.fn(() => 1);
      (globalThis as Record<string, unknown>).cancelAnimationFrame = vi.fn();
    });

    afterEach(() => {
      if (originalRaf === undefined) {
        delete (globalThis as Record<string, unknown>).requestAnimationFrame;
        delete (globalThis as Record<string, unknown>).cancelAnimationFrame;
      } else {
        (globalThis as Record<string, unknown>).requestAnimationFrame = originalRaf;
      }
    });

    it('does NOT call requestAnimationFrame in external mode', async () => {
      const engine = createEngine({ loop: 'external' });

      await engine.start();

      expect(globalThis.requestAnimationFrame).not.toHaveBeenCalled();
      await engine.stop();
    });

    it('calls requestAnimationFrame in internal mode', async () => {
      const engine = createEngine({ loop: 'internal' });

      await engine.start();

      expect(globalThis.requestAnimationFrame).toHaveBeenCalledOnce();
      await engine.stop();
    });

    it('is idempotent: calling start() twice in external mode does not start RAF', async () => {
      const engine = createEngine({ loop: 'external' });

      await engine.start();
      await engine.start(); // second call is a no-op

      expect(globalThis.requestAnimationFrame).not.toHaveBeenCalled();
      await engine.stop();
    });
  });
});
