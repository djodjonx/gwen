/**
 * Engine Globals — singleton access to the global Engine instance.
 *
 * Provides three convenience functions for projects that use a single
 * engine instance (the common case). Advanced setups (tests, SSR) can
 * skip these and manage their own Engine instances directly.
 *
 * @example
 * ```typescript
 * // Initialize once at startup
 * const engine = getEngine({ maxEntities: 5000 });
 *
 * // Access anywhere in the codebase
 * const engine = useEngine(); // throws if not initialized
 *
 * // Reset between tests
 * resetEngine();
 * ```
 */

import type { EngineConfig } from '../types';
import { Engine } from './engine';

let _globalEngine: Engine | null = null;

/**
 * Get or create the global Engine singleton.
 * Creates a new instance on first call using the provided config.
 * Subsequent calls ignore `config` and return the existing instance.
 */
export function getEngine(config?: Partial<EngineConfig>): Engine {
  if (!_globalEngine) _globalEngine = new Engine(config);
  return _globalEngine;
}

/**
 * Access the global Engine singleton.
 * @throws If `getEngine()` has not been called yet.
 */
export function useEngine(): Engine {
  if (!_globalEngine) {
    throw new Error('[GWEN] Engine not initialized. Call getEngine() first.');
  }
  return _globalEngine;
}

/**
 * Destroy the global Engine reference.
 * Primarily useful between tests or during hot-reload.
 */
export function resetEngine(): void {
  _globalEngine = null;
}
