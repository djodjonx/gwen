import { describe, it, expect, beforeEach, vi } from 'vitest';
import { defineUI, UIManager, UIComponent } from '../src/ui';
import { EntityManager, ComponentRegistry, QueryEngine, createEngineAPI } from '../src/index';

describe('UIManager', () => {
  let api: ReturnType<typeof createEngineAPI>;
  let ui: UIManager;

  beforeEach(() => {
    api = createEngineAPI(new EntityManager(100), new ComponentRegistry(), new QueryEngine());
    ui  = new UIManager();
  });

  // ── defineUI ──────────────────────────────────────────────────────────────

  describe('defineUI', () => {
    it('returns the definition unchanged', () => {
      const def = defineUI({ name: 'Test', render: vi.fn() });
      expect(def.name).toBe('Test');
      expect(typeof def.render).toBe('function');
    });

    it('onMount and onUnmount are optional', () => {
      const def = defineUI({ name: 'Minimal', render: vi.fn() });
      expect(def.onMount).toBeUndefined();
      expect(def.onUnmount).toBeUndefined();
    });
  });

  // ── register ──────────────────────────────────────────────────────────────

  describe('register', () => {
    it('registers a definition', () => {
      const def = defineUI({ name: 'HUD', render: vi.fn() });
      ui.register(def);
      expect((ui as any).definitions.has('HUD')).toBe(true);
    });

    it('overwrites on duplicate name (with warning)', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const def1 = defineUI({ name: 'HUD', render: vi.fn() });
      const def2 = defineUI({ name: 'HUD', render: vi.fn() });
      ui.register(def1);
      ui.register(def2);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("'HUD' already registered"));
      expect((ui as any).definitions.get('HUD')).toBe(def2);
      warn.mockRestore();
    });

    it('is chainable', () => {
      const def = defineUI({ name: 'HUD', render: vi.fn() });
      expect(ui.register(def)).toBe(ui);
    });
  });

  // ── onRender — mount ──────────────────────────────────────────────────────

  describe('onRender — mount', () => {
    it('calls onMount once on first render', () => {
      const onMount = vi.fn();
      ui.register(defineUI({ name: 'HUD', onMount, render: vi.fn() }));
      const entity = api.createEntity();
      api.addComponent(entity, UIComponent, { uiName: 'HUD' });

      ui.onRender(api);
      ui.onRender(api);

      expect(onMount).toHaveBeenCalledTimes(1);
      expect(onMount).toHaveBeenCalledWith(api, entity);
    });

    it('calls render every frame', () => {
      const render = vi.fn();
      ui.register(defineUI({ name: 'HUD', render }));
      const entity = api.createEntity();
      api.addComponent(entity, UIComponent, { uiName: 'HUD' });

      ui.onRender(api);
      ui.onRender(api);
      ui.onRender(api);

      expect(render).toHaveBeenCalledTimes(3);
      expect(render).toHaveBeenCalledWith(api, entity);
    });

    it('does not call onMount if no UIComponent', () => {
      const onMount = vi.fn();
      ui.register(defineUI({ name: 'HUD', onMount, render: vi.fn() }));
      api.createEntity(); // entity sans UIComponent

      ui.onRender(api);
      expect(onMount).not.toHaveBeenCalled();
    });

    it('warns when UIDefinition not found', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const entity = api.createEntity();
      api.addComponent(entity, UIComponent, { uiName: 'Missing' });

      ui.onRender(api);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("'Missing'"));
      warn.mockRestore();
    });
  });

  // ── onRender — unmount ────────────────────────────────────────────────────

  describe('onRender — unmount', () => {
    it('calls onUnmount when entity is destroyed', () => {
      const onUnmount = vi.fn();
      ui.register(defineUI({ name: 'HUD', render: vi.fn(), onUnmount }));
      const entity = api.createEntity();
      api.addComponent(entity, UIComponent, { uiName: 'HUD' });

      ui.onRender(api); // mount
      api.destroyEntity(entity);
      ui.onRender(api); // unmount

      expect(onUnmount).toHaveBeenCalledTimes(1);
      expect(onUnmount).toHaveBeenCalledWith(api, entity);
    });

    it('calls onUnmount when UIComponent is removed', () => {
      const onUnmount = vi.fn();
      ui.register(defineUI({ name: 'HUD', render: vi.fn(), onUnmount }));
      const entity = api.createEntity();
      api.addComponent(entity, UIComponent, { uiName: 'HUD' });

      ui.onRender(api);
      api.removeComponent(entity, UIComponent);
      ui.onRender(api);

      expect(onUnmount).toHaveBeenCalledTimes(1);
    });

    it('removes entity from mounted set after unmount', () => {
      ui.register(defineUI({ name: 'HUD', render: vi.fn(), onUnmount: vi.fn() }));
      const entity = api.createEntity();
      api.addComponent(entity, UIComponent, { uiName: 'HUD' });

      ui.onRender(api);
      expect((ui as any).mounted.has(entity)).toBe(true);

      api.destroyEntity(entity);
      ui.onRender(api);
      expect((ui as any).mounted.has(entity)).toBe(false);
    });

    it('does not call render after unmount', () => {
      const render = vi.fn();
      ui.register(defineUI({ name: 'HUD', render, onUnmount: vi.fn() }));
      const entity = api.createEntity();
      api.addComponent(entity, UIComponent, { uiName: 'HUD' });

      ui.onRender(api); // render x1
      api.destroyEntity(entity);
      ui.onRender(api); // unmount — render ne doit pas être appelé
      ui.onRender(api); // idem

      expect(render).toHaveBeenCalledTimes(1);
    });
  });

  // ── multiple entities ─────────────────────────────────────────────────────

  describe('multiple entities', () => {
    it('manages multiple entities with the same UI independently', () => {
      const renders: number[] = [];
      ui.register(defineUI({
        name: 'HUD',
        render(_a, id) { renders.push(id); },
      }));

      const e1 = api.createEntity(); api.addComponent(e1, UIComponent, { uiName: 'HUD' });
      const e2 = api.createEntity(); api.addComponent(e2, UIComponent, { uiName: 'HUD' });

      ui.onRender(api);
      expect(renders).toContain(e1);
      expect(renders).toContain(e2);
    });

    it('unmounts only the destroyed entity', () => {
      const onUnmount = vi.fn();
      ui.register(defineUI({ name: 'HUD', render: vi.fn(), onUnmount }));

      const e1 = api.createEntity(); api.addComponent(e1, UIComponent, { uiName: 'HUD' });
      const e2 = api.createEntity(); api.addComponent(e2, UIComponent, { uiName: 'HUD' });

      ui.onRender(api);
      api.destroyEntity(e1);
      ui.onRender(api);

      expect(onUnmount).toHaveBeenCalledTimes(1);
      expect(onUnmount).toHaveBeenCalledWith(api, e1);
      expect((ui as any).mounted.has(e2)).toBe(true);
    });
  });

  // ── onDestroy ─────────────────────────────────────────────────────────────

  describe('onDestroy', () => {
    it('clears all state', () => {
      ui.register(defineUI({ name: 'HUD', render: vi.fn() }));
      const entity = api.createEntity();
      api.addComponent(entity, UIComponent, { uiName: 'HUD' });
      ui.onRender(api);

      ui.onDestroy();

      expect((ui as any).definitions.size).toBe(0);
      expect((ui as any).mounted.size).toBe(0);
    });
  });
});
