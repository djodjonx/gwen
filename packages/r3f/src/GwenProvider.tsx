/**
 * @file GwenProvider — React context provider for the GWEN engine.
 *
 * Wrap your `<Canvas>` (or any parent component) with `<GwenProvider>` so that
 * all `@gwenjs/r3f` hooks can resolve the engine via context.
 */

import React, { useMemo, type ReactNode } from 'react';
import type { GwenEngine } from '@gwenjs/core';
import { GwenR3FContext } from './context.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Props accepted by {@link GwenProvider}.
 */
export interface GwenProviderProps {
  /**
   * The GWEN engine instance created via `createEngine()`.
   * Must already be started (or `startExternal()` called) before mounting.
   */
  engine: GwenEngine;
  /** Child components that will have access to the engine via context. */
  children: ReactNode;
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Provides a {@link GwenEngine} instance to the React component tree via context.
 *
 * All `@gwenjs/r3f` hooks (`useGwenEngine`, `useGwenQuery`, `useGwenComponent`)
 * must be called inside a `<GwenProvider>` subtree.
 *
 * The `engine` prop value is memoized — swapping engines at runtime will
 * re-render all consumers.
 *
 * @example
 * ```tsx
 * import { createEngine } from '@gwenjs/core'
 * import { GwenProvider, GwenLoop } from '@gwenjs/r3f'
 * import { Canvas } from '@react-three/fiber'
 *
 * const engine = await createEngine({ maxEntities: 5_000 })
 * await engine.startExternal()
 *
 * function App() {
 *   return (
 *     <Canvas>
 *       <GwenProvider engine={engine}>
 *         <GwenLoop />
 *         <Scene />
 *       </GwenProvider>
 *     </Canvas>
 *   )
 * }
 * ```
 *
 * @since 1.0.0
 */
export function GwenProvider({ engine, children }: GwenProviderProps): React.JSX.Element {
  const value = useMemo(() => ({ engine }), [engine]);
  return <GwenR3FContext.Provider value={value}>{children}</GwenR3FContext.Provider>;
}
