/**
 * GWEN UI System
 *
 * `UIDefinition` is a universal, renderer-agnostic contract.
 * The framework dispatches onMount / render / onUnmount — that's it.
 * Developers choose their renderer via api.services in these hooks.
 *
 * @example Canvas2D
 * ```ts
 * export const ScoreUI = defineUI<GwenServices>({
 *   name: 'ScoreUI',
 *   render(api, entityId) {
 *     const r = api.services.get('renderer');
 *     r.ctx.fillText('SCORE: 0', r.logicalWidth / 2, 24);
 *   },
 * });
 * ```
 *
 * @example HTML via HtmlUIPlugin
 * ```ts
 * export const ScoreUI = defineUI<GwenServices>({
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

import type { TsPlugin, EngineAPI } from '../types';
import type { EntityId } from '../core/ecs';
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
export interface UIDefinition<Services extends Record<string, unknown> = Record<string, unknown>> {
  /** Unique identifier — corresponds to UIComponent.uiName */
  readonly name: string;

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
export type UIBody<Services extends Record<string, unknown> = Record<string, unknown>> = Omit<
  UIDefinition<Services>,
  'name'
>;

/**
 * Définit une UI GWEN — deux syntaxes supportées.
 *
 * **Forme 1 — objet direct** (simple, sans état local) :
 * ```ts
 * export const BulletUI = defineUI<GwenServices>({
 *   name: 'BulletUI',
 *   render(api, id) { ... },
 * });
 * ```
 *
 * **Forme 2 — factory** (avec état local en closure, sans variables globales) :
 * ```ts
 * export const EnemyUI = defineUI<GwenServices>('EnemyUI', () => {
 *   const phaseMap = new Map<EntityId, number>(); // ← closure locale, pas globale
 *   return {
 *     onMount(_api, id)   { phaseMap.set(id, Math.random() * Math.PI * 2); },
 *     render(api, id)     { const phase = phaseMap.get(id) ?? 0; ... },
 *     onUnmount(_api, id) { phaseMap.delete(id); },
 *   };
 * });
 * ```
 *
 * TypeScript exige la factory si un string est passé :
 * ```ts
 * defineUI('X')           // ❌ TS2554 — Expected 2 arguments
 * defineUI({ render: fn }) // ❌ TS   — manque name
 * ```
 */
// Surcharge 1 — objet direct
export function defineUI<Services extends Record<string, unknown> = Record<string, unknown>>(
  config: UIDefinition<Services>,
): UIDefinition<Services>;

// Surcharge 2 — factory OBLIGATOIRE (pas optionnelle)
export function defineUI<Services extends Record<string, unknown> = Record<string, unknown>>(
  name: string,
  factory: () => UIBody<Services>,
): UIDefinition<Services>;

// Implementation
export function defineUI<Services extends Record<string, unknown> = Record<string, unknown>>(
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
 * Plugin qui dispatche le cycle de vie des UIDefinitions.
 * Ne connaît aucun renderer — dispatch pur.
 */
export class UIManager implements TsPlugin {
  readonly name = 'UIManager';

  private definitions = new Map<string, UIDefinition<any>>();
  private definitionOrder = new Map<string, number>(); // uiName → index d'enregistrement
  private mounted = new Map<EntityId, string>();
  private lastApi: EngineAPI | null = null;

  /** Enregistre une UIDefinition. */
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

    // Trier les entités par ordre de registration de leur UIDefinition
    // garantit : BackgroundUI avant BulletUI avant PlayerUI, etc.
    const sorted = [...entities].sort((a, b) => {
      const da = api.getComponent(a, UIComponent)?.uiName ?? '';
      const db = api.getComponent(b, UIComponent)?.uiName ?? '';
      return (this.definitionOrder.get(da) ?? 999) - (this.definitionOrder.get(db) ?? 999);
    });

    for (const id of sorted) {
      alive.add(id);
      const data = api.getComponent(id, UIComponent);
      if (!data) continue;
      const def = this.definitions.get(data.uiName);
      if (!def) {
        console.warn(`[UIManager] No UIDefinition registered for '${data.uiName}'.`);
        continue;
      }

      if (!this.mounted.has(id)) {
        def.onMount?.(api, id);
        this.mounted.set(id, def.name);
      }

      def.render(api, id);
    }

    // Unmount des entités mortes
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
