import type { EngineConfig, WasmPlugin, TsPlugin } from './types';
import type { AnyGwenPlugin, MergeProvides } from './plugin';
import { Engine } from './engine';
import { SceneManager } from './scene';

// ...existing code...

/**
 * Default engine configuration - Pure logic, no rendering concerns
 * Matches Nuxt-like config pattern with wasm/ts plugin separation
 */
export const defaultConfig: EngineConfig = {
  maxEntities: 5000,
  targetFPS: 60,
  debug: false,
  enableStats: true,
  wasmPlugins: [],
  tsPlugins: [],
};

/**
 * Merge user config with defaults
 * Handles both new (wasm/ts) plugin formats
 */
export function mergeConfigs(defaults: EngineConfig, user: Partial<EngineConfig>): EngineConfig {
  return {
    ...defaults,
    ...user,
    wasmPlugins: [...(defaults.wasmPlugins || []), ...(user.wasmPlugins || [])],
    tsPlugins: [...(defaults.tsPlugins || []), ...(user.tsPlugins || [])],
  };
}

/**
 * Résultat typé de defineConfig() — expose le ServiceMap inféré des plugins.
 *
 * `Services` est l'intersection des `provides` de tous les plugins déclarés.
 */
export interface TypedEngineConfig<Services extends Record<string, unknown>> {
  readonly _services: Services; // type fantôme — jamais lu à runtime
  readonly maxEntities?: number;
  readonly targetFPS?: number;
  readonly debug?: boolean;
  readonly enableStats?: boolean;
  readonly plugins?: TsPlugin[];
  readonly wasmPlugins?: WasmPlugin[];
  /**
   * Scène à charger au démarrage.
   *
   * Si non précisé, le prepare() cherche une scène nommée 'Main', 'MainMenu'
   * ou 'Boot', sinon la première scène détectée.
   *
   * @example mainScene: 'MainMenu'
   */
  readonly mainScene?: string;
  /**
   * Chargement automatique des scènes depuis src/scenes/.
   *
   * - `'auto'` (défaut) : scan de src/scenes\/*.ts par le CLI au prepare.
   *   Le fichier .gwen/scenes.ts est généré avec les imports + enregistrements.
   * - `false` : désactivé, gérez vos scènes manuellement dans main.ts.
   */
  readonly scenes?: 'auto' | false;
  /**
   * Configuration du HTML généré par GWEN.
   * Si index.html est absent du projet, GWEN en génère un automatiquement.
   *
   * @example
   * html: {
   *   title: 'My Game',
   *   canvasId: 'game-canvas',
   *   canvasWidth: 800,
   *   canvasHeight: 600,
   *   background: '#000',
   * }
   */
  readonly html?: {
    /** Titre de la page. Défaut : nom du projet */
    title?: string;
    /** Couleur de fond de la page. Défaut : '#000' */
    background?: string;
  };
}

/**
 * Définit la configuration d'un projet GWEN avec inférence complète des services.
 *
 * Les services exposés par chaque plugin sont automatiquement fusionnés dans
 * `TypedEngineConfig<Services>`, ce qui permet à `api.services.get()` d'être
 * fortement typé partout dans le projet.
 *
 * ```typescript
 * // gwen.config.ts
 * export default defineConfig({
 *   plugins: [new InputPlugin(), new AudioPlugin()],
 *   wasmPlugins: [Physics2D({ gravity: 9.81 })],
 *   maxEntities: 10_000,
 *   targetFPS: 60,
 * });
 *
 * // Dans un système / plugin
 * onInit(api: EngineAPI<GwenServices>) {
 *   const kb = api.services.get('keyboard'); // → KeyboardInput ✅
 *   const au = api.services.get('audio');    // → AudioManager  ✅
 * }
 * ```
 *
 * @param config Configuration du projet. `plugins` accepte tout plugin
 *   implémentant `GwenPlugin` (avec `provides`) ou `TsPlugin` (sans typage).
 */
export function defineConfig<const Plugins extends readonly AnyGwenPlugin[]>(config: {
  /** Raccourci Nuxt-like : engine: { maxEntities, targetFPS, debug } */
  engine?: { maxEntities?: number; targetFPS?: number; debug?: boolean; enableStats?: boolean };
  plugins?: [...Plugins];
  wasmPlugins?: WasmPlugin[];
  maxEntities?: number;
  targetFPS?: number;
  debug?: boolean;
  enableStats?: boolean;
  /**
   * Scène à charger au démarrage.
   * Si non précisé, recherche 'Main', 'MainMenu' ou 'Boot', puis la première.
   */
  mainScene?: string;
  /**
   * Mode de chargement des scènes.
   * - `'auto'` (défaut) : scan src/scenes\/*.ts au `gwen prepare`.
   * - `false` : désactivé, gestion manuelle dans main.ts.
   */
  scenes?: 'auto' | false;
  html?: {
    title?: string;
    background?: string;
  };
}): TypedEngineConfig<MergeProvides<Plugins>> {
  return config as any;
}

