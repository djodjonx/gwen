import { describe, it, expect, beforeEach, vi } from 'vitest';
import { defineUI, UIManager, UIComponent } from '../src/api/ui';
import { SceneManager } from '../src/api/scene';
import { EntityManager, ComponentRegistry, QueryEngine, createEngineAPI } from '../src/index';

describe('UIManager', () => {
  let api: ReturnType<typeof createEngineAPI>;
  let ui: UIManager;

  beforeEach(() => {
    api = createEngineAPI(new EntityManager(100), new ComponentRegistry(), new QueryEngine());
    ui = new UIManager();
  });

  // ── defineUI ──────────────────────────────────────────────────────────────

  describe('defineUI', () => {
    it('forme 1 — objet direct : retourne la définition inchangée', () => {
      const def = defineUI({ name: 'Test', render: vi.fn() });
      expect(def.name).toBe('Test');
      expect(typeof def.render).toBe('function');
    });

    it('forme 1 — onMount et onUnmount sont optionnels', () => {
      const def = defineUI({ name: 'Minimal', render: vi.fn() });
      expect(def.onMount).toBeUndefined();
      expect(def.onUnmount).toBeUndefined();
    });

    it('forme 2 — factory : retourne une définition avec le bon name', () => {
      const renderFn = vi.fn();
      const def = defineUI('FactoryUI', () => ({ render: renderFn }));
      expect(def.name).toBe('FactoryUI');
      expect(def.render).toBe(renderFn);
    });

    it('forme 2 — factory : la closure est créée une seule fois', () => {
      let callCount = 0;
      const def = defineUI('CountUI', () => {
        callCount++;
        return { render: vi.fn() };
      });
      expect(callCount).toBe(1); // factory appelée immédiatement, une fois
      expect(def.name).toBe('CountUI');
    });

    it("forme 2 — factory : l'état en closure est isolé par définition", () => {
      const def = defineUI('StatefulUI', () => {
        const state = { count: 0 };
        return {
          render: (_api: any, _id: any) => {
            state.count++;
          },
          getCount: () => state.count, // pour le test
        } as any;
      });
      def.render(null as any, 0);
      def.render(null as any, 0);
      expect((def as any).getCount()).toBe(2);
    });

    it('forme 2 — factory : onMount et onUnmount fonctionnent', () => {
      const mountFn = vi.fn();
      const unmountFn = vi.fn();
      const def = defineUI('LifecycleUI', () => ({
        onMount: mountFn,
        render: vi.fn(),
        onUnmount: unmountFn,
      }));
      expect(def.onMount).toBe(mountFn);
      expect(def.onUnmount).toBe(unmountFn);
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
      ui.register(
        defineUI({
          name: 'HUD',
          render(_a, id) {
            renders.push(id);
          },
        }),
      );

      const e1 = api.createEntity();
      api.addComponent(e1, UIComponent, { uiName: 'HUD' });
      const e2 = api.createEntity();
      api.addComponent(e2, UIComponent, { uiName: 'HUD' });

      ui.onRender(api);
      expect(renders).toContain(e1);
      expect(renders).toContain(e2);
    });

    it('unmounts only the destroyed entity', () => {
      const onUnmount = vi.fn();
      ui.register(defineUI({ name: 'HUD', render: vi.fn(), onUnmount }));

      const e1 = api.createEntity();
      api.addComponent(e1, UIComponent, { uiName: 'HUD' });
      const e2 = api.createEntity();
      api.addComponent(e2, UIComponent, { uiName: 'HUD' });

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

// ── Scene.ui auto-injection ───────────────────────────────────────────────────

describe('Scene.ui — auto-injection UIManager', () => {
  function makeApi() {
    return createEngineAPI(new EntityManager(100), new ComponentRegistry(), new QueryEngine());
  }

  it('injecte un UIManager quand scene.ui est défini', () => {
    const renderFn = vi.fn();
    const BgUI = defineUI({ name: 'BgUI', render: renderFn });

    const api = makeApi();
    const scenes = new SceneManager();
    scenes.onInit(api);

    const scene: import('../src/api/scene').Scene = {
      name: 'Test',
      ui: [BgUI],
      onEnter: (_api) => {
        const e = _api.createEntity();
        _api.addComponent(e, UIComponent, { uiName: 'BgUI' });
      },
      onExit: () => {},
    };

    scenes.register(scene);
    scenes.loadSceneImmediate('Test', api);

    // Simuler un frame render
    scenes.onRender(api);

    expect(renderFn).toHaveBeenCalled();
  });

  it("respecte l'ordre de déclaration pour le rendu", () => {
    const order: string[] = [];
    const DefA = defineUI({
      name: 'A',
      render: () => {
        order.push('A');
      },
    });
    const DefB = defineUI({
      name: 'B',
      render: () => {
        order.push('B');
      },
    });
    const DefC = defineUI({
      name: 'C',
      render: () => {
        order.push('C');
      },
    });

    const api = makeApi();
    const scenes = new SceneManager();
    scenes.onInit(api);

    const scene: import('../src/api/scene').Scene = {
      name: 'Ordered',
      ui: [DefA, DefB, DefC],
      onEnter(_api) {
        for (const name of ['A', 'B', 'C']) {
          const e = _api.createEntity();
          _api.addComponent(e, UIComponent, { uiName: name });
        }
      },
      onExit: () => {},
    };

    scenes.register(scene);
    scenes.loadSceneImmediate('Ordered', api);
    scenes.onRender(api);

    expect(order).toEqual(['A', 'B', 'C']);
  });

  it('ne crée pas de UIManager si ui est vide ou absent', () => {
    const api = makeApi();
    const scenes = new SceneManager();
    scenes.onInit(api);

    const scene: import('../src/api/scene').Scene = {
      name: 'NoUI',
      onEnter: () => {},
      onExit: () => {},
    };

    scenes.register(scene);
    expect(() => scenes.loadSceneImmediate('NoUI', api)).not.toThrow();
    // Pas de UIManager injecté → onRender ne plante pas
    expect(() => scenes.onRender(api)).not.toThrow();
  });

  it("démonte l'UIManager lors d'une transition de scène", () => {
    const mountFn = vi.fn();
    const unmountFn = vi.fn();
    const TestUI = defineUI({
      name: 'TestUI',
      onMount: mountFn,
      render: vi.fn(),
      onUnmount: unmountFn,
    });

    const api = makeApi();
    const scenes = new SceneManager();
    scenes.onInit(api);

    const sceneA: import('../src/api/scene').Scene = {
      name: 'SceneA',
      ui: [TestUI],
      onEnter(_api) {
        const e = _api.createEntity();
        _api.addComponent(e, UIComponent, { uiName: 'TestUI' });
      },
      onExit: () => {},
    };
    const sceneB: import('../src/api/scene').Scene = {
      name: 'SceneB',
      ui: [],
      onEnter: () => {},
      onExit: () => {},
    };

    scenes.register(sceneA);
    scenes.register(sceneB);

    scenes.loadSceneImmediate('SceneA', api);
    scenes.onRender(api); // déclenche onMount
    expect(mountFn).toHaveBeenCalledTimes(1);

    scenes.loadSceneImmediate('SceneB', api); // transition → onDestroy → onUnmount des montés
    expect(unmountFn).toHaveBeenCalledTimes(1);
  });
});
