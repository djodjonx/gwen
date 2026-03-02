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

import type { TsPlugin, EngineAPI } from './types';

// ============= Scene Interface =============

export interface Scene {
  /** Unique name identifying this scene. */
  readonly name: string;

  /** Local plugins mounted only while this scene is active. */
  plugins?: TsPlugin[];

  /**
   * Called when the scene becomes active.
   * Create entities, register event listeners, start music, etc.
   */
  onEnter(api: EngineAPI): void;

  /**
   * Called on every frame while the scene is active.
   * Optional — scenes can rely on TsPlugins for update logic instead.
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

// ============= SceneManager =============

export class SceneManager implements TsPlugin {
  readonly name = 'SceneManager';

  private scenes = new Map<string, Scene>();
  private currentScene: Scene | null = null;
  private api: EngineAPI | null = null;

  // Pending transition — applied at start of next frame to avoid mid-frame changes
  private pendingScene: string | null = null;

  onInit(api: EngineAPI): void {
    this.api = api;
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
    this.currentScene?.onRender?.(api);
  }

  onDestroy(): void {
    if (this.currentScene && this.api) {
      this.currentScene.onExit(this.api);
    }
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
      ? api.services.get<import('./types').IPluginRegistrar>('PluginRegistrar')
      : null;

    // 1. Exit current scene
    if (this.currentScene) {
      this.currentScene.onExit(api);
      if (registrar && this.currentScene.plugins) {
        for (const p of this.currentScene.plugins) {
          registrar.unregister(p.name);
        }
      }
    }

    // 2. Purge all entities (clean slate for the new scene)
    this.purgeEntities(api);

    // 3. Enter new scene
    this.currentScene = next;
    if (registrar && next.plugins) {
      for (const p of next.plugins) {
        registrar.register(p);
      }
    }
    next.onEnter(api);
  }

  /**
   * Destroy all alive entities.
   * Called between scene transitions to free ECS slots.
   */
  private purgeEntities(api: EngineAPI): void {
    // Query all entities (empty query = all alive)
    const all = api.query([]);
    for (const id of all) {
      api.destroyEntity(id);
    }
  }
}
