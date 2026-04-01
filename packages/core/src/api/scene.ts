/**
 * Scene System — lifecycle management for game scenes
 *
 * A Scene encapsulates a self-contained game state (main menu, gameplay, etc.).
 * SceneManager handles transitions: onExit → purge entities → onEnter.
 *
 * SceneManager implements GwenPlugin and participates in the game loop.
 * It should be registered FIRST to ensure scenes update before other plugins.
 *
 * @example
 * ```typescript
 * import { SceneManager } from '@gwenengine/core';
 *
 * const scenes = new SceneManager();
 * engine.registerSystem(scenes);
 *
 * scenes.register(new MainMenuScene());
 * scenes.register(new GameScene());
 * scenes.loadScene('MainMenu', engine.getAPI());
 * ```
 */

import type { GwenPlugin, EngineAPI, PluginEntry, SceneNavigator } from '../types';
import { UIManager, type UIDefinition } from './ui';
import type { ReloadContext, ReloadEvaluator } from './scene-context';
import { GlobalStringPoolManager } from '../utils/string-pool.js';

// ============= Scene Interface =============

export interface Scene {
  /** Unique name identifying this scene. */
  readonly name: string;

  /**
   * Optional plugin extension data for this scene.
   *
   * Declared as a partial map of `GwenSceneExtensions` — enriched by `gwen prepare`
   * with each installed plugin's scene schema. Fired via `scene:extensions` hook
   * after `onEnter()` is called.
   *
   * @example
   * ```ts
   * extensions: { physics: { gravity: -9.81 } }
   * ```
   */
  readonly extensions?: Readonly<Partial<GwenSceneExtensions>>;

  /**
   * Controls whether the scene reloads when re-entered.
   *
   * **Behavior:**
   * - `true` (default): Full reload when re-entering (like Unity/Godot)
   *   - Systems destroyed and recreated
   *   - Entities purged
   *   - onExit → onEnter called
   *   - Fresh state guaranteed
   *
   * - `false`: Keep existing state (like Phaser pause/resume)
   *   - Systems keep their closure state
   *   - Entities remain
   *   - onEnter NOT called again
   *
   * - `function`: Dynamic evaluation based on context
   *   - Receives EngineAPI and ReloadContext
   *   - Return true to reload, false to keep state
   *
   * **When is this checked?**
   * Only when `scene.load('SceneName')` is called while already in 'SceneName'.
   * Normal transitions between different scenes always reload.
   *
   * @default true
   *
   * @example
   * ```typescript
   * // Always reload (like Unity) - DEFAULT behavior
   * reloadOnReenter: true
   * ```
   *
   * @example
   * ```typescript
   * // Never reload (like pause menu)
   * reloadOnReenter: false
   * ```
   *
   * @example
   * ```typescript
   * // Conditional - reload only on game over
   * reloadOnReenter: (api, ctx) => {
   *   return ctx.data?.reason === 'gameOver';
   * }
   * ```
   *
   * @example
   * ```typescript
   * // Conditional - reload after 3+ deaths
   * reloadOnReenter: (api, ctx) => {
   *   return ctx.enterCount > 3;
   * }
   * ```
   *
   * @see ReloadContext for available context properties
   * @see ReloadEvaluator for function signature
   */
  reloadOnReenter?: boolean | ReloadEvaluator;

  /**
   * Systems that run while this scene is active.
   * Accepts direct objects (System) or no-arg factories (() => System).
   * SceneManager automatically resolves factories when the scene activates.
   *
   * Systems provide the game logic (movement, collision, input handling, etc).
   * They run each frame in the order they're declared.
   *
   * @example
   * ```ts
   * systems: [
   *   MovementSystem,      // First
   *   CollisionSystem,     // Second
   *   PlayerSystem,        // Third
   * ]
   * ```
   */
  systems?: PluginEntry[];

  /**
   * UIDefinitions to render for this scene.
   * The framework automatically creates a UIManager, registers them
   * in declared order (= render order), and injects after systems.
   *
   * @example
   * ```ts
   * readonly ui = [
   *   BackgroundUI,  // First — drawn first
   *   EnemyUI,
   *   PlayerUI,
   *   ScoreUI,       // Last — on top of everything
   * ];
   * ```
   */
  ui?: UIDefinition<any>[];

  /**
   * HTML layout injected into #gwen-ui while the scene is active.
   */
  layout?: string;

  /**
   * Called when the scene becomes active.
   * Create entities, register event listeners, start music, etc.
   */
  onEnter(api: EngineAPI): void;

