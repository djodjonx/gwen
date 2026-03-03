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
 * Service exposed by HtmlUIPlugin via api.services.get('htmlUI').
 * Manages HTML template lifecycle for UI entities.
 *
 * Templates should use `?raw` import to get raw HTML string:
 * ```typescript
 * import scoreTemplate from './score.html?raw';
 * ```
 */
export interface HtmlUI {
  /**
   * Mount an HTML template for an entity.
   *
   * Parses the template, injects <style> into document head (once, deduplicated),
   * and creates an isolated DOM subtree for the entity under #gwen-html-ui.
   *
   * @param entityId Unique entity identifier
   * @param template Raw HTML string (can include <style> tag)
   *
   * @example
   * ```typescript
   * onMount(api, entityId) {
   *   const html = `
   *     <style>
   *       .score-display { font-size: 24px; color: white; }
   *     </style>
   *     <div class="score-display">
   *       <span id="score">0</span>
   *     </div>
   *   `;
   *   api.services.get('htmlUI').mount(entityId, html);
   * }
   * ```
   */
  mount(entityId: EntityId, template: string): void;

  /**
   * Unmount and remove all DOM for an entity.
   * Safe to call multiple times; idempotent.
   *
   * @param entityId Entity to unmount
   */
  unmount(entityId: EntityId): void;

  /**
   * Get a child element by its ID within an entity's template.
   * Elements are indexed by their `id` attribute.
   *
   * @param entityId Entity identifier
   * @param id Element ID within the template
   * @returns HTMLElement if found, undefined otherwise
   */
  el(entityId: EntityId, id: string): HTMLElement | undefined;

  /**
   * Update the text content of an element.
   * Equivalent to setting `element.textContent`.
   *
   * @param entityId Entity identifier
   * @param id Element ID
   * @param value New text content
   */
  text(entityId: EntityId, id: string, value: string): void;

  /**
   * Update a CSS property on an element.
   * Equivalent to `element.style[prop] = value`.
   *
   * @param entityId Entity identifier
   * @param id Element ID
   * @param prop CSS property name (camelCase, e.g., 'backgroundColor')
   * @param value CSS value
   *
   * @example
   * ```typescript
   * // Set opacity
   * api.services.get('htmlUI').style(entityId, 'ui', 'opacity', '0.5');
   *
   * // Change color
   * api.services.get('htmlUI').style(entityId, 'ui', 'color', '#ff0000');
   * ```
   */
  style(entityId: EntityId, id: string, prop: string, value: string): void;
}

/**
 * Context for managing DOM instances per entity.
 */
interface DomContext {
  root: HTMLElement;
  elements: Map<string, HTMLElement>;
}

/**
 * HtmlUIPlugin — Render entity UIs using HTML templates
 *
 * Manages mounting/unmounting HTML templates to entities and provides
 * a service for dynamic element manipulation (text updates, style changes).
 *
 * Creates a #gwen-html-ui container overlay positioned above the canvas
 * with `pointer-events: none` to avoid blocking game input.
 *
 * @example
 * ```typescript
 * // gwen.config.ts
 * import { HtmlUIPlugin } from '@gwen/plugin-html-ui';
 *
 * export default defineConfig({
 *   plugins: [new HtmlUIPlugin()],
 * });
 *
 * // src/ui/ScoreUI.ts
 * import scoreTemplate from './score.html?raw';
 *
 * export const ScoreUI = defineUI<GwenServices>({
 *   name: 'ScoreUI',
 *   onMount(api, entityId) {
 *     api.services.get('htmlUI').mount(entityId, scoreTemplate);
 *   },
 *   render(api, entityId) {
 *     const score = api.getComponent(entityId, Score);
 *     if (score) {
 *       api.services.get('htmlUI').text(entityId, 'score', `${score.value}`);
 *     }
 *   },
 *   onUnmount(api, entityId) {
 *     api.services.get('htmlUI').unmount(entityId);
 *   },
 * });
 * ```
 */
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
    if (el) {
      const style = el.style as CSSStyleDeclaration & Record<string, string>;
      style[prop] = value;
    }
  }
}
