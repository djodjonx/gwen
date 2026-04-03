// packages/core/src/scene/index.ts
export { defineScene } from './define-scene.js';
export { emit } from './emit.js';
export { defineActor, onStart, onDestroy, onEvent } from './define-actor.js';
export { definePrefab } from './define-prefab.js';
export { useActor, usePrefab, useComponent } from './use-actor.js';
export { defineLayout } from './define-layout.js';
export { placeActor, placeGroup, placePrefab } from './place.js';
export type { ActorHandle, PrefabHandle } from './use-actor.js';
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
  PlaceHandle,
  LayoutDefinition,
  LayoutHandle,
  UseLayoutOptions,
} from './types.js';
