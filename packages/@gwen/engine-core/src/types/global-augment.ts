/**
 * Global ambient augmentations — enriched by `gwen prepare`.
 *
 * These two interfaces start empty (safe fallback) and are merged at compile-time
 * by `.gwen/gwen.d.ts`, which extends them with the services and hooks inferred
 * from the project's `gwen.config.ts`.
 *
 * This is the same declaration-merging pattern used by Nuxt, Vite and others.
 * Nothing lives here at runtime — it is purely a TypeScript mechanism.
 *
 * @see https://www.typescriptlang.org/docs/handbook/declaration-merging.html
 */

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
declare global {
  /**
   * Global service registry.
   * Enriched by `gwen prepare` with every service declared by installed plugins.
   *
   * The index signature `[key: string]: unknown` satisfies `Record<string, unknown>`
   * so this interface works as the default generic bound for `EngineAPI<M>`.
   *
   * @example After `gwen prepare`:
   * ```ts
   * // .gwen/gwen.d.ts (auto-generated)
   * interface GwenDefaultServices extends _GwenServices {}
   * // → { keyboard: KeyboardInput; audio: AudioManager; … }
   * ```
   */
  interface GwenDefaultServices {
    [key: string]: unknown;
  }

  /**
   * Global hooks registry.
   * Enriched by `gwen prepare` with every hook declared by installed plugins.
   *
   * The index signature satisfies `Record<string, any>` so this interface
   * works as the default generic bound for `EngineAPI<M, H>`.
   *
   * @example After `gwen prepare`:
   * ```ts
   * api.hooks.hook('physics:collision', (event) => { … }); // ✅ typed
   * ```
   */
  interface GwenDefaultHooks {
    [key: string]: (...args: any[]) => any;
  }
}

export {};
