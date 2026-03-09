/**
 * Global ambient augmentations — enriched by `gwen prepare`.
 *
 * These interfaces extend core types with permissive index signatures (before gwen prepare)
 * to allow test code that creates EngineAPIImpl with Record<string, unknown>.
 *
 * After `gwen prepare` runs, `.gwen/gwen.d.ts` extends these with strict services/hooks.
 */

import type { GwenHooks } from '@gwen/schema';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
declare global {
  /**
   * Global service registry enriched by `.gwen/gwen.d.ts`.
   *
   * Before prepare: accepts any service (needed for test code).
   * After prepare: extended with strict project-specific services.
   */
  interface GwenDefaultServices {}

  /**
   * Global hooks registry enriched by `.gwen/gwen.d.ts`.
   *
   * Extends GwenHooks to maintain variance compatibility.
   * Before prepare: also accepts any hook via index signature.
   * After prepare: extended with strict project-specific hooks.
   */
  interface GwenDefaultHooks extends GwenHooks {}
}

export {};
