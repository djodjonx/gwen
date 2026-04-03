// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { GwenEngine } from '@gwenjs/core';
import { GwenProvider } from '../src/GwenProvider';
import { useGwenEngine } from '../src/context';

// ─── Mock ─────────────────────────────────────────────────────────────────────

vi.mock('@react-three/fiber', () => ({ useFrame: vi.fn() }));

/**
 * Creates a minimal GwenEngine mock that satisfies the parts consumed by
 * GwenProvider and useGwenEngine (just the context plumbing — no ECS).
 */
function makeEngineMock(): GwenEngine {
  return {
    hooks: { hook: vi.fn(() => vi.fn()), removeHook: vi.fn() },
  } as unknown as GwenEngine;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GwenProvider', () => {
  it('provides the engine instance via useGwenEngine()', () => {
    const engine = makeEngineMock();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <GwenProvider engine={engine}>{children}</GwenProvider>
    );

    const { result } = renderHook(() => useGwenEngine(), { wrapper });

    expect(result.current).toBe(engine);
  });

  it('returns a new context value when the engine prop changes', () => {
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
});

describe('useGwenEngine', () => {
  it('throws a descriptive error when called outside a GwenProvider tree', () => {
    // renderHook without a wrapper — no context present.
    expect(() => renderHook(() => useGwenEngine())).toThrow(
      '[useGwenEngine] Must be called inside <GwenProvider>',
    );
  });
});
