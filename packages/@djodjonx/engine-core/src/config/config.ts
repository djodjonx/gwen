import type { EngineConfig, GwenPlugin } from '../types';
import { isWasmPlugin } from '../plugin-system/plugin-utils';
import { Engine } from '../engine/engine';
import { SceneManager } from '../api/scene';
import { SharedMemoryManager } from '../wasm/shared-memory';
import { PluginDataBus } from '../wasm/plugin-data-bus';
import { getWasmBridge } from '../engine/wasm-bridge';
import { resolveConfig, type GwenConfigInput } from '@djodjonx/gwen-schema';
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
 */
export function mergeConfigs(defaults: EngineConfig, user: Partial<EngineConfig>): EngineConfig {
  return {
    ...defaults,
    ...user,
    plugins: [...(defaults.plugins ?? []), ...(user.plugins ?? [])],
    wasmPlugins: [...(defaults.wasmPlugins ?? []), ...(user.wasmPlugins ?? [])],
    tsPlugins: [...(defaults.tsPlugins ?? []), ...(user.tsPlugins ?? [])],
  };
}

/**
 * Create an `Engine` and `SceneManager` from a user config.
 *
 * The config is normalized and validated by `@djodjonx/gwen-schema/resolveConfig`.
 */
export async function createEngine(
  config: GwenConfigInput = {},
  sceneLoader?: (scenes: SceneManager) => void,
  mainScene?: string,
): Promise<{ engine: Engine; scenes: SceneManager }> {
  const resolved = resolveConfig(config);
  const maxEntities = resolved.engine.maxEntities;

  const engine = new Engine({
    maxEntities,
    targetFPS: resolved.engine.targetFPS,
    debug: resolved.engine.debug,
    enableStats: resolved.engine.enableStats,
  });

  const api = engine.getAPI();
  const scenes = new SceneManager();
  engine.registerSystem(scenes);

  const allPlugins: GwenPlugin[] = [...(resolved.plugins as GwenPlugin[])];
  const wasmPlugins = allPlugins.filter(isWasmPlugin);
  const tsOnlyPlugins = allPlugins.filter((p) => !isWasmPlugin(p));

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

    const pluginDataBus = new PluginDataBus();
    for (const plugin of wasmPlugins) {
      if (plugin.wasm?.channels) {
        for (const channel of plugin.wasm.channels) {
          pluginDataBus.allocate(plugin.wasm.id, channel, maxEntities);
        }
      }
    }
    pluginDataBus.writeSentinels();
    engine._setPluginDataBus(pluginDataBus);

    if (resolved.engine.debug) {
      console.log(`[GWEN] Fetching ${wasmPlugins.length} WASM plugin(s) in parallel…`);
    }

    await Promise.all(
      wasmPlugins.map(async (plugin) => {
        await plugin.wasm?.prefetch?.();
        return plugin;
      }),
    );

    for (const plugin of wasmPlugins) {
      const sharedMemBytes = plugin.wasm?.sharedMemoryBytes ?? 0;
      const region =
        sharedMemBytes > 0 ? sharedMemory.allocateRegion(plugin.wasm!.id, sharedMemBytes) : null;

      // Use a scoped API so any hooks.hook() calls inside onWasmInit are
      // tracked by PluginManager and cleaned up on unregister() / destroyAll().
      const scopedApi = engine._getPluginManager().createScopedApi(plugin, api, engine.hooks);
      await plugin.wasm!.onInit(bridge, region, scopedApi, pluginDataBus);
      engine._registerWasmPlugin(plugin);

      if (resolved.engine.debug) {
        const memMode = region ? `SAB=${region.byteLength}B` : 'SAB=disabled (DataBus only)';
        console.log(
          `[GWEN] WASM plugin '${plugin.name}' (id='${plugin.wasm!.id}') initialized — ${memMode}`,
        );
      }
    }

    sharedMemory._writeSentinels(bridge);

    if (resolved.engine.debug) {
      console.log(
        `[GWEN] Shared buffer: ${sharedMemory.allocatedBytes}B used / ` +
          `${sharedMemory.capacityBytes}B total — sentinels written`,
      );
    }
  }

  for (const plugin of tsOnlyPlugins) {
    engine.registerSystem(plugin);
  }

  for (const plugin of wasmPlugins) {
    engine.registerSystem(plugin);
  }

  if (sceneLoader) {
    sceneLoader(scenes);
    const resolvedMain = mainScene ?? resolved.mainScene ?? resolveMainScene(scenes);
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

function resolveMainScene(scenes: SceneManager): string | null {
  const candidates = ['Main', 'MainMenu', 'Boot'];
  for (const name of candidates) {
    if (scenes.hasScene(name)) return name;
  }
  const all = scenes.getSceneNames();
  return all.length > 0 ? all[0] : null;
}

/** Extract `Services` from config phantom marker. */
export type GwenConfigServices<C> = C extends { _services: infer S }
  ? S extends object
    ? S
    : Record<string, unknown>
  : Record<string, unknown>;

/** Extract `Hooks` from config phantom marker. */
export type GwenConfigHooks<C> = C extends { _hooks: infer H }
  ? H extends object
    ? H
    : import('../hooks').GwenHooks
  : import('../hooks').GwenHooks;