  /**
   * Called on every frame while the scene is active.
   * Optional — scenes can rely on systems for update logic instead.
   */
  onUpdate?(api: EngineAPI, deltaTime: number): void;

  /**
   * Called every frame for rendering.
   * Optional — use for scenes that draw directly (e.g. menus).
   */
  onRender?(api: EngineAPI): void;

  /**
   * Called before the scene is replaced by another.
   * Stop music, save state, unregister listeners, etc.
   */
  onExit(api: EngineAPI): void;
}

// ── SceneBody ─────────────────────────────────────────────────────────────────

/** A `Scene` body without the `name` field — used by the factory form of `defineScene`. */
export type SceneBody = Omit<Scene, 'name'>;

/**
 * Define a GWEN Scene — two supported syntaxes.
 *
 * **Form 1 — direct object** (no external dependencies):
 * ```ts
 * export const PauseScene = defineScene({
 *   name: 'Pause',
 *   ui: [PauseUI],
 *   onEnter(api) { ... },
 *   onExit(api)  { ... },
 * });
 * // Usage:
 * sceneManager.register(PauseScene);
 * ```
 *
 * **Form 2 — factory** (with injected typed dependencies):
 * ```ts
 * export const GameScene = defineScene('Game', (scenes: SceneManager) => ({
 *   ui: [BackgroundUI, PlayerUI],
 *   systems: [MovementSystem, PlayerSystem, CollisionSystem],
 *   onEnter(api) { ... },
 *   onExit(api)  { ... },
 * }));
 * // Usage — dependencies injected at registration:
 * sceneManager.register(GameScene(scenes));
 * //                     ↑ (scenes: SceneManager) → Scene
 * ```
 *
 * TypeScript enforces factory if a string is passed:
 * ```ts
 * defineScene('Game')             // ❌ TS2554 — Expected 2 arguments
 * defineScene({ onEnter: fn })    // ❌ TS     — missing name
 * defineScene('Game', () => ({})) // ❌ TS     — missing onEnter and onExit
 * ```
 *
 * Classes implementing `Scene` are still supported — zero breaking change.
 */

// Overload 1 — direct object
export function defineScene(config: Scene): Scene;

// Overload 2 — factory (required), returns callable function
export function defineScene<Args extends unknown[]>(
  name: string,
  factory: (...args: Args) => SceneBody,
): (...args: Args) => Scene;

// Implementation
export function defineScene<Args extends unknown[]>(
  nameOrConfig: string | Scene,
  factory?: (...args: Args) => SceneBody,
): Scene | ((...args: Args) => Scene) {
  if (typeof nameOrConfig === 'string') {
    // Form 2 — returns callable factory
    return (...args: Args): Scene => ({
      name: nameOrConfig,
      ...factory!(...args),
    });
  }
  // Form 1 — direct object
  return nameOrConfig;
}

// ============= SceneManager =============

export class SceneManager implements GwenPlugin, SceneNavigator {
  readonly name = 'SceneManager';

  private scenes = new Map<string, Scene>();
  private currentScene: Scene | null = null;
  private api: EngineAPI | null = null;
  private sceneUIManager: UIManager | null = null;

  // Pending transition — applied at start of next frame to avoid mid-frame changes
  private pendingScene: string | null = null;
  private pendingSceneData: Record<string, unknown> | undefined = undefined;

  // Tracking for reload evaluation
  private sceneEnterCounts = new Map<string, number>();

  // ── SceneNavigator ─────────────────────────────────────────────────────

  /** Name of the currently active scene, or `null` if none. */
  get current(): string | null {
    return this.currentScene?.name ?? null;
  }

  /** Alias for `loadScene()` — safe to call from `onUpdate()`. */
  load(name: string, data?: Record<string, unknown>): void {
    this.loadScene(name, data);
  }

  // ── GwenPlugin lifecycle ───────────────────────────────────────────────

  onInit(api: EngineAPI): void {
    this.api = api;
    // Self-register as SceneNavigator so api.scene is available to all plugins
    api.services.register('SceneManager', this as SceneNavigator);
  }

  async onBeforeUpdate(api: EngineAPI, _dt: number): Promise<void> {
    // Apply pending scene transition at the very start of the frame
    if (this.pendingScene) {
      const sceneName = this.pendingScene;
      const sceneData = this.pendingSceneData;
      this.pendingScene = null;
      this.pendingSceneData = undefined;
      await this.applyTransition(api, sceneName, sceneData);
    }
  }

