/**
 * @file Plugin Manager — Orchestrates GwenPlugin lifecycle via hooks
 *
 * Manages plugin registration, initialization, and per-frame dispatch.
 * All plugin lifecycle is coordinated through the hooks system.
 *
 * **Lifecycle Order (per frame):**
 * 1. `plugin:beforeUpdate` - Input capture phase
 * 2. (WASM plugins step)
 * 3. `plugin:update` - Game logic phase
 * 4. `plugin:render` - Rendering phase
 *
 * @see {@link GwenPlugin} for plugin interface
 * @see {@link GwenHooks} for available hooks
 */

import type { GwenPlugin, EngineAPI } from '../types';
import { isWasmPlugin } from './plugin-utils';
import type { GwenHookable } from '../hooks';
import { buildQueryResult } from '../core/query-result';
import { HookLifecycleManager } from './hook-lifecycle-manager';

interface RuntimeErrorPayload {
  phase: 'plugin:beforeUpdate' | 'plugin:update' | 'plugin:render' | 'wasm:onStep';
  plugin: string;
  message: string;
  stack?: string;
  timestamp: number;
  frame: number;
}

/**
 * Convenience alias for the hooks instance enriched by the CLI.
 * `GwenDefaultHooks` is a global interface extended by `gwen prepare`
 * with the hooks declared by each plugin in `gwen.config.ts`.
 */
type DefaultHookable = GwenHookable<GwenDefaultHooks>;

/**
 * Plugin Manager — orchestrates TypeScript plugin lifecycle
 *
 * Handles:
 * - Plugin registration and unregistration
 * - Automatic lifecycle hook setup for each plugin
 * - Per-frame dispatch of plugin lifecycle methods
 * - WASM plugin management
 *
 * **Architecture:**
 * - Each plugin's lifecycle methods (onBeforeUpdate, onUpdate, onRender)
 *   are automatically registered as hooks with the engine
 * - The PluginManager dispatches hooks at the appropriate frame phases
 * - Plugins are called in registration order
 * - Errors in one plugin don't crash the engine
 *
 * @internal Used by Engine internally
 */
export class PluginManager {
  /** Registered TypeScript plugins (in registration order). */
  private plugins: GwenPlugin[] = [];

  /** Registered WASM plugins (those with a `wasm` sub-object). */
  private wasmPlugins: GwenPlugin[] = [];

  /**
   * Centralised hook subscription tracker and scoped-API factory.
   * Replaces the previous inline WeakMap + _track/_cleanup/_createScopedHooks pattern.
   */
  private readonly _lifecycleManager = new HookLifecycleManager();

  private _reportRuntimeError(
    phase: RuntimeErrorPayload['phase'],
    plugin: string,
    err: unknown,
    api: EngineAPI,
    hooks: DefaultHookable,
  ): void {
    const payload: RuntimeErrorPayload = {
      phase,
      plugin,
      message: err instanceof Error ? err.message : String(err),
      timestamp: Date.now(),
      frame: api.frameCount,
      ...(err instanceof Error && err.stack !== undefined ? { stack: err.stack } : {}),
    };

    console.error(`[GWEN:PluginManager] ${phase} failed for '${plugin}':`, payload.message, err);

    try {
      void hooks.callHook('engine:runtimeError', payload);
    } catch (hookErr) {
      console.error('[GWEN:PluginManager] Error in engine:runtimeError hook:', hookErr);
    }

    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('gwen:runtime-error', { detail: payload }));
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // Scoped API (delegated to HookLifecycleManager)
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Create a scoped EngineAPI for a plugin where all `hooks.hook()` calls
   * are automatically tracked and cleaned up on `unregister()` / `destroyAll()`.
   *
   * Used by `createEngine()` to wrap the `api` passed to WASM plugins'
   * `wasm.onInit()`, which runs outside the normal `register()` flow and
   * therefore cannot rely on the scoped API built inside `register()`.
   *
   * @param plugin - The plugin instance (name used as tracking key)
   * @param api    - Engine API to wrap
   * @param hooks  - Hooks system instance
   * @returns A scoped EngineAPI whose `hooks.hook()` is tracked
   *
   * @internal Called by createEngine() for the WASM onWasmInit phase
   */
  createScopedApi(plugin: GwenPlugin, api: EngineAPI, hooks: DefaultHookable): EngineAPI {
    return this._lifecycleManager.createScopedApi(plugin, api, hooks);
  }

