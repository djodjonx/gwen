import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HtmlUIPlugin, type HtmlUI } from '../src/index';
import { EntityManager, ComponentRegistry, QueryEngine, createEngineAPI } from '@gwen/engine-core';

function makeApi() {
  return createEngineAPI(new EntityManager(100), new ComponentRegistry(), new QueryEngine());
}

const TEMPLATE = `
  <style>.hud { color: #4fffb0; }</style>
  <div id="score" class="hud">SCORE: 0</div>
  <div id="lives">♥ ♥ ♥</div>
`;

describe('HtmlUIPlugin', () => {
  let api: ReturnType<typeof makeApi>;
  let plugin: HtmlUIPlugin;

  beforeEach(() => {
    // Nettoyer le DOM entre chaque test
    document.getElementById('gwen-html-ui')?.remove();
    document.querySelectorAll('style[data-gwen-ui]').forEach((el) => el.remove());

    api = makeApi();
    plugin = new HtmlUIPlugin();
    plugin.onInit(api);
  });

  afterEach(() => {
    plugin.onDestroy();
  });

  // ── onInit ───────────────────────────────────────────────────────────────

  it('creates #gwen-html-ui container on init', () => {
    const el = document.getElementById('gwen-html-ui');
    expect(el).not.toBeNull();
    expect(el!.style.position).toBe('fixed');
  });

  it('registers htmlUI service', () => {
    expect(api.services.has('htmlUI')).toBe(true);
  });

  // ── mount ────────────────────────────────────────────────────────────────

  it('mount creates DOM for entity', () => {
    const ui = api.services.get('htmlUI') as unknown as HtmlUI;
    ui.mount(1, TEMPLATE);

    const container = document.getElementById('gwen-html-ui')!;
    const root = container.querySelector('[data-gwen-entity="1"]');
    expect(root).not.toBeNull();
  });

  it('mount injects <style> into <head>', () => {
    const ui = api.services.get('htmlUI') as unknown as HtmlUI;
    ui.mount(1, TEMPLATE);

    const styles = document.querySelectorAll('style[data-gwen-ui]');
    expect(styles.length).toBeGreaterThan(0);
    expect(styles[0].textContent).toContain('.hud');
  });

  it('mount deduplicates identical <style> blocks', () => {
    const ui = api.services.get('htmlUI') as unknown as HtmlUI;
    ui.mount(1, TEMPLATE);
    ui.mount(2, TEMPLATE);

    const allStyles = document.querySelectorAll('style[data-gwen-ui]');
    const hashes = Array.from(allStyles).map((s) => s.getAttribute('data-gwen-ui'));
    const unique = new Set(hashes);
    expect(hashes.length).toBe(unique.size);
  });

  it('mount warns and remounts if entity already mounted', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
    const ui = api.services.get('htmlUI') as unknown as HtmlUI;
    ui.mount(1, TEMPLATE);
    ui.mount(1, TEMPLATE);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('already has a mounted template'));
    warn.mockRestore();
  });

  // ── el / text / style ────────────────────────────────────────────────────

  it('el returns element by ID', () => {
    const ui = api.services.get('htmlUI') as unknown as HtmlUI;
    ui.mount(1, TEMPLATE);

    const el = ui.el(1, 'score');
    expect(el).not.toBeNull();
    expect(el!.id).toBe('score');
  });

  it('el returns undefined for unknown ID', () => {
    const ui = api.services.get('htmlUI') as unknown as HtmlUI;
    ui.mount(1, TEMPLATE);
    expect(ui.el(1, 'nonexistent')).toBeUndefined();
  });

  it('text updates textContent', () => {
    const ui = api.services.get('htmlUI') as unknown as HtmlUI;
    ui.mount(1, TEMPLATE);
    ui.text(1, 'score', 'SCORE: 42');
    expect(ui.el(1, 'score')!.textContent).toBe('SCORE: 42');
  });

  it('style updates element style', () => {
    const ui = api.services.get('htmlUI') as unknown as HtmlUI;
    ui.mount(1, TEMPLATE);
    ui.style(1, 'score', 'color', 'red');
    expect(ui.el(1, 'score')!.style.color).toBe('red');
  });

  // ── unmount ──────────────────────────────────────────────────────────────

  it('unmount removes DOM for entity', () => {
    const ui = api.services.get('htmlUI') as unknown as HtmlUI;
    ui.mount(1, TEMPLATE);

    const container = document.getElementById('gwen-html-ui')!;
    expect(container.querySelector('[data-gwen-entity="1"]')).not.toBeNull();

    ui.unmount(1);
    expect(container.querySelector('[data-gwen-entity="1"]')).toBeNull();
  });

  it('unmount is a no-op for unknown entity', () => {
    const ui = api.services.get('htmlUI') as unknown as HtmlUI;
    expect(() => ui.unmount(999)).not.toThrow();
  });

  it('el returns undefined after unmount', () => {
    const ui = api.services.get('htmlUI') as unknown as HtmlUI;
    ui.mount(1, TEMPLATE);
    ui.unmount(1);
    expect(ui.el(1, 'score')).toBeUndefined();
  });

  // ── onDestroy ────────────────────────────────────────────────────────────

  it('onDestroy cleans up container', () => {
    const ui = api.services.get('htmlUI') as unknown as HtmlUI;
    ui.mount(1, TEMPLATE);
    ui.mount(2, TEMPLATE);

    plugin.onDestroy();

    expect(document.getElementById('gwen-html-ui')).toBeNull();
  });
});
