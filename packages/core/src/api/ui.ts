/**
 * GWEN UI System
 *
 * `UIDefinition` is a universal, renderer-agnostic contract.
 * The framework dispatches onMount / render / onUnmount — that's it.
 * Developers choose their renderer via api.services in these hooks.
 *
 * After `gwen prepare`, `api.services.get()` is fully typed automatically —
 * no generic annotation needed.
 *
 * @example Canvas2D
 * ```ts
 * export const ScoreUI = defineUI({
 *   name: 'ScoreUI',
 *   render(api, entityId) {
 *     const r = api.services.get('renderer'); // ✅ typed automatically
 *     r.ctx.fillText('SCORE: 0', r.logicalWidth / 2, 24);
 *   },
 * });
 * ```
 *
 * @example HTML via HtmlUIPlugin
 * ```ts
 * export const ScoreUI = defineUI({
 *   name: 'ScoreUI',
 *   onMount(api, entityId) {
 *     api.services.get('htmlUI').mount(entityId, '<div id="score">0</div>');
 *   },
 *   render(api, entityId) {
 *     api.services.get('htmlUI').text(entityId, 'score', `${value}`);
 *   },
 *   onUnmount(api, entityId) {
 *     api.services.get('htmlUI').unmount(entityId);
 *   },
 * });
 * ```
 */

import type { GwenPlugin, EngineAPI } from '../types';
import type { EntityId } from '../types/entity';
import { defineComponent, Types } from '../schema';

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Attaches a UIDefinition to an entity.
 */
export const UIComponent = defineComponent({
  name: 'UIComponent',
  schema: { uiName: Types.string },
});

// ── UIDefinition ──────────────────────────────────────────────────────────────

/**
 * Universal contract for a GWEN UI.
 * Renderer-agnostic — HTML, Canvas2D, JSX, WebGL, etc.
 */
export interface UIDefinition<Services extends object = GwenDefaultServices> {
  /** Unique identifier — corresponds to UIComponent.uiName */
  readonly name: string;

  /**
   * Optional plugin extension data for this UI component.
   *
   * Declared as a partial map of `GwenUIExtensions` — enriched by `gwen prepare`
   * with each installed plugin's UI schema. Fired via `ui:extensions` hook
   * on the first mount of this UI on an entity.
   *
   * @example
   * ```ts
   * extensions: { htmlUI: { layer: 'hud' } }
   * ```
   */
  readonly extensions?: Readonly<Partial<GwenUIExtensions>>;

  /**
   * Called once when UIComponent is attached to an entity.
   * Allocate resources here: create DOM elements, reserve canvas slot, etc.
   */
  onMount?(api: EngineAPI<Services>, entityId: EntityId): void;

  /**
   * Called every frame during the render phase.
   * All UI rendering logic goes here.
   */
  render(api: EngineAPI<Services>, entityId: EntityId): void;

  /**
   * Called when UIComponent is removed or entity destroyed.
   * Release resources allocated in onMount.
   */
  onUnmount?(api: EngineAPI<Services>, entityId: EntityId): void;
}

/**
 * Body of a UIDefinition without the `name` — used by factory form.
 */
export type UIBody<Services extends object = GwenDefaultServices> = Omit<
  UIDefinition<Services>,
  'name'
>;

/**
 * Define a GWEN UI — two supported syntaxes.
 *
 * **Form 1 — direct object** (no local state):
 * ```ts
 * export const BulletUI = defineUI({
 *   name: 'BulletUI',
 *   render(api, id) { ... }, // api.services typed automatically after gwen prepare
 * });
 * ```
 *
 * **Form 2 — factory** (local state in closure, no global variables):
 * ```ts
 * export const EnemyUI = defineUI('EnemyUI', () => {
 *   const phaseMap = new Map<EntityId, number>(); // ← closure-local, not global
 *   return {
 *     onMount(_api, id)   { phaseMap.set(id, Math.random() * Math.PI * 2); },
 *     render(api, id)     { const phase = phaseMap.get(id) ?? 0; ... },
 *     onUnmount(_api, id) { phaseMap.delete(id); },
 *   };
 * });
 * ```
 *
 * TypeScript enforces the factory when a string is passed:
 * ```ts
 * defineUI('X')            // ❌ TS2554 — Expected 2 arguments
 * defineUI({ render: fn }) // ❌ TS     — missing name
 * ```
 */
