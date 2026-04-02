/**
 * @gwenjs/gwen-plugin-html-ui
 *
 * GWEN plugin for HTML DOM-based UI rendering.
 * Exposes a `HtmlUI` service via the engine's provide/inject registry as `'htmlUI'`.
 *
 * @example
 * ```ts
 * import { HtmlUIPlugin } from '@gwenjs/gwen-plugin-html-ui';
 * export default defineConfig({ plugins: [HtmlUIPlugin()] });
 *
 * // src/ui/ScoreUI.ts
 * export const ScoreUI = defineUI({
 *   name: 'ScoreUI',
 *   onMount(engine, entityId) {
 *     engine.inject('htmlUI').mount(entityId, scoreHtml);
 *   },
 *   render(engine, entityId) {
 *     engine.inject('htmlUI').text(entityId, 'score', `${score.value}`);
 *   },
 *   onUnmount(engine, entityId) {
 *     engine.inject('htmlUI').unmount(entityId);
 *   },
 * });
 * ```
 */

import { definePlugin } from '@gwenjs/kit';
import type { EntityId, GwenPluginMeta } from '@gwenjs/kit';
import type { GwenEngine } from '@gwenjs/core';
// Side-effect: augments GwenProvides with 'htmlUI' key, enabling typed provide/inject.
import './augment.js';

// ── Plugin metadata ───────────────────────────────────────────────────────────

/**
 * Static metadata consumed by `gwen prepare` to inject
 * `/// <reference types="@gwenjs/gwen-plugin-html-ui/vite-env" />` into `.gwen/gwen.d.ts`.
 */
export const pluginMeta: GwenPluginMeta = {
  typeReferences: ['@gwenjs/gwen-plugin-html-ui/vite-env'],
  serviceTypes: {
    htmlUI: { from: '@gwenjs/gwen-plugin-html-ui', exportName: 'HtmlUI' },
  },
};

// ── HtmlUI service ────────────────────────────────────────────────────────────

export interface HtmlUI {
  /**
   * Mount an HTML template for an entity.
   * Injects `<style>` into document head (deduplicated) and creates an
   * isolated DOM subtree under `#gwen-html-ui`.
   *
   * @param entityId Unique entity identifier.
   * @param template Raw HTML string (can include a `<style>` tag).
   */
  mount(entityId: EntityId, template: string): void;

  /**
   * Unmount and remove all DOM for an entity. Idempotent.
   *
   * @param entityId Entity to unmount.
   */
  unmount(entityId: EntityId): void;

  /**
   * Get a child element by its `id` attribute within an entity's template.
   *
   * @param entityId Entity identifier.
   * @param id       Element ID.
   */
  el(entityId: EntityId, id: string): HTMLElement | undefined;

  /**
   * Update the `textContent` of an element.
   *
   * @param entityId Entity identifier.
   * @param id       Element ID.
   * @param value    New text content.
   */
  text(entityId: EntityId, id: string, value: string): void;

  /**
   * Update a CSS property on an element (`element.style[prop] = value`).
   *
   * @param entityId Entity identifier.
   * @param id       Element ID.
   * @param prop     CSS property name (camelCase).
   * @param value    CSS value.
   */
  style(entityId: EntityId, id: string, prop: string, value: string): void;
}

interface DomContext {
  root: HTMLElement;
  elements: Map<string, HTMLElement>;
}

// ── HtmlUIPlugin ──────────────────────────────────────────────────────────────

export const HtmlUIPlugin = definePlugin(() => {
  let container: HTMLElement | null = null;
  const instances = new Map<EntityId, DomContext>();

  // ── DOM helpers ──────────────────────────────────────────────────────

  function mount(entityId: EntityId, template: string): void {
    if (!container) return;
    if (instances.has(entityId)) {
      console.warn(`[HtmlUIPlugin] entity ${entityId} already mounted — unmounting first.`);
      unmount(entityId);
    }

    const styleMatch = template.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    const html = template.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').trim();

    if (styleMatch && typeof document !== 'undefined') {
      const css = styleMatch[1].trim();
      const hash = css.length + '_' + css.slice(0, 32).replace(/\s/g, '');
      if (!document.querySelector(`style[data-gwen-ui="${hash}"]`)) {
        const tag = document.createElement('style');
        tag.setAttribute('data-gwen-ui', hash);
        tag.textContent = css;
        document.head.appendChild(tag);
      }
    }

    const root = document.createElement('div');
    root.dataset.gwenEntity = String(entityId);
    root.style.pointerEvents = 'auto';
    root.innerHTML = html;
    container.appendChild(root);

    const elements = new Map<string, HTMLElement>();
    root.querySelectorAll('[id]').forEach((el) => elements.set(el.id, el as HTMLElement));

    instances.set(entityId, { root, elements });
  }

  function unmount(entityId: EntityId): void {
    const ctx = instances.get(entityId);
    if (!ctx) return;
    ctx.root.parentNode?.removeChild(ctx.root);
    instances.delete(entityId);
  }

  function el(entityId: EntityId, id: string): HTMLElement | undefined {
    return instances.get(entityId)?.elements.get(id);
  }

  const service: HtmlUI = {
    mount,
    unmount,
    el,
    text(entityId, id, value) {
      const elem = el(entityId, id);
      if (elem) elem.textContent = value;
    },
    style(entityId, id, prop, value) {
      const elem = el(entityId, id);
      if (elem) (elem.style as CSSStyleDeclaration & Record<string, string>)[prop] = value;
    },
  };

  return {
    name: '@gwenjs/ui',
    meta: pluginMeta,

    setup(engine: GwenEngine): void {
      if (typeof document !== 'undefined') {
        let elem = document.getElementById('gwen-html-ui');
        if (!elem) {
          elem = document.createElement('div');
          elem.id = 'gwen-html-ui';
          elem.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:100';
          document.body.appendChild(elem);
        }
        container = elem;
      }
      engine.provide('htmlUI', service);
    },

    teardown(): void {
      for (const ctx of instances.values()) {
        ctx.root.parentNode?.removeChild(ctx.root);
      }
      instances.clear();
      container?.parentNode?.removeChild(container);
      container = null;
    },
  };
});

// ─── Module, composables & type augmentations ─────────────────────────────────
export * from './augment.js';
export { useHtmlUI } from './composables.js';
export { default } from './module.js';
