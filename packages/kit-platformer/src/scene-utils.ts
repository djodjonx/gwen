/**
 * Minimal scene and prefab utilities local to @gwenjs/kit-platformer.
 *
 * These are thin wrappers that return their definition object as-is,
 * providing TypeScript type-checking for scene and prefab shapes.
 */

import type { EntityId } from '@gwenjs/core';
import type { GwenPlugin } from '@gwenjs/kit';

// ─── Scene types ──────────────────────────────────────────────────────────────

/** Minimal API shape passed to scene lifecycle callbacks. */
export interface SceneCallbackApi {
  services: {
    has(name: string): boolean;
    get(name: string): unknown;
  };
  [key: string]: unknown;
}

/** A local system entry — either a GwenPlugin object or a factory function. */
export type LocalPluginEntry = GwenPlugin | (() => GwenPlugin);

export interface SceneDefinition {
  readonly name: string;
  readonly systems?: LocalPluginEntry[];
  readonly extensions?: Record<string, unknown>;
  onEnter?(api: SceneCallbackApi): void | Promise<void>;
  onExit?(api: SceneCallbackApi): void | Promise<void>;
  [key: string]: unknown;
}

/**
 * Defines a scene. Returns the definition object as-is (identity function).
 * Exists for type-checking and future extension.
 */
export function defineScene(def: SceneDefinition): SceneDefinition {
  return def;
}

// ─── Prefab types ─────────────────────────────────────────────────────────────

/** Minimal API shape passed to prefab create callbacks. */
export interface PrefabCallbackApi {
  createEntity(): EntityId;
  addComponent(id: EntityId, type: unknown, data: unknown): void;
  [key: string]: unknown;
}

export interface PrefabDefinition<Args extends unknown[] = unknown[]> {
  readonly name: string;
  readonly extensions?: Record<string, unknown>;
  create(api: PrefabCallbackApi, ...args: Args): EntityId;
}

/**
 * Defines a prefab. Returns the definition object as-is (identity function).
 * Exists for type-checking and future extension.
 */
export function definePrefab<Args extends unknown[] = unknown[]>(
  def: PrefabDefinition<Args>,
): PrefabDefinition<Args> {
  return def;
}
