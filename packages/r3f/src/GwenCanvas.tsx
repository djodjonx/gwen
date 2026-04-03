/**
 * @file GwenCanvas — All-in-one R3F + GWEN entry point.
 *
 * Composes `<Canvas>` from `@react-three/fiber` with {@link GwenProvider}
 * and {@link GwenLoop} so you get a fully wired GWEN+R3F scene in one element.
 */

import React from 'react';
import { Canvas, type CanvasProps } from '@react-three/fiber';
import type { GwenEngine } from '@gwenjs/core';
import { GwenProvider } from './GwenProvider.js';
import { GwenLoop } from './GwenLoop.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Props accepted by {@link GwenCanvas}.
 *
 * Extends all standard R3F {@link CanvasProps} with a required `engine` field.
 */
export interface GwenCanvasProps extends CanvasProps {
  /**
   * The GWEN engine instance created via `createEngine()`.
   * Must already be started via `startExternal()` before the canvas mounts.
   */
  engine: GwenEngine;
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * All-in-one React Three Fiber canvas pre-wired with GWEN.
 *
 * Renders an R3F `<Canvas>` that automatically:
 * 1. Wraps children in {@link GwenProvider} (engine accessible via `useGwenEngine`).
 * 2. Mounts {@link GwenLoop} to drive `engine.advance()` on every R3F frame.
 *
 * All standard `<Canvas>` props (camera, shadows, gl, style, etc.) are forwarded
 * to the underlying R3F canvas unchanged.
 *
 * @example
 * ```tsx
 * import { createEngine } from '@gwenjs/core'
 * import { GwenCanvas } from '@gwenjs/r3f'
 *
 * const engine = await createEngine({ maxEntities: 10_000 })
 * await engine.startExternal()
 *
 * function App() {
 *   return (
 *     <GwenCanvas engine={engine} shadows camera={{ position: [0, 5, 10] }}>
 *       <ambientLight />
 *       <Scene />
 *     </GwenCanvas>
 *   )
 * }
 * ```
 *
 * @since 1.0.0
 */
export function GwenCanvas({
  engine,
  children,
  ...canvasProps
}: GwenCanvasProps): React.JSX.Element {
  return (
    <Canvas {...canvasProps}>
      <GwenProvider engine={engine}>
        <GwenLoop />
        {children}
      </GwenProvider>
    </Canvas>
  );
}