/**
 * Crée un Engine et un SceneManager depuis une TypedEngineConfig.
 *
 * Instancie l'engine, enregistre tous les plugins déclarés dans `config.plugins`
 * et retourne `{ engine, scenes }` prêts à l'emploi.
 *
 * Le `sceneLoader` est généré automatiquement par `gwen prepare` dans
 * `.gwen/scenes.ts`. Il reçoit le `SceneManager` et enregistre toutes les
 * scènes découvertes dans `src/scenes/`. Si `scenes: false` dans la config,
 * passez `undefined` et gérez vos scènes manuellement.
 *
 * ```typescript
 * // main.ts — généré par create-gwen-app
 * import { initWasm, createEngine } from '@gwen/engine-core';
 * import gwenConfig from '../gwen.config';
 * import { registerScenes, mainScene } from '../.gwen/scenes';
 *
 * await initWasm();
 * const { engine, scenes } = createEngine(gwenConfig, registerScenes, mainScene);
 * engine.start();
 * ```
 */
export function createEngine(
  config: TypedEngineConfig<any>,
  sceneLoader?: (scenes: SceneManager) => void,
  mainScene?: string,
): {
  engine: Engine;
  scenes: SceneManager;
} {
  const raw = config as any;
  const engineOpts = raw.engine ?? {};
  const engine = new Engine({
    maxEntities: engineOpts.maxEntities ?? raw.maxEntities ?? 5000,
    targetFPS: engineOpts.targetFPS ?? raw.targetFPS ?? 60,
    debug: engineOpts.debug ?? raw.debug ?? false,
    enableStats: engineOpts.enableStats ?? raw.enableStats ?? true,
  });

  const scenes = new SceneManager();
  engine.registerSystem(scenes);

  // Enregistrer les plugins déclarés dans config.plugins
  const plugins: TsPlugin[] = raw.plugins ?? [];
  for (const plugin of plugins) {
    engine.registerSystem(plugin);
  }

  // Charger les scènes via le loader généré par prepare (si fourni)
  if (sceneLoader) {
    sceneLoader(scenes);

    // Déterminer la scène principale :
    // 1. Paramètre explicite passé à createEngine
    // 2. mainScene dans la config
    // 3. Convention : 'Main', 'MainMenu', 'Boot'
    // 4. Fallback : première scène enregistrée
    const resolvedMain = mainScene ?? raw.mainScene ?? resolveMainScene(scenes);

    if (resolvedMain) {
      try {
        scenes.loadSceneImmediate(resolvedMain, engine.getAPI());
      } catch {
        console.warn(`[GWEN] mainScene '${resolvedMain}' not found — no scene loaded.`);
      }
    }
  }

  return { engine, scenes };
}

/**
 * Résout la scène principale par convention parmi les scènes enregistrées.
 * Cherche dans l'ordre : 'Main', 'MainMenu', 'Boot', puis la première.
 */
function resolveMainScene(scenes: SceneManager): string | null {
  const candidates = ['Main', 'MainMenu', 'Boot'];
  for (const name of candidates) {
    if (scenes.hasScene(name)) return name;
  }
  // Fallback : première scène enregistrée
  const all = scenes.getSceneNames();
  return all.length > 0 ? all[0] : null;
}

/**
 * Extrait le type `Services` d'une `TypedEngineConfig`.
 *
 * ```typescript
 * const config = defineConfig({ plugins: [new InputPlugin()] });
 * export type GwenServices = GwenConfigServices<typeof config>;
 * // → { keyboard: KeyboardInput; mouse: MouseInput; ... }
 * ```
 */
export type GwenConfigServices<C> =
  C extends TypedEngineConfig<infer S> ? S : Record<string, unknown>;

/**
 * Advanced builder with chaining
 *
 * @example
 * ```typescript
 * const config = new ConfigBuilder()
 *   .setMaxEntities(10000)
 *   .setTargetFPS(60)
 *   .addWasmPlugin(Physics2D({ gravity: 9.81 }))
 *   .addTsPlugin(Input())
 *   .addTsPlugin(Audio())
 *   .enableDebug()
 *   .build();
 *
 * const engine = new Engine(config);
 * ```
 */
export class ConfigBuilder {
  private config: Partial<EngineConfig> = {
    maxEntities: defaultConfig.maxEntities,
    targetFPS: defaultConfig.targetFPS,
    debug: defaultConfig.debug,
    enableStats: defaultConfig.enableStats,
    wasmPlugins: [],
    tsPlugins: [],
  };

  public setMaxEntities(count: number): this {
    this.config.maxEntities = count;
    return this;
  }

  public setTargetFPS(fps: number): this {
    this.config.targetFPS = fps;
    return this;
  }

  public enableDebug(): this {
    this.config.debug = true;
    return this;
  }

  public disableDebug(): this {
    this.config.debug = false;
    return this;
  }

  public enableStats(): this {
    this.config.enableStats = true;
    return this;
  }

  public disableStats(): this {
    this.config.enableStats = false;
    return this;
  }

  /**
   * Add WASM plugin (Rust-compiled, performance-critical)
   * Examples: Physics2D, NetworkingEngine, CustomAI
   */
  public addWasmPlugin(plugin: any): this {
    if (!this.config.wasmPlugins) {
      this.config.wasmPlugins = [];
    }
    this.config.wasmPlugins.push(plugin);
    return this;
  }

  /**
   * Add TypeScript plugin (bundled with game, web APIs)
   * Examples: Input, Audio, AssetManager, UI
   */
  public addTsPlugin(plugin: any): this {
    if (!this.config.tsPlugins) {
      this.config.tsPlugins = [];
    }
    this.config.tsPlugins.push(plugin);
    return this;
  }

  /**
   * Build final configuration
   */

  public build(): EngineConfig {
    return mergeConfigs(defaultConfig, this.config);
  }
}
