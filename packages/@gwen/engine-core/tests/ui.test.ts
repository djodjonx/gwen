import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { defineUI, UIManager, UIComponent } from '../src/ui';
import { EntityManager, ComponentRegistry, QueryEngine, createEngineAPI } from '../src/index';

// Vitest environment is 'node' by default, but we can mock enough DOM for UI tests
describe('DSL UI (ui.ts)', () => {
  let api: ReturnType<typeof createEngineAPI>;
  let ui: UIManager;
  let originalDocument: any;

  beforeEach(() => {
    // 1. Minimum DOM mocking
    const fakeElements: any[] = [];
    const makeFakeElement = (tag: string) => {
      const el: any = {
        tagName: tag.toUpperCase(),
        id: '',
        style: {},
        dataset: {},
        children: [],
        innerHTML: '',
        textContent: '',
        parentNode: { removeChild: vi.fn() },
        appendChild: vi.fn((child: any) => {
          child.parentNode = el;
          el.children.push(child);
        }),
        removeChild: vi.fn((child: any) => {
          const idx = el.children.indexOf(child);
          if (idx > -1) el.children.splice(idx, 1);
        }),
        querySelectorAll: vi.fn((query: string) => {
          if (query === '[id]') {
            // Mock matching 2 injected elements based on our test innerHTML
            const span1 = makeFakeElement('span'); span1.id = 'health-value';
            const div1 = makeFakeElement('div'); div1.id = 'health-bar';
            return [span1, div1];
          }
          return [];
        }),
      };
      fakeElements.push(el);
      return el;
    };

    const mockDoc = {
      createElement: vi.fn((tag: string) => makeFakeElement(tag)),
      getElementById: vi.fn(() => null),
      body: { appendChild: vi.fn() },
      head: { appendChild: vi.fn() },
    };

    originalDocument = global.document;
    (global as any).document = mockDoc;

    // 2. Engine setup
    api = createEngineAPI(new EntityManager(100), new ComponentRegistry(), new QueryEngine());

    // 3. System
    ui = new UIManager();
  });

  afterEach(() => {
    ui.onDestroy();
    (global as any).document = originalDocument;
  });

  it('should register a UI definition and inject CSS', () => {
    const HealthBar = defineUI({
      name: 'HealthBar',
      css: '.bar { color: red; }',
      html: '<div id="health-bar"></div>',
    });

    ui.register(HealthBar);

    // check CSS injected in style tag
    const styleContent = (ui as any).styleTag.textContent;
    expect(styleContent).toContain('.bar { color: red; }');
  });

  it('should mount UI for an entity with UIComponent', () => {
    let updateCalled = false;
    const HUD = defineUI({
      name: 'HUD',
      html: '<span id="health-value">100</span><div id="health-bar"></div>',
      onUpdate: (dom, id, apiParam) => {
        expect(dom.elements['health-value']).toBeDefined();
        expect(dom.elements['health-bar']).toBeDefined();
        expect(id).toBe(entity);
        expect(apiParam).toBe(api);
        updateCalled = true;
      }
    });

    ui.register(HUD);

    const entity = api.createEntity();
    api.addComponent(entity, UIComponent, { uiName: 'HUD' });

    // Triggers mount & update
    ui.onRender(api);

    expect(updateCalled).toBe(true);

    const instances = (ui as any).instances;
    expect(instances.has(entity)).toBe(true);
  });

  it('should unmount UI when entity is destroyed', () => {
    const HUD = defineUI({ name: 'HUD', html: '<div></div>' });
    ui.register(HUD);

    const entity = api.createEntity();
    api.addComponent(entity, UIComponent, { uiName: 'HUD' });

    ui.onRender(api); // Mounts

    api.destroyEntity(entity);
    ui.onRender(api); // Unmounts

    const instances = (ui as any).instances;
    expect(instances.has(entity)).toBe(false);
  });

  it('should unmount UI when UIComponent is removed', () => {
    const HUD = defineUI({ name: 'HUD', html: '<div></div>' });
    ui.register(HUD);

    const entity = api.createEntity();
    api.addComponent(entity, UIComponent, { uiName: 'HUD' });

    ui.onRender(api); // Mounts

    api.removeComponent(entity, UIComponent);
    ui.onRender(api); // Unmounts

    const instances = (ui as any).instances;
    expect(instances.has(entity)).toBe(false);
  });

});
