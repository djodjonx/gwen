// packages/core/src/scene/index.ts
export { defineScene } from './define-scene.js';
export { defineActor, onStart, onDestroy, onEvent } from './define-actor.js';
export { definePrefab } from './define-prefab.js';
export type { SceneDefinition, SceneFactory, SceneOptions, SceneRegistry } from './define-scene.js';
export type {
  PrefabDefinition,
  PrefabComponentEntry,
  ActorDefinition,
  ActorInstance,
  ActorPlugin,
  UpdateFn,
  RenderFn,
  VoidFn,
} from './types.js';
