/**
 * PluginManager — Orchestrates TsPlugin lifecycle
 *
 * Manages ordered plugin registration and per-frame dispatch.
 * Follows ENGINE.md §9 game loop sequencing:
 *   onBeforeUpdate → (WASM slot) → onUpdate → onRender
 */

import type { TsPlugin, EngineAPI } from './types';

export class PluginManager {
  private plugins: TsPlugin[] = [];
  private initialized = false;

  /**
   * Register a plugin. Calls onInit immediately if manager is already running.
   * Plugins are called in registration order (lower index = higher priority).
   * Returns false if plugin with same name already registered.
   */
  register(plugin: TsPlugin, api: EngineAPI): boolean {
    if (this.plugins.find((p) => p.name === plugin.name)) {
      console.warn(`[GWEN:PluginManager] '${plugin.name}' already registered — skipping.`);
      return false;
    }
    this.plugins.push(plugin);
    plugin.onInit?.(api);
    return true;
  }

  /**
   * Register multiple plugins at once.
   */
  registerAll(plugins: TsPlugin[], api: EngineAPI): void {
    for (const p of plugins) {
      this.register(p, api);
    }
  }

  /**
   * Remove a plugin by name and call its onDestroy.
   * Returns false if plugin was not found.
   */
  unregister(name: string): boolean {
    const idx = this.plugins.findIndex((p) => p.name === name);
    if (idx === -1) return false;
    this.plugins[idx].onDestroy?.();
    this.plugins.splice(idx, 1);
    return true;
  }

  /**
   * Check if a plugin is registered by name.
   */
  has(name: string): boolean {
    return this.plugins.some((p) => p.name === name);
  }

  /**
   * Get a registered plugin by name.
   */
  get<T extends TsPlugin>(name: string): T | undefined {
    return this.plugins.find((p) => p.name === name) as T | undefined;
  }

  /** All registered plugin names (in order). */
  names(): string[] {
    return this.plugins.map((p) => p.name);
  }

  /** Total number of registered plugins. */
  count(): number {
    return this.plugins.length;
  }

  // ── Per-frame dispatchers (called by Engine.tick) ──────────────────────

  /** Step 1: capture inputs & intentions */
  dispatchBeforeUpdate(api: EngineAPI, deltaTime: number): void {
    for (const plugin of this.plugins) {
      plugin.onBeforeUpdate?.(api, deltaTime);
    }
  }

  /** Step 2: game logic (after WASM step) */
  dispatchUpdate(api: EngineAPI, deltaTime: number): void {
    for (const plugin of this.plugins) {
      plugin.onUpdate?.(api, deltaTime);
    }
  }

  /** Step 3: rendering */
  dispatchRender(api: EngineAPI): void {
    for (const plugin of this.plugins) {
      plugin.onRender?.(api);
    }
  }

  /** Call onDestroy on all plugins in reverse order. */
  destroyAll(): void {
    for (const plugin of [...this.plugins].reverse()) {
      plugin.onDestroy?.();
    }
    this.plugins = [];
  }
}
