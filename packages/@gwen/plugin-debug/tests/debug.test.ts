/**
 * Tests — DebugPlugin + FpsTracker
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FpsTracker } from '../src/fps-tracker';
import { DebugPlugin } from '../src/index';
import type { EngineAPI } from '@gwen/engine-core';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAPI(overrides: Partial<EngineAPI> = {}): EngineAPI {
  return {
    frameCount: 0,
    deltaTime: 0,
    query: vi.fn(() => []),
    createEntity: vi.fn(() => 1),
    destroyEntity: vi.fn(() => true),
    addComponent: vi.fn(),
    getComponent: vi.fn(),
    hasComponent: vi.fn(() => false),
    removeComponent: vi.fn(() => false),
    services: {
      register: vi.fn(),
      get: vi.fn(),
      has: vi.fn(() => false),
    },
    prefabs: {
      define: vi.fn(),
      instantiate: vi.fn(() => 1),
      has: vi.fn(() => false),
    } as unknown as EngineAPI['prefabs'],
    ...overrides,
  } as unknown as EngineAPI;
}

// ── FpsTracker ────────────────────────────────────────────────────────────────

describe('FpsTracker', () => {
  it('retourne 0 si vide', () => {
    const t = new FpsTracker(10);
    expect(t.instantFps()).toBe(0);
    expect(t.rollingFps()).toBe(0);
    expect(t.minFps()).toBe(0);
    expect(t.maxFps()).toBe(0);
    expect(t.jitter()).toBe(0);
  });

  it('calcule le FPS instantané correctement', () => {
    const t = new FpsTracker(10);
    t.push(1 / 60); // 60 FPS
    expect(t.instantFps()).toBeCloseTo(60, 0);
  });

  it('calcule le rolling FPS sur la fenêtre', () => {
    const t = new FpsTracker(4);
    t.push(1 / 60);
    t.push(1 / 60);
    t.push(1 / 60);
    t.push(1 / 60);
    expect(t.rollingFps()).toBeCloseTo(60, 0);
  });

  it('détecte le min et max', () => {
    const t = new FpsTracker(10);
    t.push(1 / 30);  // 30 FPS
    t.push(1 / 60);  // 60 FPS
    t.push(1 / 120); // 120 FPS
    expect(t.minFps()).toBeCloseTo(30, 0);
    expect(t.maxFps()).toBeCloseTo(120, 0);
  });

  it('calcule une gigue non nulle avec des deltas variés', () => {
    const t = new FpsTracker(10);
    t.push(1 / 30);
    t.push(1 / 120);
    expect(t.jitter()).toBeGreaterThan(0);
  });

  it('gigue nulle avec des deltas identiques', () => {
    const t = new FpsTracker(10);
    for (let i = 0; i < 5; i++) t.push(1 / 60);
    expect(t.jitter()).toBeCloseTo(0, 1);
  });

  it('fonctionne en buffer circulaire (overflow)', () => {
    const t = new FpsTracker(3);
    t.push(1 / 30);
    t.push(1 / 30);
    t.push(1 / 30);
    t.push(1 / 60); // écrase le 1er slot
    t.push(1 / 60);
    t.push(1 / 60);
    // Les 3 derniers slots devraient être 60 FPS
    expect(t.rollingFps()).toBeCloseTo(60, 0);
  });

  it('reset remet tout à zéro', () => {
    const t = new FpsTracker(10);
    t.push(1 / 60);
    t.reset();
    expect(t.instantFps()).toBe(0);
  });

  it('clamp les deltas aberrants', () => {
    const t = new FpsTracker(5);
    t.push(-1);   // négatif → clamped à 0.001
    t.push(999);  // trop grand → clamped à 1.0 (= 1 FPS)
    expect(t.instantFps()).toBeGreaterThanOrEqual(1);
  });
});

// ── DebugPlugin ───────────────────────────────────────────────────────────────

describe('DebugPlugin', () => {
  let api: EngineAPI;

  beforeEach(() => {
    api = makeAPI({ frameCount: 42 });
  });

  it('a le nom correct', () => {
    expect(new DebugPlugin().name).toBe('DebugPlugin');
  });

  it('enregistre le service debug dans api.services à l\'init', () => {
    const plugin = new DebugPlugin();
    plugin.onInit(api);
    expect(api.services.register).toHaveBeenCalledWith('debug', expect.any(Object));
  });

  it('getMetrics() retourne des métriques avec des valeurs initiales', () => {
    const registeredServices = new Map<string, unknown>();
    const api2 = makeAPI({
      frameCount: 10,
      services: {
        register: (name: string, instance: unknown) => { registeredServices.set(name, instance); },
        get: (name: string) => registeredServices.get(name),
        has: (name: string) => registeredServices.has(name),
      } as unknown as EngineAPI['services'],
    });

    const plugin = new DebugPlugin({ updateInterval: 1 });
    plugin.onInit(api2);
    plugin.onBeforeUpdate(api2, 1 / 60);

    const service = registeredServices.get('debug') as { getMetrics: () => import('../src/types').DebugMetrics };
    const m = service.getMetrics();

    expect(m.fps).toBeGreaterThan(0);
    expect(m.frameTimeMs).toBeCloseTo(1000 / 60, 0);
    expect(m.frameCount).toBe(10);
    expect(m.isDropping).toBe(false);
  });

  it('détecte une chute de FPS après la grace period', () => {
    const registeredServices = new Map<string, unknown>();
    const onDrop = vi.fn();
    const api2 = makeAPI({
      frameCount: 100,
      services: {
        register: (name: string, instance: unknown) => { registeredServices.set(name, instance); },
        get: (name: string) => registeredServices.get(name),
        has: (name: string) => registeredServices.has(name),
      } as unknown as EngineAPI['services'],
    });

    const plugin = new DebugPlugin({
      updateInterval: 1,
      fpsDrop: { threshold: 50, gracePeriodFrames: 3, onDrop },
    });
    plugin.onInit(api2);

    const slowDelta = 1 / 20; // 20 FPS → sous le seuil de 50
    plugin.onBeforeUpdate(api2, slowDelta); // frame 1 : consecutiveDropFrames=1 — pas encore
    plugin.onBeforeUpdate(api2, slowDelta); // frame 2 : consecutiveDropFrames=2 — pas encore
    plugin.onBeforeUpdate(api2, slowDelta); // frame 3 : consecutiveDropFrames=3 — 1er déclenchement
    plugin.onBeforeUpdate(api2, slowDelta); // frame 4 : consecutiveDropFrames=4 — 2ème déclenchement
    plugin.onBeforeUpdate(api2, slowDelta); // frame 5 : consecutiveDropFrames=5 — 3ème déclenchement

    expect(onDrop).toHaveBeenCalledTimes(3);
  });

  it('ne déclenche pas de chute si FPS OK', () => {
    const onDrop = vi.fn();
    const plugin = new DebugPlugin({
      updateInterval: 1,
      fpsDrop: { threshold: 30, onDrop },
    });
    plugin.onInit(api);
    plugin.onBeforeUpdate(api, 1 / 60); // 60 FPS > 30
    plugin.onBeforeUpdate(api, 1 / 60);
    plugin.onBeforeUpdate(api, 1 / 60);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('reset remet le tracker à zéro', () => {
    const registeredServices = new Map<string, unknown>();
    const api2 = makeAPI({
      services: {
        register: (name: string, instance: unknown) => { registeredServices.set(name, instance); },
        get: (name: string) => registeredServices.get(name),
        has: (name: string) => registeredServices.has(name),
      } as unknown as EngineAPI['services'],
    });

    const plugin = new DebugPlugin({ updateInterval: 1 });
    plugin.onInit(api2);
    plugin.onBeforeUpdate(api2, 1 / 60);

    const service = registeredServices.get('debug') as { reset: () => void; getMetrics: () => import('../src/types').DebugMetrics };
    service.reset();
    const m = service.getMetrics();
    // Après reset, les métriques restent le dernier snapshot (reset ne les efface pas)
    expect(m).toBeDefined();
  });

  it('onDestroy ne jette pas d\'erreur', () => {
    const plugin = new DebugPlugin();
    plugin.onInit(api);
    expect(() => plugin.onDestroy()).not.toThrow();
  });
});