  // ════════════════════════════════════════════════════════════════════════
  // Plugin Registration
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Register a TypeScript plugin and set up its lifecycle hooks.
   *
   * **What happens:**
   * 1. Plugin is added to the registry (fails if already registered)
   * 2. `plugin:register` hook is called
   * 3. Plugin lifecycle methods are registered as hooks:
   *    - `onBeforeUpdate` → hooked to `plugin:beforeUpdate` (tracked)
   *    - `onUpdate` → hooked to `plugin:update` (tracked)
   *    - `onRender` → hooked to `plugin:render` (tracked)
   * 4. `plugin:init` hook is called
   * 5. Plugin's `onInit` method is called with scoped API (hooks are auto-tracked)
   *
   * **Errors:**
   * - Returns false if a plugin with the same name is already registered
   * - Errors in hooks are logged but don't stop plugin registration
   *
   * **Hook Tracking (P0-1 v2):**
   * - All automatic lifecycle hooks (via _setupPluginHooks) are tracked
   * - All manual hooks registered in onInit (via scopedApi.hooks.hook) are tracked
   * - Both types are cleaned up automatically during unregister/destroyAll
   *
   * @param plugin - The plugin to register (must have unique name)
   * @param api - Engine API instance to pass to plugin
   * @param hooks - Hooks system instance
   *
   * @returns true if registered successfully, false if duplicate name
   *
   * @example
   * ```typescript
   * const manager = new PluginManager();
   * const plugin: GwenPlugin = {
   *   name: 'MyPlugin',
   *   onInit(api) { console.log('init'); },
   *   onUpdate(api, dt) { console.log('update'); }
   * };
   * const registered = manager.register(plugin, api, hooks);
   * ```
   *
   * @throws Only via hook handlers, not from registration itself
   */
  register(plugin: GwenPlugin, api: EngineAPI, hooks: DefaultHookable): boolean {
    // Check for duplicate
    if (this.plugins.find((p) => p.name === plugin.name)) {
      console.warn(`[GWEN:PluginManager] '${plugin.name}' already registered — skipping.`);
      return false;
    }

    // Validate declared dependencies are already registered
    if (plugin.dependencies && plugin.dependencies.length > 0) {
      for (const dep of plugin.dependencies) {
        if (!this.has(dep)) {
          throw new Error(
            `[GWEN] Plugin '${plugin.name}' requires '${dep}' to be registered first. ` +
              `Register '${dep}' before '${plugin.name}'.`,
          );
        }
      }
    }

    // Add to registry
    this.plugins.push(plugin);

    // Emit plugin:register hook (synchronous)
    try {
      hooks.callHook('plugin:register', plugin);
    } catch (err) {
      console.error(`[GWEN:PluginManager] Error in plugin:register hook:`, err);
    }

    // Auto-register plugin lifecycle methods as hooks (tracked)
    this._setupPluginHooks(plugin, hooks);

    // Emit plugin:init hook (synchronous)
    try {
      hooks.callHook('plugin:init', plugin, api);
    } catch (err) {
      console.error(`[GWEN:PluginManager] Error in plugin:init hook:`, err);
    }

    // Build scoped API — all hooks.hook() calls inside onInit are auto-tracked.
    const scopedApi = this._lifecycleManager.createScopedApi(plugin, api, hooks);

    // Call plugin's onInit with scoped API
    if (plugin.onInit) {
      plugin.onInit(scopedApi);
    }

    return true;
  }

