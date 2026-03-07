import type { EngineConfig, GwenPlugin } from '../types';
import type { MergePluginsProvides, MergePluginsHooks } from '../plugin-system/plugin';
import { isWasmPlugin } from '../plugin-system/plugin-utils';
import { Engine } from '../engine/engine';
import { SceneManager } from '../api/scene';
import { SharedMemoryManager } from '../wasm/shared-memory';
import { PluginDataBus } from '../wasm/plugin-data-bus';
import { getWasmBridge } from '../engine/wasm-bridge';
export { ConfigBuilder } from './config-builder';

/**
 * Default engine configuration values.
 *
 * Used as the base for `mergeConfigs()` and `new Engine()` when no config is provided.
 */
export const defaultConfig: EngineConfig = {
  maxEntities: 5000,
  targetFPS: 60,
  debug: false,
  enableStats: true,
  plugins: [],
};

/**
 * Merge a user-supplied partial config with a base config.
 *
 * Plugin arrays are concatenated: base plugins come first, user plugins second.
 * Legacy `tsPlugins` and `wasmPlugins` arrays are also merged for backward
 * compatibility — they are drained by `createEngine()` into the unified pipeline.
 *
 * @param defaults - Base configuration (typically `defaultConfig`).
 * @param user     - Partial user configuration to merge on top.
 * @returns Merged `EngineConfig`.
 */
export function mergeConfigs(defaults: EngineConfig, user: Partial<EngineConfig>): EngineConfig {
  return {
    ...defaults,
    ...user,
    plugins: [...(defaults.plugins ?? []), ...(user.plugins ?? [])],
    // Legacy arrays — kept for backward compatibility
    wasmPlugins: [...(defaults.wasmPlugins ?? []), ...(user.wasmPlugins ?? [])],
    tsPlugins: [...(defaults.tsPlugins ?? []), ...(user.tsPlugins ?? [])],
  };
}

/**
 * Typed result of `defineConfig()`.
 *
 * Carries two phantom type parameters that are inferred from the declared
 * plugins and used by `gwen prepare` to generate `GwenDefaultServices` and
 * `GwenDefaultHooks` in `.gwen/gwen.d.ts`.
 *
 * - `Services` — intersection of every plugin's `provides` map.
 * - `Hooks`    — `GwenHooks` & intersection of every plugin's `providesHooks`.
 *
 * Neither `_services` nor `_hooks` is read at runtime — they are purely
 * compile-time markers.
 */
export interface TypedEngineConfig<
  Services extends object = Record<string, unknown>,
  Hooks extends object = Record<string, never>,
> {
  /** @internal Phantom type — never read at runtime. */
  readonly _services: Services;
  /** @internal Phantom type — never read at runtime. */
  readonly _hooks: Hooks;
  readonly maxEntities?: number;
  readonly targetFPS?: number;
  readonly debug?: boolean;
  readonly enableStats?: boolean;
  /**
   * All plugins — TS-only and WASM plugins in a single array.
   *
   * `createEngine()` automatically splits them by inspecting the `wasm`
   * sub-object (via `isWasmPlugin()`).
   */
  readonly plugins?: GwenPlugin[];
  /**
   * @deprecated Use `plugins` instead.
   * Kept for backward compatibility — entries are merged into `plugins`
   * by `createEngine()` before processing.
   */
  readonly tsPlugins?: GwenPlugin[];
  /**
   * @deprecated Use `plugins` instead.
   * Kept for backward compatibility — entries are merged into `plugins`
   * by `createEngine()` before processing.
   */
  readonly wasmPlugins?: GwenPlugin[];
  /**
   * Scene to load at engine startup.
   *
   * If omitted, `createEngine()` looks for scenes named `'Main'`, `'MainMenu'`
   * or `'Boot'`, then falls back to the first registered scene.
   */
  readonly mainScene?: string;
  /**
   * Automatic scene loading from `src/scenes/`.
   *
   * - `'auto'` (default) — the CLI scans `src/scenes/*.ts` during `prepare`
   *   and generates `.gwen/scenes.ts` with imports + registrations.
   * - `false` — disabled; manage scenes manually in `main.ts`.
   */
  readonly scenes?: 'auto' | false;
  /** HTML generation settings used by `gwen prepare` to scaffold `index.html`. */
  readonly html?: {
    /** Page `<title>`. Defaults to the project folder name. */
    title?: string;
    /** Page background colour. Defaults to `'#000'`. */
    background?: string;
  };
}

