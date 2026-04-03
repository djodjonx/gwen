/**
 * @file GWEN R3F Context — React context and `useGwenEngine` hook.
 *
 * Provides the central context value consumed by all other `@gwenjs/r3f` hooks
 * and components. Mount exactly one {@link GwenProvider} (or {@link GwenCanvas})
 * at the root of your R3F scene tree.
 */

import { createContext, useContext } from 'react';
import type { GwenEngine } from '@gwenjs/core';

// ─── Context ────────────────────────────────────────────────────────────────

/** @internal Payload stored in the React context. */
interface GwenR3FContextValue {
  /** The GWEN engine instance provided by the nearest `<GwenProvider>`. */
  engine: GwenEngine;
}

/**
 * React context that carries the {@link GwenEngine} instance down the tree.
 * Do **not** consume this directly — use {@link useGwenEngine} instead.
 *
 * @internal
 */
export const GwenR3FContext = createContext<GwenR3FContextValue | null>(null);

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Returns the GWEN engine instance from the nearest `<GwenProvider>`.
 *
 * Must be called inside a component tree that is wrapped by
 * {@link GwenProvider} or {@link GwenCanvas}.
 *
 * @returns The {@link GwenEngine} instance.
 * @throws {Error} If called outside a `<GwenProvider>` tree.
 *
 * @example
 * ```tsx
 * import { useGwenEngine } from '@gwenjs/r3f'
 *
 * function MyComponent() {
 *   const engine = useGwenEngine()
 *   // engine.createEntity(), engine.advance(), …
 *   return <mesh />
 * }
 * ```
 *
 * @since 1.0.0
 */
export function useGwenEngine(): GwenEngine {
  const ctx = useContext(GwenR3FContext);
  if (!ctx) {
    throw new Error('[useGwenEngine] Must be called inside <GwenProvider>');
  }
  return ctx.engine;
}
