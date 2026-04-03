// packages/core/src/scene/index.ts
export { defineScene } from './define-scene.js';
export { definePrefab } from './define-prefab.js';
export type { SceneDefinition, SceneFactory, SceneOptions, SceneRegistry } from './define-scene.js';
export type {
  PrefabDefinition,
  PrefabComponentEntry,
  ActorDefinition,
  ActorInstance,
  UpdateFn,
  RenderFn,
  VoidFn,
} from './types.js';