// ── defineConfig overloads ────────────────────────────────────────────────────

/**
 * Shape of the config object accepted by `defineConfig()`.
 * Separated into its own type so both overloads share the same parameter list.
 */
type DefineConfigInput<
  Plugins extends readonly GwenPlugin[],
  TsPlugins extends readonly GwenPlugin[],
  WasmPlugins extends readonly GwenPlugin[],
> = {
  engine?: { maxEntities?: number; targetFPS?: number; debug?: boolean; enableStats?: boolean };
  /** Unified plugin array — TS-only and WASM plugins mixed in declaration order. */
  plugins?: readonly [...Plugins];
  /** @deprecated Use `plugins` instead. */
  tsPlugins?: readonly [...TsPlugins];
  /** @deprecated Use `plugins` instead. */
  wasmPlugins?: readonly [...WasmPlugins];
  maxEntities?: number;
  targetFPS?: number;
  debug?: boolean;
  enableStats?: boolean;
  mainScene?: string;
  scenes?: 'auto' | false;
  html?: { title?: string; background?: string };
};

/**
 * Define a GWEN project configuration with full service and hook type inference.
 *
 * Services and hooks exposed by each plugin are automatically merged into
 * `TypedEngineConfig<Services, Hooks>`, making `api.services.get()` and
 * `api.hooks.hook()` strongly typed everywhere in the project after
 * `gwen prepare` runs.
 *
 * WASM plugins (those with a `wasm` sub-object) and TS-only plugins can be
 * freely mixed in the `plugins` array — `createEngine()` sorts them automatically.
 *
 * @param config Project configuration.
 * @returns Typed engine configuration carrying inferred `Services` and `Hooks`.
 *
 * @example
 * ```typescript
 * // gwen.config.ts
 * export default defineConfig({
 *   plugins: [
 *     physics2D({ gravity: -9.81 }),
 *     new InputPlugin(),
 *     new AudioPlugin({ masterVolume: 0.8 }),
 *   ],
 *   engine: { maxEntities: 10_000, targetFPS: 60 },
 * });
 *
 * // In any system — fully typed after `gwen prepare`
 * onInit(api) {
 *   const kb  = api.services.get('keyboard'); // → KeyboardInput ✅
 *   const phy = api.services.get('physics');  // → Physics2DAPI ✅
 *   api.hooks.hook('physics:collision', (e) => {}); // ✅ type-safe
 * }
 * ```
 */
export function defineConfig<
  const Plugins extends readonly GwenPlugin[] = [],
  const TsPlugins extends readonly GwenPlugin[] = [],
  const WasmPlugins extends readonly GwenPlugin[] = [],
>(
  config: DefineConfigInput<Plugins, TsPlugins, WasmPlugins>,
): TypedEngineConfig<
  MergePluginsProvides<[...Plugins, ...TsPlugins, ...WasmPlugins]>,
  MergePluginsHooks<[...Plugins, ...TsPlugins, ...WasmPlugins]>
> {
  return config as unknown as TypedEngineConfig<
    MergePluginsProvides<[...Plugins, ...TsPlugins, ...WasmPlugins]>,
    MergePluginsHooks<[...Plugins, ...TsPlugins, ...WasmPlugins]>
  >;
}

