/**
 * @file GWEN Hooks System — Complete type definitions
 *
 * Defines all hooks available in the GWEN engine using @unjs/hookable.
 * Provides full type safety for engine lifecycle, plugins, entities, components, and scenes.
 *
 * @example
 * ```typescript
 * // In a plugin:
 * onInit(api: EngineAPI) {
 *   // Hook with full type safety
 *   api.hooks.hook('entity:create', (id) => {
 *     console.log('Entity created:', id);
 *   });
 * }
 * ```
 */

/**
 * Engine lifecycle hooks — called when engine state changes
 *
 * @internal Use via EngineAPI.hooks
 */
export interface EngineLifecycleHooks {
  /**
   * Called once when engine is constructed and initialized.
   * Use for global setup that doesn't depend on running game loop.
   */
  'engine:init': () => void;

  /**
   * Called when engine.start() is invoked.
   * Game loop begins after this hook completes.
   */
  'engine:start': () => void;

  /**
   * Called when engine.stop() is invoked.
   * Game loop stops before this hook is called.
   */
  'engine:stop': () => void;

  /**
   * Called at the beginning of each frame, before any plugin updates.
   *
   * @param deltaTime - Time elapsed since last frame (seconds), clamped to 0.1s max
   */
  'engine:tick': (deltaTime: number) => void;
}

/**
 * Plugin lifecycle hooks — called when plugins register, initialize, or destroy
 *
 * @internal Use via EngineAPI.hooks
 */
export interface PluginLifecycleHooks {
  /**
   * Called when a plugin is registered.
   * Use for global plugin tracking or initialization coordination.
   *
   * @param plugin - The plugin being registered
   */
  'plugin:register': (plugin: any) => void; // TsPlugin

  /**
   * Called during plugin initialization (before onInit callback).
   * Use for plugin-level setup coordination.
   *
   * @param plugin - The plugin being initialized
   * @param api - Engine API instance for this plugin
   */
  'plugin:init': (plugin: any, api: any) => void; // (TsPlugin, EngineAPI)

  /**
   * Called at the start of each frame for input capture and intentions.
   * Corresponds to TsPlugin.onBeforeUpdate().
   *
   * @param api - Engine API instance
   * @param deltaTime - Time elapsed since last frame (seconds)
   */
  'plugin:beforeUpdate': (api: any, deltaTime: number) => void; // (EngineAPI, number)

  /**
   * Called after WASM update for game logic.
   * Corresponds to TsPlugin.onUpdate().
   *
   * @param api - Engine API instance
   * @param deltaTime - Time elapsed since last frame (seconds)
   */
  'plugin:update': (api: any, deltaTime: number) => void; // (EngineAPI, number)

  /**
   * Called after all updates for rendering.
   * Corresponds to TsPlugin.onRender().
   *
   * @param api - Engine API instance
   */
  'plugin:render': (api: any) => void; // (EngineAPI)

  /**
   * Called when a plugin is destroyed or unregistered.
   * Use for cleanup or tracking.
   *
   * @param plugin - The plugin being destroyed
   */
  'plugin:destroy': (plugin: any) => void; // TsPlugin
}

/**
 * Entity lifecycle hooks — called when entities are created or destroyed
 *
 * @internal Use via EngineAPI.hooks
 */
export interface EntityLifecycleHooks {
  /**
   * Called when an entity is created.
   * Use for tracking, logging, or entity post-processing.
   *
   * @param id - The newly created entity ID
   */
  'entity:create': (id: number) => void; // EntityId

  /**
   * Called when an entity is about to be destroyed.
   * Use for pre-destruction cleanup or logging.
   *
   * @param id - The entity ID being destroyed
   */
  'entity:destroy': (id: number) => void; // EntityId

  /**
   * Called after an entity has been destroyed.
   * Use for post-destruction cleanup or resource management.
   *
   * @param id - The destroyed entity ID
   */
  'entity:destroyed': (id: number) => void; // EntityId
}

/**
 * Component lifecycle hooks — called when components are added or removed
 *
 * @internal Use via EngineAPI.hooks
 */
