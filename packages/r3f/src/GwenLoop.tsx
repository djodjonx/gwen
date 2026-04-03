/**
 * @file GwenLoop — R3F `useFrame` bridge for the GWEN game loop.
 *
 * Drives `engine.advance(dt)` once per React Three Fiber frame so that
 * GWEN systems, WASM physics, and plugin hooks run in sync with the R3F
 * render loop.
 *
 * @remarks
 * R3F provides delta time in **seconds**; `GwenEngine.advance` expects
 * delta time in **milliseconds**. This component converts automatically.
 *
 * @internal
 */

import { useFrame } from '@react-three/fiber';
import { useGwenEngine } from './context.js';

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Bridges the React Three Fiber `useFrame` loop into the GWEN engine.
 *
 * Renders nothing — place it anywhere inside a {@link GwenProvider} tree.
 * Typically used as a sibling of your scene objects inside `<GwenCanvas>`.
 *
 * Each R3F frame, this component calls `engine.advance(delta * 1000)` to
 * step all registered GWEN plugins and systems. If `advance` rejects
 * (e.g. due to a plugin error) the error is logged to `console.error` and
 * the frame is skipped gracefully.
 *
 * @example
 * ```tsx
 * import { GwenProvider, GwenLoop } from '@gwenjs/r3f'
 * import { Canvas } from '@react-three/fiber'
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
 * @internal
 * @since 1.0.0
 */
export function GwenLoop(): null {
  const engine = useGwenEngine();

  useFrame((_, delta) => {
    // R3F delta is in seconds; GwenEngine.advance expects milliseconds.
    const promise = engine.advance(delta * 1000);
    if (promise && typeof promise.catch === 'function') {
      void promise.catch((err: unknown) => {
        console.error('[GwenLoop] engine.advance() failed:', err);
      });
    }
  });

  return null;
}
