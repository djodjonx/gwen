/**
 * Scene System — lifecycle management for game scenes
 *
 * A Scene encapsulates a self-contained game state (main menu, gameplay, etc.).
 * SceneManager handles transitions: onExit → purge entities → onEnter.
 *
 * SceneManager implements TsPlugin and participates in the game loop.
 * It should be registered FIRST to ensure scenes update before other plugins.
 *
 * @example
 * ```typescript
 * import { SceneManager } from '@gwen/engine-core';
 *
 * const scenes = new SceneManager();
 * engine.registerSystem(scenes);
 *
 * scenes.register(new MainMenuScene());
 * scenes.register(new GameScene());
 * scenes.loadScene('MainMenu', engine.getAPI());
 * ```
 */

import type { TsPlugin, EngineAPI, PluginEntry, SceneNavigator } from '../types';
import { UIManager, type UIDefinition } from './ui';

// ============= Scene Interface =============

export interface Scene {
  /** Unique name identifying this scene. */
  readonly name: string;

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

/** Corps d'une Scene sans le `name` — utilisé par defineScene. */
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

export class SceneManager implements TsPlugin, SceneNavigator {
  readonly name = 'SceneManager';

  private scenes = new Map<string, Scene>();
  private currentScene: Scene | null = null;
  private api: EngineAPI | null = null;
  private sceneUIManager: UIManager | null = null;

  // Pending transition — applied at start of next frame to avoid mid-frame changes
  private pendingScene: string | null = null;

  // ── SceneNavigator ─────────────────────────────────────────────────────

  /** Nom de la scène active (null si aucune). */
  get current(): string | null {
    return this.currentScene?.name ?? null;
  }

  /** Alias de loadScene() — safe depuis onUpdate(). */
  load(name: string): void {
    this.loadScene(name);
  }

  // ── TsPlugin lifecycle ─────────────────────────────────────────────────

  onInit(api: EngineAPI): void {
    this.api = api;
    // Auto-register comme SceneNavigator
    api.services.register('SceneManager', this as SceneNavigator);
  }

  onBeforeUpdate(api: EngineAPI, _dt: number): void {
    // Apply pending scene transition at the very start of the frame
    if (this.pendingScene !== null) {
      this.applyTransition(api, this.pendingScene);
      this.pendingScene = null;
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
   */
  loadScene(name: string): void {
    if (!this.scenes.has(name)) {
      throw new Error(`[SceneManager] Unknown scene '${name}'. Call register() first.`);
    }
    this.pendingScene = name;
  }

  /**
   * Immediately transition to a scene (use only outside the game loop).
   * For in-loop transitions, prefer loadScene().
   */
  loadSceneImmediate(name: string, api: EngineAPI): void {
    if (!this.scenes.has(name)) {
      throw new Error(`[SceneManager] Unknown scene '${name}'. Call register() first.`);
    }
    this.applyTransition(api, name);
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

  private applyTransition(api: EngineAPI, name: string): void {
    const next = this.scenes.get(name)!;
    const registrar = api.services.has('PluginRegistrar')
      ? (api.services.get('PluginRegistrar') as unknown as import('../types').IPluginRegistrar)
      : null;

    // 1. Exit current scene
    if (this.currentScene) {
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
    }

    // 2. Purge all entities
    this.purgeEntities(api);

    // 3. Enter new scene
    this.currentScene = next;

    // Resolve system entries: direct object or no-arg factory
    const resolvedSystems: TsPlugin[] = (next.systems ?? []).map((s) =>
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
    next.onEnter(api);
  }

  /**
   * Destroy all alive entities.
   * Called between scene transitions to free ECS slots.
   */
  private purgeEntities(api: EngineAPI): void {
    const all = api.query([]);
    for (const id of all) {
      api.destroyEntity(id);
    }
  }

  /**
   * Monte le layout HTML de la scène dans #gwen-ui.
   * Crée le conteneur s'il n'existe pas.
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

  /** Vide le conteneur #gwen-ui. */
  private unmountLayout(): void {
    if (typeof document === 'undefined') return;
    const ui = document.getElementById('gwen-ui');
    if (ui) {
      ui.innerHTML = '';
      ui.style.display = 'none';
    }
  }
}
