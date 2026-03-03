/**
 * GWEN Engine Global Singleton
 *
 * Manages the global Engine instance for convenience.
 * @internal
 */

import type { EngineConfig } from '../types';
import { Engine } from './engine';

// ============= Global Instance =============

let globalEngine: Engine | null = null;

export function getEngine(config?: Partial<EngineConfig>): Engine {
  if (!globalEngine) globalEngine = new Engine(config);
  return globalEngine;
}

export function useEngine(): Engine {
  if (!globalEngine) throw new Error('[GWEN] Engine not initialized. Call getEngine() first.');
  return globalEngine;
}

export function resetEngine(): void {
  globalEngine = null;
}