  /**
   * Register plugin lifecycle methods as hooks and track their unsubscribers.
   *
   * Creates closures for `onBeforeUpdate`, `onUpdate`, and `onRender` methods
   * and registers them with the hooks system. The unsubscriber function returned
   * by `hooks.hook()` is captured and stored for later cleanup.
   *
   * **P0-1 v2 Fix:** Previously, the unsubscriber was discarded, causing
   * "zombie handlers" to persist after plugin destruction. Now we track it.
   *
   * **Type Safety:** Uses helper methods to safely coerce specific hook types
   * to the generic index signature without `as any` casts.
   *
   * @param plugin - The plugin whose methods to register
   * @param hooks - The hooks system instance
   * @internal
   */
  private _setupPluginHooks(plugin: GwenPlugin, hooks: DefaultHookable): void {
    if (plugin.onBeforeUpdate) {
      const unregister = this._registerBeforeUpdateHook(plugin, hooks);
      this._lifecycleManager.track(plugin.name, unregister);
    }

    if (plugin.onUpdate) {
      const unregister = this._registerUpdateHook(plugin, hooks);
      this._lifecycleManager.track(plugin.name, unregister);
    }

    if (plugin.onRender) {
      const unregister = this._registerRenderHook(plugin, hooks);
      this._lifecycleManager.track(plugin.name, unregister);
    }
  }

