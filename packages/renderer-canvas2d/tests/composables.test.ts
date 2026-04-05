/**
 * @file Tests for `useCanvas2D` composable in @gwenjs/renderer-canvas2d.
 *
 * Verifies that the hook correctly retrieves the renderer service
 * from the engine context and throws appropriate errors when not found.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCanvas2D } from '../src/composables';
import { GwenPluginNotFoundError } from '@gwenjs/core';
import type { GwenEngine } from '@gwenjs/core';

// ─── Mock ──────────────────────────────────────────────────────────────────

function createMockEngine(
  overrides: {
    injected?: Record<string, unknown>;
  } = {},
): GwenEngine {
  const injected = overrides.injected ?? {};

  return {
    tryInject: vi.fn((key: string) => injected[key]),
    inject: vi.fn((key: string) => {
      const value = injected[key];
      if (value === undefined) throw new Error(`Service not found: ${key}`);
      return value;
    }),
  } as unknown as GwenEngine;
}

// ─── Mock `useEngine` from @gwenjs/core ─────────────────────────────────────

vi.mock('@gwenjs/core', async () => {
  const actual = await vi.importActual('@gwenjs/core');
  return {
    ...actual,
    useEngine: vi.fn(() => {
      // This will be overridden per test
      return createMockEngine();
    }),
    GwenPluginNotFoundError:
      actual.GwenPluginNotFoundError || class GwenPluginNotFoundError extends Error {},
  };
});

const { useEngine } = await import('@gwenjs/core');

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useCanvas2D()', () => {
  let mockEngine: GwenEngine;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the renderer service when available', () => {
    const mockRendererService = {
      ctx: {} as CanvasRenderingContext2D,
      resize: vi.fn(),
      setCamera: vi.fn(),
      getCamera: vi.fn(),
    };

    mockEngine = createMockEngine({
      injected: { renderer: mockRendererService },
    });

    (useEngine as any).mockReturnValue(mockEngine);

    const result = useCanvas2D();
    expect(result).toBe(mockRendererService);
  });

  it('throws GwenPluginNotFoundError when renderer service is not found', () => {
    mockEngine = createMockEngine({
      injected: {}, // No renderer service
    });

    (useEngine as any).mockReturnValue(mockEngine);

    expect(() => useCanvas2D()).toThrow(GwenPluginNotFoundError);
  });

  it('throws an error with helpful hint when renderer is missing', () => {
    mockEngine = createMockEngine({
      injected: {},
    });

    (useEngine as any).mockReturnValue(mockEngine);

    let thrownError: Error | undefined;
    try {
      useCanvas2D();
    } catch (e) {
      thrownError = e as Error;
    }

    expect(thrownError).toBeDefined();
    expect(thrownError?.message).toContain('@gwenjs/renderer-canvas2d');
  });

  it('calls engine.tryInject("renderer")', () => {
    const mockRendererService = { ctx: {} };
    mockEngine = createMockEngine({
      injected: { renderer: mockRendererService },
    });

    (useEngine as any).mockReturnValue(mockEngine);

    useCanvas2D();

    expect(mockEngine.tryInject).toHaveBeenCalledWith('renderer');
  });
});