  onUpdate(api: EngineAPI, deltaTime: number): void {
    this.currentScene?.onUpdate?.(api, deltaTime);
  }

  onRender(api: EngineAPI): void {
    this.sceneUIManager?.onRender(api);
    this.currentScene?.onRender?.(api);
  }

  onDestroy(): void {
    if (this.currentScene && this.api) {
      this.currentScene.onExit(this.api);
    }
    this.sceneUIManager?.onDestroy();
    this.sceneUIManager = null;
    this.currentScene = null;
    this.api = null;
  }

  // ── Scene registration ─────────────────────────────────────────────────

  /** Register a scene by name. */
  register(scene: Scene): this {
    if (this.scenes.has(scene.name)) {
      console.warn(`[SceneManager] Scene '${scene.name}' already registered — overwriting.`);
    }
    this.scenes.set(scene.name, scene);
    return this;
  }

  /** Check if a scene is registered. */
  hasScene(name: string): boolean {
    return this.scenes.has(name);
  }

  /** Returns all registered scene names (in registration order). */
  getSceneNames(): string[] {
    return Array.from(this.scenes.keys());
  }

  // ── Scene transitions ──────────────────────────────────────────────────

  /**
   * Schedule a scene transition for the start of the next frame.
   * Safe to call from onUpdate() or game logic.
   *
   * @param name - Scene name to load
   * @param data - Optional data passed to reload evaluator
   */
  loadScene(name: string, data?: Record<string, unknown>): void {
    if (!this.scenes.has(name)) {
      throw new Error(`[SceneManager] Unknown scene '${name}'. Call register() first.`);
    }
    this.pendingScene = name;
    this.pendingSceneData = data;
  }