// Overload 1 — direct object
export function defineUI<Services extends object = GwenDefaultServices>(
  config: UIDefinition<Services>,
): UIDefinition<Services>;

// Overload 2 — factory (required, not optional)
export function defineUI<Services extends object = GwenDefaultServices>(
  name: string,
  factory: () => UIBody<Services>,
): UIDefinition<Services>;

// Implementation
export function defineUI<Services extends object = GwenDefaultServices>(
  nameOrConfig: string | UIDefinition<Services>,
  factory?: () => UIBody<Services>,
): UIDefinition<Services> {
  if (typeof nameOrConfig === 'string') {
    return { name: nameOrConfig, ...factory!() };
  }
  return nameOrConfig;
}

// ── UIManager ─────────────────────────────────────────────────────────────────

/**
 * Plugin that dispatches UIDefinition lifecycle hooks.
 * Renderer-agnostic — pure dispatch, no rendering knowledge.
 *
 * Registered as a GwenPlugin so it runs automatically each frame via `onRender`.
 * Mount order follows UIDefinition registration order (first-registered, first-rendered).
 */
export class UIManager implements GwenPlugin {
  readonly name = 'UIManager';

  private definitions = new Map<string, UIDefinition<any>>();
  private definitionOrder = new Map<string, number>(); // uiName → registration index
  private mounted = new Map<EntityId, string>();
  private lastApi: EngineAPI | null = null;

  /** Register a UIDefinition. Overwrites an existing entry with the same name (with a warning). */
  register(def: UIDefinition<any>): this {
    if (this.definitions.has(def.name)) {
      console.warn(`[UIManager] '${def.name}' already registered — overwriting.`);
    }
    this.definitions.set(def.name, def);
    this.definitionOrder.set(def.name, this.definitions.size - 1);
    return this;
  }

  onRender(api: EngineAPI): void {
    this.lastApi = api;
    const entities = api.query([UIComponent.name]);
    const alive = new Set<EntityId>();

    // Read UIComponent data once per entity and cache in a local Map
    // This avoids O(n log n) WASM calls in the sort comparator
    const uiNames = new Map<EntityId, string>();
    for (const id of entities) {
      const data = api.component.get(id, UIComponent);
      if (data) {
        uiNames.set(id, data.uiName);
      }
    }

    // Sort entities by UIDefinition registration order — comparator reads from local Map
    const sorted = [...uiNames.keys()].sort((a, b) => {
      const da = uiNames.get(a) ?? '';
      const db = uiNames.get(b) ?? '';
      return (this.definitionOrder.get(da) ?? 999) - (this.definitionOrder.get(db) ?? 999);
    });

    for (const id of sorted) {
      alive.add(id);
      const uiName = uiNames.get(id)!;
      const def = this.definitions.get(uiName);
      if (!def) {
        console.warn(`[UIManager] No UIDefinition registered for '${uiName}'.`);
        continue;
      }

      if (!this.mounted.has(id)) {
        def.onMount?.(api, id);
        this.mounted.set(id, def.name);

        // Dispatch UI extensions to plugins on first mount
        if (def.extensions && Object.keys(def.extensions).length > 0) {
          (async () => {
            try {
              await (api.hooks.callHook as (name: string, ...args: any[]) => Promise<void>)(
                'ui:extensions',
                def.name,
                id,
                def.extensions,
              );
            } catch (err) {
              console.error(`[UIManager] Error in ui:extensions hook for '${def.name}':`, err);
            }
          })();
        }
      }

      def.render(api, id);
    }

    // Unmount entities that are no longer alive or no longer have a UIComponent
    for (const [id, defName] of this.mounted) {
      if (!alive.has(id)) {
        const def = this.definitions.get(defName);
        def?.onUnmount?.(api, id);
        this.mounted.delete(id);
      }
    }
  }

  onDestroy(): void {
    if (this.lastApi) {
      for (const [id, defName] of this.mounted) {
        const def = this.definitions.get(defName);
        def?.onUnmount?.(this.lastApi, id);
      }
    }
    this.definitions.clear();
    this.definitionOrder.clear();
    this.mounted.clear();
    this.lastApi = null;
  }
}
