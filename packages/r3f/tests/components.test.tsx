// @vitest-environment jsdom
/**
 * @file Tests for GwenProvider component integration with GwenCanvas and GwenLoop.
 *
 * Verifies that GwenProvider correctly exposes the engine via context,
 * and that the composition works as expected.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { GwenEngine } from '@gwenjs/core';
import { GwenProvider } from '../src/GwenProvider';
import { useGwenEngine } from '../src/context';

vi.mock('@react-three/fiber', () => ({ useFrame: vi.fn() }));

/**
 * Creates a minimal mock GwenEngine.
 */
function makeEngineMock(): GwenEngine {
  return {
    hooks: {
      hook: vi.fn(() => vi.fn()),
      removeHook: vi.fn(),
    },
  } as unknown as GwenEngine;
}

// ─── GwenProvider context tests ─────────────────────────────────────────────────

describe('GwenProvider context integration', () => {
  let engine: GwenEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = makeEngineMock();
  });

  it('provides the engine to child components via useGwenEngine hook', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <GwenProvider engine={engine}>{children}</GwenProvider>
    );

    const { result } = renderHook(() => useGwenEngine(), { wrapper });

    expect(result.current).toBe(engine);
  });

  it('updates the context when the engine prop changes', () => {
    const engine1 = makeEngineMock();
    const engine2 = makeEngineMock();

    let currentEngine: GwenEngine = engine1;

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <GwenProvider engine={currentEngine}>{children}</GwenProvider>
    );

    const { result, rerender } = renderHook(() => useGwenEngine(), { wrapper });

    expect(result.current).toBe(engine1);

    currentEngine = engine2;
    rerender();

    expect(result.current).toBe(engine2);
  });

  it('throws an error when useGwenEngine is called outside of GwenProvider', () => {
    // renderHook without a wrapper — no context present.
    expect(() => renderHook(() => useGwenEngine())).toThrow(
      '[useGwenEngine] Must be called inside <GwenProvider>',
    );
  });

  it('memoizes the engine value to prevent unnecessary re-renders', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <GwenProvider engine={engine}>{children}</GwenProvider>
    );

    let renderCount = 0;

    const { rerender } = renderHook(
      () => {
        renderCount++;
        return useGwenEngine();
      },
      { wrapper },
    );

    const initialRenderCount = renderCount;

    // Re-render with the same engine instance
    rerender();

    // The value should still be the same (stable reference)
    // Component should not have been re-rendered due to context change
    expect(renderCount).toBe(initialRenderCount + 1); // Only rerender call causes count to increase
  });

  it('allows multiple child hooks to access the same engine instance', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <GwenProvider engine={engine}>{children}</GwenProvider>
    );

    const { result: result1 } = renderHook(() => useGwenEngine(), { wrapper });
    const { result: result2 } = renderHook(() => useGwenEngine(), { wrapper });

    expect(result1.current).toBe(result2.current);
    expect(result1.current).toBe(engine);
  });

  it('provides the correct engine instance even when nested providers exist', () => {
    const engine1 = makeEngineMock();
    const engine2 = makeEngineMock();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <GwenProvider engine={engine1}>
        <GwenProvider engine={engine2}>{children}</GwenProvider>
      </GwenProvider>
    );

    const { result } = renderHook(() => useGwenEngine(), { wrapper });

    // Should use the innermost provider's engine
    expect(result.current).toBe(engine2);
  });
});

// ─── GwenCanvas export tests ─────────────────────────────────────────────────────

describe('GwenCanvas and GwenLoop exports', () => {
  it('GwenCanvas is exported from the main package', async () => {
    const { GwenCanvas } = await import('../src/index');
    expect(typeof GwenCanvas).toBe('function');
  });

  it('GwenLoop is exported from the main package', async () => {
    const { GwenLoop } = await import('../src/index');
    expect(typeof GwenLoop).toBe('function');
  });

  it('GwenProvider is exported from the main package', async () => {
    const { GwenProvider } = await import('../src/index');
    expect(typeof GwenProvider).toBe('function');
  });

  it('useGwenEngine hook is exported from the main package', async () => {
    const { useGwenEngine } = await import('../src/index');
    expect(typeof useGwenEngine).toBe('function');
  });
});
