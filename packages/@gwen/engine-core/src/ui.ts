/**
 * GWEN UI System
 *
 * `UIDefinition` est un contrat universel et agnostique du rendu.
 * Le framework dispatche onMount / render / onUnmount — c'est tout.
 * Le développeur choisit son renderer via api.services dans ces hooks.
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

import type { TsPlugin, EngineAPI } from './types';
import type { EntityId } from './ecs';
import { defineComponent, Types } from './schema';

// ── Component ─────────────────────────────────────────────────────────────────

/** Attache une UIDefinition à une entité. */
export const UIComponent = defineComponent({
  name: 'UIComponent',
  schema: { uiName: Types.string },
});

// ── UIDefinition ──────────────────────────────────────────────────────────────

/**
 * Contrat universel d'une UI GWEN.
 * Agnostique du renderer — HTML, Canvas2D, JSX, WebGL, etc.
 */
export interface UIDefinition<
  Services extends Record<string, unknown> = Record<string, unknown>
> {
  /** Identifiant unique — correspond à UIComponent.uiName */
  readonly name: string;

  /**
   * Appelé une fois quand UIComponent est attaché à l'entité.
   * Allouer les ressources ici : créer des éléments DOM, réserver un slot canvas, etc.
   */
  onMount?(api: EngineAPI<Services>, entityId: EntityId): void;

  /**
   * Appelé à chaque frame pendant la phase render.
   * Toute la logique de rendu UI est ici.
   */
  render(api: EngineAPI<Services>, entityId: EntityId): void;

  /**
   * Appelé quand UIComponent est retiré ou l'entité détruite.
   * Libérer les ressources allouées dans onMount.
   */
  onUnmount?(api: EngineAPI<Services>, entityId: EntityId): void;
}

/**
 * Définit une UI GWEN.
 * Retourne la définition telle quelle — sert uniquement à enforcer le type.
 */
export function defineUI<
  Services extends Record<string, unknown> = Record<string, unknown>
>(config: UIDefinition<Services>): UIDefinition<Services> {
  return config;
}

// ── UIManager ─────────────────────────────────────────────────────────────────

/**
 * Plugin qui dispatche le cycle de vie des UIDefinitions.
 * Ne connaît aucun renderer — dispatch pur.
 */
export class UIManager implements TsPlugin {
  readonly name = 'UIManager';

  private definitions = new Map<string, UIDefinition<any>>();
  private mounted     = new Map<EntityId, string>();
  private lastApi:    EngineAPI | null = null; // pour onDestroy

  /** Enregistre une UIDefinition. */
  register(def: UIDefinition<any>): this {
    if (this.definitions.has(def.name)) {
      console.warn(`[UIManager] '${def.name}' already registered — overwriting.`);
    }
    this.definitions.set(def.name, def);
    return this;
  }

  onRender(api: EngineAPI): void {
    this.lastApi = api;
    const entities = api.query([UIComponent.name]);
    const alive    = new Set<EntityId>();

    for (const id of entities) {
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
    // Appeler onUnmount sur toutes les entités encore montées
    if (this.lastApi) {
      for (const [id, defName] of this.mounted) {
        const def = this.definitions.get(defName);
        def?.onUnmount?.(this.lastApi, id);
      }
    }
    this.definitions.clear();
    this.mounted.clear();
    this.lastApi = null;
  }
}
