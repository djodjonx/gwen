import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HtmlUIPlugin, type HtmlUI } from '../src/index';
import { createEntityId } from '@gwenjs/core';
import type { GwenEngine } from '@gwenjs/core';

// ── Mock GwenEngine ──────────────────────────────────────────────────────

function createMockEngine(): GwenEngine {
  const services = new Map<string, unknown>();
  return {
    provide: (key: string, value: unknown) => {
      services.set(key, value);
    },
    inject: (key: string) => {
      const v = services.get(key);
      if (v === undefined) throw new Error(`[mock] No service: ${key}`);
      return v;
    },
    tryInject: (key: string) => services.get(key),
    use: vi.fn().mockResolvedValue(undefined),
    unuse: vi.fn().mockResolvedValue(undefined),
    hooks: {} as GwenEngine['hooks'],
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    startExternal: vi.fn().mockResolvedValue(undefined),
    advance: vi.fn().mockResolvedValue(undefined),
    run: (fn: () => unknown) => fn(),
    activate: vi.fn(),
    deactivate: vi.fn(),
    maxEntities: 1000,
    targetFPS: 60,
    maxDeltaSeconds: 0.1,
    variant: 'light',
    deltaTime: 0,
    frameCount: 0,
    getFPS: () => 0,
    getStats: () => ({ fps: 0, deltaTime: 0, frameCount: 0 }),
    loadWasmModule: vi.fn().mockResolvedValue({}),
    getWasmModule: vi.fn(),
    createLiveQuery: () => [][Symbol.iterator](),
    wasmBridge: {
      physics2d: { enabled: false, enable: vi.fn(), disable: vi.fn(), step: vi.fn() },
      physics3d: { enabled: false, enable: vi.fn(), disable: vi.fn(), step: vi.fn() },
    },
  } as unknown as GwenEngine;
}

const TEMPLATE = `
  <style>.hud { color: #4fffb0; }</style>
  <div id="score" class="hud">SCORE: 0</div>
  <div id="lives">♥ ♥ ♥</div>
`;

describe('HtmlUIPlugin', () => {
  let engine: GwenEngine;
  let plugin: InstanceType<typeof HtmlUIPlugin>;

  beforeEach(() => {
    // Clean DOM between tests
    document.getElementById('gwen-html-ui')?.remove();
    document.querySelectorAll('style[data-gwen-ui]').forEach((el) => el.remove());

    engine = createMockEngine();
    plugin = new HtmlUIPlugin();
    plugin.setup(engine);
  });

  afterEach(() => {
    plugin.teardown!();
  });

  // ── setup ────────────────────────────────────────────────────────────────

  it('creates #gwen-html-ui container on setup', () => {
    const el = document.getElementById('gwen-html-ui');
    expect(el).not.toBeNull();
    expect(el!.style.position).toBe('fixed');
  });

  it('registers htmlUI service', () => {
    expect(engine.tryInject('htmlUI' as any)).toBeDefined();
  });

  // ── mount ────────────────────────────────────────────────────────────────

  it('mount creates DOM for entity', () => {
    const ui = engine.inject('htmlUI' as any) as HtmlUI;
    const id = createEntityId(1, 0);
    ui.mount(id, TEMPLATE);

    const container = document.getElementById('gwen-html-ui')!;
    const root = container.querySelector('[data-gwen-entity="1"]');
    expect(root).not.toBeNull();
  });

  it('mount injects <style> into <head>', () => {
    const ui = engine.inject('htmlUI' as any) as HtmlUI;
    const id = createEntityId(1, 0);
    ui.mount(id, TEMPLATE);

    const styles = document.querySelectorAll('style[data-gwen-ui]');
    expect(styles.length).toBeGreaterThan(0);
    expect(styles[0].textContent).toContain('.hud');
  });

  it('mount deduplicates identical <style> blocks', () => {
    const ui = engine.inject('htmlUI' as any) as HtmlUI;
    const id1 = createEntityId(1, 0);
    const id2 = createEntityId(2, 0);
    ui.mount(id1, TEMPLATE);
    ui.mount(id2, TEMPLATE);

    const allStyles = document.querySelectorAll('style[data-gwen-ui]');
    const hashes = Array.from(allStyles).map((s) => s.getAttribute('data-gwen-ui'));
    const unique = new Set(hashes);
    expect(hashes.length).toBe(unique.size);
  });

  it('mount warns and remounts if entity already mounted', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ui = engine.inject('htmlUI' as any) as HtmlUI;
    const id = createEntityId(1, 0);
    ui.mount(id, TEMPLATE);
    ui.mount(id, TEMPLATE);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('already mounted'));
    warn.mockRestore();
  });

  // ── el / text / style ────────────────────────────────────────────────────

  it('el returns element by ID', () => {
    const ui = engine.inject('htmlUI' as any) as HtmlUI;
    const id = createEntityId(1, 0);
    ui.mount(id, TEMPLATE);

    const el = ui.el(id, 'score');
    expect(el).not.toBeNull();
    expect(el!.id).toBe('score');
  });

  it('el returns undefined for unknown ID', () => {
    const ui = engine.inject('htmlUI' as any) as HtmlUI;
    const id = createEntityId(1, 0);
    ui.mount(id, TEMPLATE);
    expect(ui.el(id, 'nonexistent')).toBeUndefined();
  });

  it('text updates textContent', () => {
    const ui = engine.inject('htmlUI' as any) as HtmlUI;
    const id = createEntityId(1, 0);
    ui.mount(id, TEMPLATE);
    ui.text(id, 'score', 'SCORE: 42');
    expect(ui.el(id, 'score')!.textContent).toBe('SCORE: 42');
  });

  it('style updates element style', () => {
    const ui = engine.inject('htmlUI' as any) as HtmlUI;
    const id = createEntityId(1, 0);
    ui.mount(id, TEMPLATE);
    ui.style(id, 'score', 'color', 'red');
    expect(ui.el(id, 'score')!.style.color).toBe('red');
  });

  // ── unmount ──────────────────────────────────────────────────────────────

  it('unmount removes DOM for entity', () => {
    const ui = engine.inject('htmlUI' as any) as HtmlUI;
    const id = createEntityId(1, 0);
    ui.mount(id, TEMPLATE);

    const container = document.getElementById('gwen-html-ui')!;
    expect(container.querySelector('[data-gwen-entity="1"]')).not.toBeNull();

    ui.unmount(id);
    expect(container.querySelector('[data-gwen-entity="1"]')).toBeNull();
  });

  it('unmount is a no-op for unknown entity', () => {
    const ui = engine.inject('htmlUI' as any) as HtmlUI;
    expect(() => ui.unmount(createEntityId(999, 0))).not.toThrow();
  });

  it('el returns undefined after unmount', () => {
    const ui = engine.inject('htmlUI' as any) as HtmlUI;
    const id = createEntityId(1, 0);
    ui.mount(id, TEMPLATE);
    ui.unmount(id);
    expect(ui.el(id, 'score')).toBeUndefined();
  });

  // ── teardown ─────────────────────────────────────────────────────────────

  it('teardown cleans up container', () => {
    const ui = engine.inject('htmlUI' as any) as HtmlUI;
    const id1 = createEntityId(1, 0);
    const id2 = createEntityId(2, 0);
    ui.mount(id1, TEMPLATE);
    ui.mount(id2, TEMPLATE);

    plugin.teardown!();

    expect(document.getElementById('gwen-html-ui')).toBeNull();
  });
});
