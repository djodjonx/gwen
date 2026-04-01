/**
 * HookLifecycleManager — tracks and cleans up hook subscriptions per plugin.
 *
 * Centralises the WeakMap-based cleanup pattern that was previously duplicated
 * across PluginManager._track / _cleanup / _createScopedHooks / createScopedApi.
 *
 * **Why Map<string> instead of WeakMap<GwenPlugin>?**
 * WeakMap keys are GC-eligible; if a plugin instance is garbage-collected before
 * `unregister()` is called (e.g. due to a stale reference bug), cleanup silently
 * skips. Keying by the plugin's canonical name — which is already enforced to be
 * unique in PluginManager — makes cleanup deterministic and auditable.
 */

import type { EngineAPI } from '../types/engine-api';
import type { GwenPlugin } from '../types/plugin';
import type { GwenHookable } from '../hooks';

/** Convenience alias used throughout this module. */
type DefaultHookable = GwenHookable<GwenDefaultHooks>;

export class HookLifecycleManager {
  /** Map from plugin.name → list of unsubscriber functions. */
  private readonly _subs = new Map<string, Array<() => void>>();

  // ── Subscription tracking ────────────────────────────────────────────────────

  /**
   * Record an unsubscriber function for a plugin.
   * Call this every time `hooks.hook(...)` is invoked on behalf of the plugin.
   */
  track(pluginName: string, unregisterFn: () => void): void {
    const list = this._subs.get(pluginName) ?? [];
    list.push(unregisterFn);
    this._subs.set(pluginName, list);
  }

  /**
   * Invoke all stored unsubscribers for the given plugin and remove the entry.
   * Safe to call multiple times (idempotent after the first call).
   */
  cleanup(pluginName: string): void {
    const list = this._subs.get(pluginName);
    if (list) {
      for (const unregister of list) {
        unregister();
      }
      this._subs.delete(pluginName);
    }
  }

  // ── Scoped hooks ─────────────────────────────────────────────────────────────

  /**
   * Return a hooks proxy where every `hooks.hook(...)` call is automatically
   * tracked under `pluginName` and will be cleaned up on `cleanup(pluginName)`.
   *
   * All other hooks methods (callHook, removeHook, …) are inherited from the
   * real instance via the prototype chain.
   */
  createScopedHooks(pluginName: string, hooks: DefaultHookable): DefaultHookable {
    const scopedHooks = Object.create(hooks) as DefaultHookable;
    const originalHook = hooks.hook.bind(hooks);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    scopedHooks.hook = ((name: string, fn: (...args: any[]) => any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const unregister = originalHook(name as any, fn);
      this.track(pluginName, unregister);
      return unregister;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    return scopedHooks;
  }

  // ── Scoped API ───────────────────────────────────────────────────────────────

  /**
   * Return an EngineAPI proxy whose `hooks` property is a scoped hooks instance.
   * All prototype methods (getComponent, query, …) are preserved via Object.create.
   *
   * Primarily used by createEngine() for the WASM onWasmInit phase, where the
   * plugin runs outside the normal PluginManager.register() flow.
   *
   * @param plugin  The plugin instance — its name is used as the tracking key.
   * @param api     Engine API to wrap.
   * @param hooks   Hooks system instance.
   */
  createScopedApi(plugin: GwenPlugin, api: EngineAPI, hooks: DefaultHookable): EngineAPI {
    return Object.create(api, {
      hooks: {
        value: this.createScopedHooks(plugin.name, hooks),
        writable: false,
        enumerable: true,
        configurable: true,
      },
    }) as EngineAPI;
  }
}
