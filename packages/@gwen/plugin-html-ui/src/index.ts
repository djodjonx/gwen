/**
 * @gwen/plugin-html-ui
 *
 * Plugin GWEN pour le rendu UI via le DOM HTML.
 * S'installe dans gwen.config.ts et expose le service 'htmlUI'.
 *
 * @example
 * ```ts
 * // gwen.config.ts
 * import { HtmlUIPlugin } from '@gwen/plugin-html-ui';
 * export default defineConfig({
 *   plugins: [new HtmlUIPlugin()],
 * });
 *
 * // src/ui/ScoreUI.ts
 * import scoreHtml from './score.html?raw';
 *
 * export const ScoreUI = defineUI<GwenServices>({
 *   name: 'ScoreUI',
 *   onMount(api, entityId) {
 *     api.services.get('htmlUI').mount(entityId, scoreHtml);
 *   },
 *   render(api, entityId) {
 *     const score = api.getComponent(entityId, Score);
 *     api.services.get('htmlUI').text(entityId, 'score', `SCORE: ${score?.value}`);
 *   },
 *   onUnmount(api, entityId) {
 *     api.services.get('htmlUI').unmount(entityId);
 *   },
 * });
 * ```
 */

import type { GwenPlugin, GwenPluginMeta, EngineAPI } from '@gwen/engine-core';
import type { EntityId } from '@gwen/engine-core';

// ── Plugin metadata — consommées par `gwen prepare` ───────────────────────────

/**
 * Métadonnées statiques du plugin.
 * `gwen prepare` les lit pour injecter `/// <reference types="..." />`
 * dans `.gwen/gwen.d.ts` uniquement si ce plugin est dans gwen.config.ts.
 */
export const pluginMeta: GwenPluginMeta = {
  typeReferences: ['@gwen/plugin-html-ui/vite-env'],
};

// ── HtmlUI service ────────────────────────────────────────────────────────────

/**
 * Service exposé par HtmlUIPlugin via api.services.get('htmlUI').
 * Gère le cycle de vie des templates HTML par entité.
 */
export interface HtmlUI {
  /**
   * Monte un template HTML pour une entité.
   * Parse le template, injecte le <style> dans <head> (une fois),
   * et crée un sous-arbre DOM isolé pour l'entité.
   */
  mount(entityId: EntityId, template: string): void;

  /** Démonte et supprime le DOM de l'entité. */
  unmount(entityId: EntityId): void;

  /** Récupère un élément par son ID dans le template de l'entité. */
  el(entityId: EntityId, id: string): HTMLElement | undefined;

  /** Met à jour textContent d'un élément. */
  text(entityId: EntityId, id: string, value: string): void;

  /** Met à jour une propriété CSS d'un élément. */
  style(entityId: EntityId, id: string, prop: string, value: string): void;
}

// ── Internal DOM context per entity ──────────────────────────────────────────

interface DomContext {
  root: HTMLElement;
  elements: Map<string, HTMLElement>;
}

// ── HtmlUIPlugin ──────────────────────────────────────────────────────────────

export class HtmlUIPlugin implements GwenPlugin<'HtmlUIPlugin', { htmlUI: HtmlUI }> {
  readonly name = 'HtmlUIPlugin' as const;
  readonly provides = { htmlUI: {} as HtmlUI };

  private container: HTMLElement | null = null;
  private instances: Map<EntityId, DomContext> = new Map();
  private service!: HtmlUI;

  onInit(api: EngineAPI): void {
    // Créer le conteneur overlay au dessus du canvas
    if (typeof document !== 'undefined') {
      let el = document.getElementById('gwen-html-ui');
      if (!el) {
        el = document.createElement('div');
        el.id = 'gwen-html-ui';
        el.style.cssText = ['position:fixed', 'inset:0', 'pointer-events:none', 'z-index:100'].join(
          ';',
        );
        document.body.appendChild(el);
      }
      this.container = el;
    }

    // Construire le service
    this.service = {
      mount: this.mount.bind(this),
      unmount: this.unmount.bind(this),
      el: this.el.bind(this),
      text: this.text.bind(this),
      style: this.styleEl.bind(this),
    };

    api.services.register('htmlUI', this.service);
  }

  onDestroy(): void {
    // Supprimer tous les sous-arbres DOM
    for (const ctx of this.instances.values()) {
      ctx.root.parentNode?.removeChild(ctx.root);
    }
    this.instances.clear();

    // Supprimer le conteneur
    this.container?.parentNode?.removeChild(this.container);
    this.container = null;
  }

  // ── HtmlUI implementation ─────────────────────────────────────────────────

  private mount(entityId: EntityId, template: string): void {
    if (!this.container) return;
    if (this.instances.has(entityId)) {
      console.warn(
        `[HtmlUIPlugin] entity ${entityId} already has a mounted template — unmounting first.`,
      );
      this.unmount(entityId);
    }

    // Séparer <style> et le reste du template
    const styleMatch = template.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    const html = template.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').trim();

    // Injecter le <style> une seule fois — déduplication par hash dans le DOM
    if (styleMatch && typeof document !== 'undefined') {
      const css = styleMatch[1].trim();
      const hash = css.length + '_' + css.slice(0, 32).replace(/\s/g, '');
      const existing = document.querySelector(`style[data-gwen-ui="${hash}"]`);
      if (!existing) {
        const tag = document.createElement('style');
        tag.setAttribute('data-gwen-ui', hash);
        tag.textContent = css;
        document.head.appendChild(tag);
      }
    }

    // Créer le sous-arbre DOM de l'entité
    const root = document.createElement('div');
    root.dataset.gwenEntity = String(entityId);
    root.style.pointerEvents = 'auto';
    root.innerHTML = html;
    this.container.appendChild(root);

    // Index des éléments par ID pour accès O(1)
    const elements = new Map<string, HTMLElement>();
    root.querySelectorAll('[id]').forEach((el) => {
      elements.set(el.id, el as HTMLElement);
    });

    this.instances.set(entityId, { root, elements });
  }

  private unmount(entityId: EntityId): void {
    const ctx = this.instances.get(entityId);
    if (!ctx) return;
    ctx.root.parentNode?.removeChild(ctx.root);
    this.instances.delete(entityId);
  }

  private el(entityId: EntityId, id: string): HTMLElement | undefined {
    return this.instances.get(entityId)?.elements.get(id);
  }

  private text(entityId: EntityId, id: string, value: string): void {
    const el = this.el(entityId, id);
    if (el) el.textContent = value;
  }

  private styleEl(entityId: EntityId, id: string, prop: string, value: string): void {
    const el = this.el(entityId, id);
    if (el) (el.style as any)[prop] = value;
  }
}
