/**
 * @file Plugin Manager — Orchestrates TsPlugin lifecycle via hooks
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
 * @see {@link TsPlugin} for plugin interface
 * @see {@link GwenHooks} for available hooks
 */

import type { TsPlugin, EngineAPI, GwenWasmPlugin } from '../types';
import type { GwenHookable } from '../hooks';

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
  /** Registered TypeScript plugins (in registration order) */
  private plugins: TsPlugin[] = [];

  /** Registered WASM plugins */
  private wasmPlugins: GwenWasmPlugin[] = [];

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
   *    - `onBeforeUpdate` → hooked to `plugin:beforeUpdate`
   *    - `onUpdate` → hooked to `plugin:update`
   *    - `onRender` → hooked to `plugin:render`
   * 4. `plugin:init` hook is called
   * 5. Plugin's `onInit` method is called directly
   *
   * **Errors:**
   * - Returns false if a plugin with the same name is already registered
   * - Errors in hooks are logged but don't stop plugin registration
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
   * const plugin: TsPlugin = {
   *   name: 'MyPlugin',
   *   onInit(api) { console.log('init'); },
   *   onUpdate(api, dt) { console.log('update'); }
   * };
   * const registered = manager.register(plugin, api, hooks);
   * ```
   *
   * @throws Only via hook handlers, not from registration itself
   */
  register(plugin: TsPlugin, api: EngineAPI, hooks: DefaultHookable): boolean {
    // Check for duplicate
    if (this.plugins.find((p) => p.name === plugin.name)) {
      console.warn(`[GWEN:PluginManager] '${plugin.name}' already registered — skipping.`);
      return false;
    }

    // Add to registry
    this.plugins.push(plugin);

    // Emit plugin:register hook (synchronous)
    try {
      hooks.callHook('plugin:register', plugin);
    } catch (err) {
      console.error(`[GWEN:PluginManager] Error in plugin:register hook:`, err);
    }

    // Auto-register plugin lifecycle methods as hooks
    this._setupPluginHooks(plugin, hooks);

    // Emit plugin:init hook (synchronous)
    try {
      hooks.callHook('plugin:init', plugin, api);
    } catch (err) {
      console.error(`[GWEN:PluginManager] Error in plugin:init hook:`, err);
    }

    // Call plugin's onInit
    if (plugin.onInit) {
      plugin.onInit(api);
    }

    return true;
  }

  /**
   * Register plugin lifecycle methods as hooks.
   *
   * @internal
   * @param plugin - The plugin whose methods to register
   * @param hooks - The hooks system instance
   */
  private _setupPluginHooks(plugin: TsPlugin, hooks: DefaultHookable): void {
    if (plugin.onBeforeUpdate) {
      hooks.hook('plugin:beforeUpdate', (api, dt) => plugin.onBeforeUpdate!(api, dt));
    }

    if (plugin.onUpdate) {
      hooks.hook('plugin:update', (api, dt) => plugin.onUpdate!(api, dt));
    }

    if (plugin.onRender) {
      hooks.hook('plugin:render', (api) => plugin.onRender!(api));
    }
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
  registerAll(plugins: TsPlugin[], api: EngineAPI, hooks: DefaultHookable): void {
    for (const p of plugins) {
      this.register(p, api, hooks);
    }
  }

  /**
   * Unregister a plugin by name and call its onDestroy.
   *
   * **What happens:**
   * 1. Plugin is found by name
   * 2. `plugin:destroy` hook is called
   * 3. Plugin's `onDestroy` method is called
   * 4. Plugin is removed from registry
   *
   * Note: Previously registered hooks for this plugin will continue to be
   * called from the hooks registry. We cannot easily remove individual hooks
   * from hookable, but since the plugin is removed from the registry, those
   * hooks will call methods on a "dead" plugin which should handle gracefully.
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

    // Emit plugin:destroy hook (synchronous)
    try {
      hooks.callHook('plugin:destroy', plugin);
    } catch (err) {
      console.error(`[GWEN:PluginManager] Error in plugin:destroy hook:`, err);
    }

    // Call plugin's onDestroy
    plugin.onDestroy?.();

    // Remove from registry
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
      console.error('[GWEN:PluginManager] Error in plugin:beforeUpdate:', err);
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
      console.error('[GWEN:PluginManager] Error in plugin:update:', err);
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
      console.error('[GWEN:PluginManager] Error in plugin:render:', err);
    }
  }

  /**
   * Destroy all registered plugins.
   *
   * Calls `plugin:destroy` hook and each plugin's `onDestroy` in reverse order
   * (last-registered, first-destroyed).
   *
   * @param hooks - Hooks system instance
   *
   * @internal Called by Engine._stop()
   */
  destroyAll(hooks: DefaultHookable): void {
    // Iterate in reverse order (LIFO)
    for (const plugin of [...this.plugins].reverse()) {
      try {
        hooks.callHook('plugin:destroy', plugin);
      } catch (err) {
        console.error(`[GWEN:PluginManager] Error destroying plugin '${plugin.name}':`, err);
      }

      plugin.onDestroy?.();
    }

    this.plugins = [];
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
   * @typeParam T - Plugin type (defaults to TsPlugin)
   * @param name - Plugin name
   * @returns The plugin, or undefined if not found
   *
   * @example
   * ```typescript
   * const physics = manager.get<PhysicsPlugin>('Physics2D');
   * ```
   */
  get<T extends TsPlugin>(name: string): T | undefined {
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
  registerWasmPlugin(plugin: GwenWasmPlugin): boolean {
    if (this.wasmPlugins.find((p) => p.id === plugin.id)) {
      console.warn(
        `[GWEN:PluginManager] WASM plugin '${plugin.id}' already registered — skipping.`,
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
  dispatchWasmStep(deltaTime: number): void {
    for (const plugin of this.wasmPlugins) {
      try {
        plugin.onStep?.(deltaTime);
      } catch (err) {
        console.error(`[GWEN:PluginManager] Error in WASM plugin '${plugin.id}' onStep:`, err);
      }
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
        console.error(`[GWEN:PluginManager] Error destroying WASM plugin '${plugin.id}':`, err);
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
    return this.wasmPlugins.some((p) => p.id === id);
  }
}
