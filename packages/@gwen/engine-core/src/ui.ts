/**
 * GWEN UI System
 *
 * Implements Direct Binding UI with Single-File Components (SFC).
 * Prevents virtual DOM diffing performance issues by updating DOM directly.
 *
 * @example
 * ```typescript
 * import { defineUI, UIManager, UIComponent } from '@gwen/engine-core';
 *
 * const HealthBarUI = defineUI({
 *   name: 'HealthBar',
 *   css: `.fill { background: red; height: 10px; }`,
 *   html: `<div class="fill" id="fill"></div>`,
 *   onUpdate: (dom, entityId, api) => {
 *     const hp = api.getComponent(entityId, Health);
 *     if (hp) dom.elements['fill'].style.width = `${hp.current}%`;
 *   }
 * });
 *
 * const ui = new UIManager();
 * ui.register(HealthBarUI);
 * engine.registerSystem(ui);
 *
 * // Attach to entity
 * api.addComponent(playerId, UIComponent, { uiName: 'HealthBar' });
 * ```
 */

import type { TsPlugin, EngineAPI } from './types';
import type { EntityId } from './ecs';
import { defineComponent, Types } from './schema';

// ── Component ────────────────────────────────────────────────────────────

/** Component attaching a UI definition to an entity. */
export const UIComponent = defineComponent({
  name: 'UIComponent',
  schema: {
    uiName: Types.string, // Name of the registered UIDefinition
  }
});

// ── Types ────────────────────────────────────────────────────────────────

export interface UIRenderContext {
  /** The wrapper div automatically created around the HTML content. */
  root: HTMLElement;
  /** Dictionary of all elements inside the HTML that have an `id` attribute. */
  elements: Record<string, HTMLElement>;
}

export interface UIDefinition<Services extends Record<string, unknown> = Record<string, unknown>> {
  /** Unique name matching UIComponent.uiName */
  name: string;
  /** Optional CSS block (injected globally once) */
  css?: string;
  /** HTML template string */
  html: string;
  /** Update cycle (called during onRender) */
  onUpdate?: (dom: UIRenderContext, entityId: EntityId, api: EngineAPI<Services>) => void;
}

/**
 * Defines a UI Single-File Component.
 * Enforces the contract and returns the definition unchanged.
 */
export function defineUI<Services extends Record<string, unknown> = Record<string, unknown>>(
  config: UIDefinition<Services>,
): UIDefinition<Services> {
  return config;
}

// ── UIManager Plugin ─────────────────────────────────────────────────────

export interface UIManagerConfig {
  /** ID of the root container (created if missing). Defaults to 'gwen-ui-root'. */
  containerId?: string;
}

export class UIManager implements TsPlugin {
  readonly name = 'UIManager';

  private container: HTMLElement | null = null;
  private styleTag: HTMLStyleElement | null = null;
  private definitions = new Map<string, UIDefinition<any>>();
  private instances = new Map<EntityId, UIRenderContext>();

  constructor(config: UIManagerConfig = {}) {
    if (typeof document !== 'undefined') {
      const cid = config.containerId ?? 'gwen-ui-root';
      let el = document.getElementById(cid);

      if (!el) {
        el = document.createElement('div');
        el.id = cid;
        // The root itself is invisible and overlays the canvas
        el.style.position = 'absolute';
        el.style.top = '0';
        el.style.left = '0';
        el.style.width = '100%';
        el.style.height = '100%';
        el.style.pointerEvents = 'none'; // Let clicks pass through to canvas
        el.style.overflow = 'hidden';
        document.body.appendChild(el);
      }
      this.container = el;

      this.styleTag = document.createElement('style');
      this.styleTag.id = 'gwen-ui-styles';
      document.head.appendChild(this.styleTag);
    }
  }

  /**
   * Register a UI definition. CSS is immediately injected.
   */
  register(def: UIDefinition<any>): this {
    if (this.definitions.has(def.name)) {
      console.warn(`[UIManager] UI definition '${def.name}' is already registered — overwriting.`);
    }
    this.definitions.set(def.name, def);

    if (def.css && this.styleTag) {
      this.styleTag.textContent += `\n/* ${def.name} */\n${def.css}\n`;
    }

    return this;
  }

  /**
   * Runs during the Render phase.
   * Mounts new UIs, updates active ones, and unmounts removed ones.
   */
  onRender(api: EngineAPI): void {
    const entities = api.query([UIComponent.name]);
    const aliveThisFrame = new Set<EntityId>();

    // 1. Mount & Update
    for (const id of entities) {
      aliveThisFrame.add(id);
      const uiData = api.getComponent(id, UIComponent);
      if (!uiData) continue;

      const def = this.definitions.get(uiData.uiName);
      if (!def) continue;

      let ctx = this.instances.get(id);

      // Mount or recreate if definition changed on the entity
      if (!ctx) {
        ctx = this.mount(def);
        this.instances.set(id, ctx);
      } else if (ctx.root.dataset.gwenUi !== uiData.uiName) {
        this.unmount(ctx);
        ctx = this.mount(def);
        this.instances.set(id, ctx);
      }

      // Execute Direct Binding
      if (def.onUpdate) {
        def.onUpdate(ctx, id, api);
      }
    }

    // 2. Unmount dead entities
    for (const [id, ctx] of this.instances.entries()) {
      if (!aliveThisFrame.has(id)) {
        this.unmount(ctx);
        this.instances.delete(id);
      }
    }
  }

  onDestroy(): void {
    // Unmount all instances
    for (const ctx of this.instances.values()) {
      this.unmount(ctx);
    }
    this.instances.clear();

    // Clean up DOM if we created it
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    if (this.styleTag && this.styleTag.parentNode) {
      this.styleTag.parentNode.removeChild(this.styleTag);
    }
    this.container = null;
    this.styleTag = null;
  }

  // ── Internal ───────────────────────────────────────────────────────────

  private mount(def: UIDefinition<any>): UIRenderContext {
    // Node.js fallback for tests
    if (typeof document === 'undefined') {
      return { root: {} as HTMLElement, elements: {} };
    }

    const root = document.createElement('div');
    root.dataset.gwenUi = def.name;
    // Allow inner elements to be clickable if they have pointer-events set by CSS
    root.style.pointerEvents = 'auto';
    root.innerHTML = def.html;

    if (this.container) {
      this.container.appendChild(root);
    }

    // Map `[id]` elements into `ctx.elements` for O(1) direct access
    const elements: Record<string, HTMLElement> = {};
    const nodesWithId = root.querySelectorAll('[id]');
    nodesWithId.forEach(node => {
      elements[node.id] = node as HTMLElement;
    });

    return { root, elements };
  }

  private unmount(ctx: UIRenderContext): void {
    if (ctx.root && ctx.root.parentNode) {
      ctx.root.parentNode.removeChild(ctx.root);
    }
  }
}
