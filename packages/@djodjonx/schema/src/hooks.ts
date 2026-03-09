/**
 * Core GWEN hooks contracts.
 *
 * This file intentionally contains only type-level contracts so it can be the
 * single source of truth shared by engine-core, kit and CLI tooling.
 */

/** Engine lifecycle hooks fired by the runtime loop. */
export interface EngineLifecycleHooks {
  'engine:init': () => void;
  'engine:start': () => void;
  'engine:stop': () => void;
  'engine:tick': (deltaTime: number) => void;
}

/** Plugin lifecycle hooks fired by the plugin manager. */
export interface PluginLifecycleHooks<Plugin = unknown, API = unknown> {
  'plugin:register': (plugin: Plugin) => void;
  'plugin:init': (plugin: Plugin, api: API) => void;
  'plugin:beforeUpdate': (api: API, deltaTime: number) => void;
  'plugin:update': (api: API, deltaTime: number) => void;
  'plugin:render': (api: API) => void;
  'plugin:destroy': (plugin: Plugin) => void;
}

/** Entity lifecycle hooks. */
export interface EntityLifecycleHooks<EntityId = unknown> {
  'entity:create': (id: EntityId) => void;
  'entity:destroy': (id: EntityId) => void;
  'entity:destroyed': (id: EntityId) => void;
}

/** Component lifecycle hooks. */
export interface ComponentLifecycleHooks<EntityId = unknown> {
  'component:add': (id: EntityId, type: string, data: unknown) => void;
  'component:remove': (id: EntityId, type: string) => void;
  'component:removed': (id: EntityId, type: string) => void;
  'component:update': (id: EntityId, type: string, data: unknown) => void;
}

/** Scene lifecycle hooks. */
export interface SceneLifecycleHooks<ReloadContext = unknown> {
  'scene:beforeLoad': (name: string) => void;
  'scene:load': (name: string) => void;
  'scene:loaded': (name: string) => void;
  'scene:beforeUnload': (name: string) => void;
  'scene:unload': (name: string) => void;
  'scene:unloaded': (name: string) => void;
  'scene:willReload': (name: string, context: ReloadContext) => void;
}

/**
 * Global hooks map.
 *
 * Type parameters let engine-core plug concrete runtime types while tooling can
 * keep generic defaults.
 */
export interface GwenHooks<
  EntityId = unknown,
  Plugin = unknown,
  API = unknown,
  ReloadContext = unknown,
>
  extends
    EngineLifecycleHooks,
    PluginLifecycleHooks<Plugin, API>,
    EntityLifecycleHooks<EntityId>,
    ComponentLifecycleHooks<EntityId>,
    SceneLifecycleHooks<ReloadContext> {}