  /**
   * Register a plugin:beforeUpdate hook with type safety.
   *
   * @internal
   */
  private _registerBeforeUpdateHook(plugin: GwenPlugin, hooks: DefaultHookable): () => void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return hooks.hook('plugin:beforeUpdate' as any, (api: unknown, dt: unknown) => {
      if (plugin.onBeforeUpdate) {
        plugin.onBeforeUpdate(api as EngineAPI, dt as number);
      }
    });
  }

  /**
   * Register a plugin:update hook with type safety.
   *
   * When the plugin declares a static `query` descriptor, the query is resolved
   * each frame and injected as the third argument to `onUpdate`.
   *
   * @internal
   */
  private _registerUpdateHook(plugin: GwenPlugin, hooks: DefaultHookable): () => void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return hooks.hook('plugin:update' as any, (api: unknown, dt: unknown) => {
      if (plugin.onUpdate) {
        if (plugin.query) {
          const entities = buildQueryResult(plugin.query, api as EngineAPI);
          plugin.onUpdate(api as EngineAPI, dt as number, entities);
        } else {
          plugin.onUpdate(api as EngineAPI, dt as number);
        }
      }
    });
  }

  /**
   * Register a plugin:render hook with type safety.
   *
   * @internal
   */
  private _registerRenderHook(plugin: GwenPlugin, hooks: DefaultHookable): () => void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return hooks.hook('plugin:render' as any, (api: unknown) => {
      if (plugin.onRender) {
        plugin.onRender(api as EngineAPI);
      }
    });
  }

  /**
   * Register multiple plugins at once.
   *
   * @param plugins - Array of plugins to register
   * @param api - Engine API instance
   * @param hooks - Hooks system instance (plugins can add custom hooks)
   *
   * @example
   * ```typescript
   * manager.registerAll([pluginA, pluginB, pluginC], api, hooks);
   * ```
   */
  registerAll(plugins: GwenPlugin[], api: EngineAPI, hooks: DefaultHookable): void {
    for (const p of plugins) {
      this.register(p, api, hooks);
    }
  }

  /**
   * Unregister a plugin by name and clean up its hooks.
   *
   * **What happens (in order):**
   * 1. Plugin is found by name
   * 2. **All tracked hooks are unsubscribed** (P0-1 v2)
   * 3. `plugin:destroy` hook is called
   * 4. Plugin's `onDestroy` method is called
   * 5. Plugin is removed from registry
   *
   * **P0-1 v2 Fix:** Cleanup is now called FIRST, before any events.
   * This ensures handlers are completely removed before the plugin
   * receives its destruction notification.
   *
   * @param name - Plugin name to unregister
   * @param hooks - Hooks system instance
   *
   * @returns true if unregistered successfully, false if not found
   *
   * @example
   * ```typescript
   * const success = manager.unregister('MyPlugin', hooks);
   * if (!success) console.warn('Plugin not found');
   * ```
   */
  unregister(name: string, hooks: DefaultHookable): boolean {
    const idx = this.plugins.findIndex((p) => p.name === name);
    if (idx === -1) return false;

    const plugin = this.plugins[idx];
    if (!plugin) return false;

    // 1. Clean up ALL hooks (automatic + manual) before any lifecycle events
    this._lifecycleManager.cleanup(plugin.name);

    // 2. Notify the plugin it's being destroyed
    try {
      hooks.callHook('plugin:destroy', plugin);
    } catch (err) {
      console.error(`[GWEN:PluginManager] Error in plugin:destroy hook:`, err);
    }

    // 3. Call plugin's onDestroy
    plugin.onDestroy?.();

    // 4. Remove from registry
    this.plugins.splice(idx, 1);

    return true;
  }

  // ════════════════════════════════════════════════════════════════════════
  // Per-Frame Dispatch
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Dispatch the beforeUpdate phase (input capture).
   *
   * Calls all registered handlers for `plugin:beforeUpdate`.
   * Plugins should use this for input reading and intention capture.
   *
   * @param api - Engine API instance
   * @param deltaTime - Delta time in seconds
   * @param hooks - Hooks system instance
   *
   * @internal Called by Engine._tick()
   */
  async dispatchBeforeUpdate(
    api: EngineAPI,
    deltaTime: number,
    hooks: DefaultHookable,
  ): Promise<void> {
    try {
      await hooks.callHook('plugin:beforeUpdate', api, deltaTime);
    } catch (err) {
      this._reportRuntimeError('plugin:beforeUpdate', 'hook-dispatch', err, api, hooks);
    }
  }

  /**
   * Dispatch the update phase (game logic).
   *
   * Calls all registered handlers for `plugin:update`.
   * Plugins should use this for game logic updates.
   *
   * @param api - Engine API instance
   * @param deltaTime - Delta time in seconds
   * @param hooks - Hooks system instance
   *
   * @internal Called by Engine._tick()
   */
  async dispatchUpdate(api: EngineAPI, deltaTime: number, hooks: DefaultHookable): Promise<void> {
    try {
      await hooks.callHook('plugin:update', api, deltaTime);
    } catch (err) {
      this._reportRuntimeError('plugin:update', 'hook-dispatch', err, api, hooks);
    }
  }

  /**
   * Dispatch the render phase.
   *
   * Calls all registered handlers for `plugin:render`.
   * Plugins should use this for rendering updates.
   *
   * @param api - Engine API instance
   * @param hooks - Hooks system instance
   *
   * @internal Called by Engine._tick()
   */
  async dispatchRender(api: EngineAPI, hooks: DefaultHookable): Promise<void> {
    try {
      await hooks.callHook('plugin:render', api);
    } catch (err) {
      this._reportRuntimeError('plugin:render', 'hook-dispatch', err, api, hooks);
    }
  }

  /**
   * Destroy all registered plugins and clean up their hooks.
   *
   * Calls `plugin:destroy` hook and each plugin's `onDestroy` in reverse order
   * (last-registered, first-destroyed). All hooks are cleaned up first.
   *
   * **P0-1 v2:** All tracked hooks are unsubscribed before any plugin:destroy
   * events or onDestroy() calls to ensure complete cleanup.
   *
   * @param hooks - Hooks system instance
   *
   * @internal Called by Engine._stop()
   */
  destroyAll(hooks: DefaultHookable): void {
    // Create a snapshot for iteration (order: last-registered first)
    const pluginsToDestroy = [...this.plugins].reverse();

    for (const plugin of pluginsToDestroy) {
      // 1. Clean up all hooks first
      this._lifecycleManager.cleanup(plugin.name);

      // 2. Notify destruction
      try {
        hooks.callHook('plugin:destroy', plugin);
      } catch (err) {
        console.error(`[GWEN:PluginManager] Error destroying plugin '${plugin.name}':`, err);
      }

      // 3. Call lifecycle callback
      plugin.onDestroy?.();
    }

    // Clear the registry
    this.plugins = [];
    // WeakMap will auto-cleanup as plugins are garbage collected
  }

  // ════════════════════════════════════════════════════════════════════════
  // Query Methods
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Check if a plugin is registered by name.
   *
   * @param name - Plugin name
   * @returns true if registered
   */
  has(name: string): boolean {
    return this.plugins.some((p) => p.name === name);
  }

  /**
   * Get a registered plugin by name.
   *
   * @typeParam T - Plugin type (defaults to GwenPlugin)
   * @param name - Plugin name
   * @returns The plugin, or undefined if not found
   *
   * @example
   * ```typescript
   * const physics = manager.get<PhysicsPlugin>('Physics2D');
   * ```
   */
  get<T extends GwenPlugin>(name: string): T | undefined {
    return this.plugins.find((p) => p.name === name) as T | undefined;
  }

  /**
   * Get all registered plugin names in order.
   *
   * @returns Array of plugin names
   */
  names(): string[] {
    return this.plugins.map((p) => p.name);
  }

  /**
   * Get total number of registered plugins.
   *
   * @returns Plugin count
   */
  count(): number {
    return this.plugins.length;
  }

  // ════════════════════════════════════════════════════════════════════════
  // WASM Plugin Support
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Register a WASM plugin.
   *
   * @param plugin - WASM plugin instance
   * @returns true if registered, false if duplicate
   *
   * @internal Used by Engine during initialization
   */
  registerWasmPlugin(plugin: GwenPlugin): boolean {
    if (!isWasmPlugin(plugin)) return false;
    if (this.wasmPlugins.find((p) => isWasmPlugin(p) && p.wasm!.id === plugin.wasm.id)) {
      console.warn(
        `[GWEN:PluginManager] WASM plugin '${plugin.wasm.id}' already registered — skipping.`,
      );
      return false;
    }
    this.wasmPlugins.push(plugin);
    return true;
  }

  /**
   * Dispatch WASM step for all registered WASM plugins.
   *
   * Runs each plugin's `onStep` method (Rust simulation tick).
   *
   * @param deltaTime - Frame delta time in seconds
   *
   * @internal Called by Engine._tick()
   */
  dispatchWasmStep(deltaTime: number, api?: EngineAPI, hooks?: DefaultHookable): void {
    for (const plugin of this.wasmPlugins) {
      try {
        plugin.wasm?.onStep?.(deltaTime);
      } catch (err) {
        const id = isWasmPlugin(plugin) ? plugin.wasm.id : plugin.name;
        if (api && hooks) {
          this._reportRuntimeError('wasm:onStep', id, err, api, hooks);
        } else {
          console.error(`[GWEN:PluginManager] Error in WASM plugin '${id}' onStep:`, err);
        }
      }
    }
  }

  /**
   * Dispatch physics step via the WASM core.
   *
   * @param deltaTime - Frame delta time in seconds
   * @param api - Engine API instance
   *
   * @internal Called by Engine._tick()
   */
  dispatchPhysicsStep(deltaTime: number, api: EngineAPI): void {
    const wasm = api.wasm;
    // Check if physics_step exists on the variant (physics2d or physics3d)
    if ('physics_step' in wasm && typeof wasm.physics_step === 'function') {
      wasm.physics_step(deltaTime);
    } else if ('physics3d_step' in wasm && typeof wasm.physics3d_step === 'function') {
      wasm.physics3d_step(deltaTime);
    }
  }

  /**
   * Destroy all WASM plugins.
   *
   * Calls `onDestroy` on each in reverse order.
   *
   * @internal Called by Engine._stop()
   */
  destroyWasmPlugins(): void {
    for (const plugin of [...this.wasmPlugins].reverse()) {
      try {
        plugin.onDestroy?.();
      } catch (err) {
        const id = isWasmPlugin(plugin) ? plugin.wasm.id : plugin.name;
        console.error(`[GWEN:PluginManager] Error destroying WASM plugin '${id}':`, err);
      }
    }
    this.wasmPlugins = [];
  }

  /**
   * Get total number of registered WASM plugins.
   *
   * @returns WASM plugin count
   */
  wasmPluginCount(): number {
    return this.wasmPlugins.length;
  }

  /**
   * Check if a WASM plugin is registered by ID.
   *
   * @param id - WASM plugin ID
   * @returns true if registered
   */
  hasWasmPlugin(id: string): boolean {
    return this.wasmPlugins.some((p) => isWasmPlugin(p) && p.wasm.id === id);
  }
}