export interface ComponentLifecycleHooks {
  /**
   * Called when a component is added to an entity.
   * Use for validation, initialization, or component tracking.
   *
   * @param id - Entity ID
   * @param type - Component type name
   * @param data - Component data
   */
  'component:add': (id: number, type: string, data: unknown) => void;

  /**
   * Called when a component is about to be removed.
   * Use for pre-removal cleanup or logging.
   *
   * @param id - Entity ID
   * @param type - Component type name
   */
  'component:remove': (id: number, type: string) => void;

  /**
   * Called after a component has been removed.
   * Use for post-removal cleanup or resource management.
   *
   * @param id - Entity ID
   * @param type - Component type name
   */
  'component:removed': (id: number, type: string) => void;

  /**
   * Called when a component is updated (via addComponent on existing component).
   * Use for change tracking or reactive systems.
   *
   * @param id - Entity ID
   * @param type - Component type name
   * @param data - New component data
   */
  'component:update': (id: number, type: string, data: unknown) => void;
}

/**
 * Scene lifecycle hooks — called when scenes are loaded or unloaded
 *
 * @internal Use via EngineAPI.hooks
 */
export interface SceneLifecycleHooks {
  /**
   * Called before a scene is loaded.
   * Use for preparation or resource pre-loading.
   *
   * @param name - Scene name
   */
  'scene:beforeLoad': (name: string) => void;

  /**
   * Called when a scene is loaded.
   * Use for scene initialization or setup.
   *
   * @param name - Scene name
   */
  'scene:load': (name: string) => void;

  /**
   * Called after a scene has been loaded and is now active.
   * Use for post-load setup or notifications.
   *
   * @param name - Scene name
   */
  'scene:loaded': (name: string) => void;

  /**
   * Called before a scene is unloaded.
   * Use for cleanup preparation.
   *
   * @param name - Scene name
   */
  'scene:beforeUnload': (name: string) => void;

  /**
   * Called when a scene is unloaded.
   * Use for resource cleanup.
   *
   * @param name - Scene name
   */
  'scene:unload': (name: string) => void;

  /**
   * Called after a scene has been unloaded.
   * Use for final cleanup.
   *
   * @param name - Scene name
   */
  'scene:unloaded': (name: string) => void;

  /**
   * Called before a scene is reloaded (when reloadOnReenter evaluates to true).
   *
   * This hook fires when:
   * 1. `scene.load('SceneName')` is called while already in 'SceneName'
   * 2. The scene's `reloadOnReenter` is `true` or evaluates to `true`
   *
   * Use this hook to:
   * - Save temporary state before reload
   * - Log analytics about reload events
   * - Cleanup external resources
   *
   * @param name - Scene name being reloaded
   * @param context - Reload context with information about why reload is happening
   *
   * @example
   * ```typescript
   * api.hooks.hook('scene:willReload', (name, ctx) => {
   *   console.log(`Reloading ${name} (reason: ${ctx.data?.reason})`);
   *   analytics.track('scene_reload', { scene: name, enterCount: ctx.enterCount });
   * });
   * ```
   */
  'scene:willReload': (name: string, context: import('../api/scene-context').ReloadContext) => void;
}

/**
 * All hooks available in the GWEN engine.
 *
 * Hooks are strongly typed and called in registration order.
 * Each hook is either synchronous (void) or can be awaited.
 *
 * @see EngineAPI.hooks for access to hooks
 * @see docs/api/hooks.md for complete documentation
 */
export interface GwenHooks
  extends
    EngineLifecycleHooks,
    PluginLifecycleHooks,
    EntityLifecycleHooks,
    ComponentLifecycleHooks,
    SceneLifecycleHooks {
  /**
   * Plugins can define custom hooks with any name.
   *
   * @example
   * ```typescript
   * api.hooks.hook('physics:collision' as any, (event) => {
   *   console.log('Collision:', event);
   * });
   * ```
   */
  [key: string]: (...args: any[]) => any;
}