/**
 * Create an `Engine` and `SceneManager` from a `TypedEngineConfig`.
 *
 * **This function is async** — it awaits initialisation of every WASM plugin
 * declared in `config.plugins` (or the legacy `config.wasmPlugins`) before
 * returning.
 *
 * ### Plugin initialisation order
 * 1. All plugins with `wasm !== undefined` are detected via `isWasmPlugin()`.
 * 2. Their `wasm.prefetch?.()` methods are called **in parallel**.
 * 3. Their `wasm.onInit()` methods are called **sequentially** (memory
 *    allocation must be deterministic).
 * 4. All plugins (WASM and TS-only) are registered with `engine.registerSystem()`
 *    in declaration order so `onInit(api)` and the frame hooks run for every plugin.
 *
 * @param config       Typed engine configuration from `defineConfig()`.
 * @param sceneLoader  Optional scene-registration callback (auto-generated by `gwen prepare`).
 * @param mainScene    Name of the first scene to load (overrides `config.mainScene`).
 *
 * @example
 * ```typescript
 * import { initWasm, createEngine } from '@gwen/engine-core';
 * import gwenConfig from '../gwen.config';
 * import { registerScenes, mainScene } from '../.gwen/scenes';
 *
 * await initWasm();
 * const { engine, scenes } = await createEngine(gwenConfig, registerScenes, mainScene);
 * engine.start();
 * ```
 */
export async function createEngine(
  config: TypedEngineConfig<Record<string, unknown>>,
  sceneLoader?: (scenes: SceneManager) => void,
  mainScene?: string,
): Promise<{ engine: Engine; scenes: SceneManager }> {
  const raw = config as unknown as EngineConfig & {
    plugins?: GwenPlugin[];
    tsPlugins?: GwenPlugin[];
    wasmPlugins?: GwenPlugin[];
    mainScene?: string;
    engine?: Partial<EngineConfig>;
  };

  const engineOpts = raw.engine ?? {};
  const maxEntities = engineOpts.maxEntities ?? raw.maxEntities ?? 5000;

  const engine = new Engine({
    maxEntities,
    targetFPS: engineOpts.targetFPS ?? raw.targetFPS ?? 60,
    debug: engineOpts.debug ?? raw.debug ?? false,
    enableStats: engineOpts.enableStats ?? raw.enableStats ?? true,
  });

  const api = engine.getAPI();
  const scenes = new SceneManager();
  engine.registerSystem(scenes);

  // ── Collect all plugins (new unified array + legacy fallbacks) ────────────
  const allPlugins: GwenPlugin[] = [
    ...(raw.plugins ?? []),
    ...(raw.wasmPlugins ?? []), // @deprecated — backward compat
    ...(raw.tsPlugins ?? []), // @deprecated — backward compat
  ];

  const wasmPlugins = allPlugins.filter(isWasmPlugin);
  const tsOnlyPlugins = allPlugins.filter((p) => !isWasmPlugin(p));

  // ── WASM plugins ──────────────────────────────────────────────────────────
  if (wasmPlugins.length > 0) {
    const bridge = getWasmBridge();

    if (!bridge.isActive()) {
      throw new Error(
        '[GWEN] createEngine(): WASM core not initialized.\n' +
          'Call `await initWasm()` before `await createEngine()`.',
      );
    }

    if (typeof crossOriginIsolated !== 'undefined' && !crossOriginIsolated) {
      console.warn(
        '[GWEN] Cross-origin isolation is inactive (crossOriginIsolated = false).\n' +
          'Add the following HTTP headers to unlock the full WASM plugin performance:\n' +
          '  Cross-Origin-Opener-Policy: same-origin\n' +
          '  Cross-Origin-Embedder-Policy: require-corp\n' +
          'The engine will still work, but SharedArrayBuffer will not be available.',
      );
    }

    const sharedMemory = SharedMemoryManager.create(bridge, maxEntities);
    engine._setSharedMemoryPtr(sharedMemory.getTransformRegion().ptr, maxEntities, sharedMemory);

    // Allocate Plugin Data Bus channels for all WASM plugins
    const pluginDataBus = new PluginDataBus();
    for (const plugin of wasmPlugins) {
      if (plugin.wasm!.channels) {
        for (const channel of plugin.wasm!.channels) {
          pluginDataBus.allocate(plugin.wasm!.id, channel, maxEntities);
        }
      }
    }
    pluginDataBus.writeSentinels();
    engine._setPluginDataBus(pluginDataBus);

    if (raw.debug) {
      console.log(`[GWEN] Fetching ${wasmPlugins.length} WASM plugin(s) in parallel…`);
    }

    // Phase 1 — parallel prefetch
    await Promise.all(
      wasmPlugins.map(async (plugin) => {
        await plugin.wasm!.prefetch?.();
        return plugin;
      }),
    );

    // Phase 2 — sequential onInit + region allocation
    for (const plugin of wasmPlugins) {
      const sharedMemBytes = plugin.wasm!.sharedMemoryBytes ?? 0;
      const region =
        sharedMemBytes > 0 ? sharedMemory.allocateRegion(plugin.wasm!.id, sharedMemBytes) : null;

      await plugin.wasm!.onInit(bridge, region, api, pluginDataBus);
      engine._registerWasmPlugin(plugin);

      if (raw.debug) {
        const memMode = region ? `SAB=${region.byteLength}B` : 'SAB=disabled (DataBus only)';
        console.log(
          `[GWEN] WASM plugin '${plugin.name}' (id='${plugin.wasm!.id}') initialized — ${memMode}`,
        );
      }
    }

    sharedMemory._writeSentinels(bridge);

    if (raw.debug) {
      console.log(
        `[GWEN] Shared buffer: ${sharedMemory.allocatedBytes}B used / ` +
          `${sharedMemory.capacityBytes}B total — sentinels written`,
      );
    }
  }

  // ── TS-only plugins ───────────────────────────────────────────────────────
  for (const plugin of tsOnlyPlugins) {
    engine.registerSystem(plugin);
  }

  // WASM plugins also participate in the TS game loop (onInit, onUpdate…)
  for (const plugin of wasmPlugins) {
    engine.registerSystem(plugin);
  }

  // ── Scene loading ─────────────────────────────────────────────────────────
  if (sceneLoader) {
    sceneLoader(scenes);
    const resolvedMain = mainScene ?? raw.mainScene ?? resolveMainScene(scenes);
    if (resolvedMain) {
      try {
        scenes.loadSceneImmediate(resolvedMain, api);
      } catch {
        console.warn(`[GWEN] mainScene '${resolvedMain}' not found — no scene loaded.`);
      }
    }
  }

  return { engine, scenes };
}