  /**
   * Immediately transition to a scene (use only outside the game loop).
   * For in-loop transitions, prefer loadScene().
   *
   * @param name - Scene name to load
   * @param api - Engine API instance
   * @param data - Optional data passed to reload evaluator
   */
  async loadSceneImmediate(
    name: string,
    api: EngineAPI,
    data?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.scenes.has(name)) {
      throw new Error(`[SceneManager] Unknown scene '${name}'. Call register() first.`);
    }
    await this.applyTransition(api, name, data);
  }

  /** Name of the currently active scene (null if none). */
  getCurrentSceneName(): string | null {
    return this.currentScene?.name ?? null;
  }

  /** Currently active scene (null if none). */
  getCurrentScene(): Scene | null {
    return this.currentScene;
  }

  // ── Private ────────────────────────────────────────────────────────────

  /**
   * Evaluate if a scene should reload when re-entering.
   *
   * @param scene - Scene to evaluate
   * @param context - Reload context
   * @returns true if should reload, false otherwise
   */
  private shouldReload(scene: Scene, context: ReloadContext): boolean {
    const reloadConfig = scene.reloadOnReenter;

    // Default: true (like Unity/Godot - always reload)
    if (reloadConfig === undefined) {
      return true;
    }

    // Boolean config
    if (typeof reloadConfig === 'boolean') {
      return reloadConfig;
    }

    // Function evaluator
    return reloadConfig(this.api!, context);
  }

  private async applyTransition(
    api: EngineAPI,
    name: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    const next = this.scenes.get(name)!;
    const fromSceneName = this.currentScene?.name ?? null;
    const isReenter = fromSceneName === name;

    // Increment enter count
    const enterCount = (this.sceneEnterCounts.get(name) || 0) + 1;
    this.sceneEnterCounts.set(name, enterCount);

    // Build reload context
    const context: ReloadContext = {
      fromScene: fromSceneName,
      toScene: name,
      isReenter,
      enterCount,
      ...(data !== undefined ? { data } : {}),
    };

    // Evaluate if we should reload
    const shouldReload = isReenter && this.shouldReload(next, context);

    // If re-entering and should NOT reload, do nothing
    if (isReenter && !shouldReload) {
      return;
    }

    // If reload is happening, emit hook
    if (isReenter && shouldReload) {
      try {
        await (api.hooks.callHook as (name: string, ...args: any[]) => Promise<void>)(
          'scene:willReload',
          name,
          context,
        );
      } catch (err) {
        console.error(`[SceneManager] Error in scene:willReload hook for '${name}':`, err);
      }
    }

    const registrar = api.services.has('PluginRegistrar')
      ? (api.services.get('PluginRegistrar') as unknown as import('../types').IPluginRegistrar)
      : null;

    // 1. Exit current scene
    if (this.currentScene) {
      const currentName = this.currentScene.name;

      // Call scene:beforeUnload hook (synchronous)
      try {
        await api.hooks.callHook('scene:beforeUnload', currentName);
      } catch (err) {
        console.error(`[SceneManager] Error in scene:beforeUnload hook for '${currentName}':`, err);
      }

      this.currentScene.onExit(api);

      if (registrar && this.currentScene.systems) {
        for (const p of this.currentScene.systems) {
          registrar.unregister(p.name);
        }
      }
      // Unmount auto-created UIManager
      registrar?.unregister('UIManager');
      this.sceneUIManager?.onDestroy();
      this.sceneUIManager = null;
      this.unmountLayout();

      // Call scene:unload hook (synchronous)
      try {
        await api.hooks.callHook('scene:unload', currentName);
      } catch (err) {
        console.error(`[SceneManager] Error in scene:unload hook for '${currentName}':`, err);
      }
    }

    // 2. Purge all entities
    this.purgeEntities(api);

    // Call scene:unloaded hook if there was a previous scene (synchronous)
    if (this.currentScene) {
      const previousName = this.currentScene.name;
      try {
        await api.hooks.callHook('scene:unloaded', previousName);
      } catch (err) {
        console.error(`[SceneManager] Error in scene:unloaded hook for '${previousName}':`, err);
      }
    }

    // 3. Enter new scene
    this.currentScene = next;

    // Call scene:beforeLoad hook (synchronous)
    try {
      await api.hooks.callHook('scene:beforeLoad', name);
    } catch (err) {
      console.error(`[SceneManager] Error in scene:beforeLoad hook for '${name}':`, err);
    }

    // Resolve system entries: direct object or no-arg factory
    const resolvedSystems: GwenPlugin[] = (next.systems ?? []).map((s) =>
      typeof s === 'function' ? s() : s,
    );

    // Register resolved systems
    if (registrar && resolvedSystems.length > 0) {
      for (const s of resolvedSystems) {
        registrar.register(s);
      }
    }

    // Auto-inject UIManager if scene declares ui[]
    if (next.ui && next.ui.length > 0) {
      const uiManager = new UIManager();
      for (const def of next.ui) {
        uiManager.register(def);
      }
      this.sceneUIManager = uiManager; // stored locally → dispatched by onRender
      registrar?.register(uiManager); // registered in PluginManager if available
    }

    if (next.layout) {
      this.mountLayout(next.layout);
    }

    // Call scene:load hook
    try {
      await api.hooks.callHook('scene:load', name);
    } catch (err) {
      console.error(`[SceneManager] Error in scene:load hook for '${name}':`, err);
    }

    next.onEnter(api);

    // Dispatch scene extensions to plugins — only when extensions are declared
    if (next.extensions && Object.keys(next.extensions).length > 0) {
      try {
        await (api.hooks.callHook as (name: string, ...args: any[]) => Promise<void>)(
          'scene:extensions',
          name,
          next.extensions,
        );
      } catch (err) {
        console.error(`[SceneManager] Error in scene:extensions hook for '${name}':`, err);
      }
    }

    // Call scene:loaded hook
    try {
      await api.hooks.callHook('scene:loaded', name);
    } catch (err) {
      console.error(`[SceneManager] Error in scene:loaded hook for '${name}':`, err);
    }
  }

  /**
   * Destroy all alive entities.
   * Called between scene transitions to free ECS slots.
   */
  private purgeEntities(api: EngineAPI): void {
    const all = api.query([]);
    for (const id of all) {
      api.entity.destroy(id);
    }

    // Clear scene-scoped string pool to prevent memory leak
    GlobalStringPoolManager.clearScene();
  }

  /**
   * Mount a scene's HTML layout into the `#gwen-ui` container.
   * Creates the container if it does not exist yet.
   */
  private mountLayout(html: string): void {
    if (typeof document === 'undefined') return;
    let ui = document.getElementById('gwen-ui');
    if (!ui) {
      ui = document.createElement('div');
      ui.id = 'gwen-ui';
      ui.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:10;';
      document.body.appendChild(ui);
    }
    ui.innerHTML = html;
    ui.style.display = '';
  }

  /** Clear the `#gwen-ui` container (called when a scene exits). */
  private unmountLayout(): void {
    if (typeof document === 'undefined') return;
    const ui = document.getElementById('gwen-ui');
    if (ui) {
      ui.innerHTML = '';
      ui.style.display = 'none';
    }
  }
}