/**
 * Resolve the startup scene by convention.
 *
 * Searches registered scene names in order: `'Main'`, `'MainMenu'`, `'Boot'`.
 * Falls back to the first registered scene if none of those names are found.
 *
 * @param scenes - The `SceneManager` after `sceneLoader` has been called.
 * @returns The resolved scene name, or `null` if no scenes are registered.
 */
function resolveMainScene(scenes: SceneManager): string | null {
  const candidates = ['Main', 'MainMenu', 'Boot'];
  for (const name of candidates) {
    if (scenes.hasScene(name)) return name;
  }
  const all = scenes.getSceneNames();
  return all.length > 0 ? all[0] : null;
}

/**
 * Extract the `Services` type from a `TypedEngineConfig`.
 *
 * Used by `gwen prepare` to generate the `GwenDefaultServices` augmentation
 * in `.gwen/gwen.d.ts`.
 *
 * @example
 * ```typescript
 * const config = defineConfig({ plugins: [new InputPlugin()] });
 * export type MyServices = GwenConfigServices<typeof config>;
 * // → { keyboard: KeyboardInput; mouse: MouseInput; … }
 * ```
 */
export type GwenConfigServices<C> =
  C extends TypedEngineConfig<infer S, any> ? S : Record<string, unknown>;

/**
 * Extract the `Hooks` type from a `TypedEngineConfig`.
 *
 * Used by `gwen prepare` to generate the `GwenDefaultHooks` augmentation
 * in `.gwen/gwen.d.ts`.
 *
 * @example
 * ```typescript
 * const config = defineConfig({ plugins: [new InputPlugin(), physics2D()] });
 * export type MyHooks = GwenConfigHooks<typeof config>;
 * // → GwenHooks & InputPluginHooks & Physics2DHooks
 * ```
 */
export type GwenConfigHooks<C> =
  C extends TypedEngineConfig<any, infer H> ? H : import('../hooks').GwenHooks;
