/**
 * @file runtime.integration.test.ts
 * @description
 * Tests d'intégration du runtime sprite-anim.
 *
 * Testent le runtime complet (`SpriteAnimRuntime`) de bout en bout :
 * - Lifecycle (attach/detach/has/clear)
 * - Simulation (tick, loop, one-shot, chain, speed, pause/resume/stop)
 * - Contrôleur (setParam, setTrigger, setState, resetTrigger)
 * - Culling (setCulled/isCulled)
 * - getState (snapshot, identité référentielle, cache)
 * - draw (mock canvas, cullRect, flipX)
 * - DI (events sink, imageLoader, logger)
 * - Pool (attach → detach → reattach)
 */

import type { EntityId } from '@gwenengine/core';
import { describe, expect, it, vi } from 'vitest';
import { SpriteAnimRuntime } from '../src/runtime';
import type { SpriteAnimImageLoader } from '../src/runtime';
import type { SpriteAnimUIExtension } from '../src/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const BASE_EXT: SpriteAnimUIExtension = {
  atlas: '/sprites/hero.png',
  frame: { width: 32, height: 32, columns: 8 },
  clips: {
    idle: { row: 0, from: 0, to: 3, fps: 8, loop: true },
    run: { row: 1, from: 0, to: 5, fps: 12, loop: true },
    shoot: { row: 2, from: 0, to: 2, fps: 18, loop: false, next: 'idle' },
  },
  initial: 'idle',
  controller: {
    initial: 'idle',
    parameters: {
      moving: { type: 'bool', default: false },
      shoot: { type: 'trigger' },
    },
    states: {
      idle: { clip: 'idle' },
      run: { clip: 'run' },
      shoot: { clip: 'shoot' },
    },
    transitions: [
      {
        from: 'idle',
        to: 'run',
        priority: 10,
        conditions: [{ param: 'moving', op: '==', value: true }],
      },
      {
        from: 'run',
        to: 'idle',
        priority: 20,
        conditions: [{ param: 'moving', op: '==', value: false }],
      },
      { from: '*', to: 'shoot', priority: 1, conditions: [{ param: 'shoot' }] },
      { from: 'shoot', to: 'idle', hasExitTime: true, exitTime: 0.95 },
    ],
  },
};

function id(n: number): EntityId {
  return BigInt(n) as EntityId;
}

/** Crée un mock canvas minimaliste avec `drawImage` espionnable. */
function mockCtx() {
  const drawImage = vi.fn();
  return {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    drawImage,
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
}

/** Crée un ImageLoader qui simule une image chargée immédiatement. */
function mockImageLoader(): SpriteAnimImageLoader {
  return {
    createImage() {
      let srcValue = '';
      const img = {
        onload: null as (() => void) | null,
        onerror: null as (() => void) | null,
        width: 256,
        height: 256,
      };
      // déclenche onload de façon synchrone dès que src est assigné
      Object.defineProperty(img, 'src', {
        set(val: string) {
          srcValue = val;
          if (typeof this.onload === 'function') this.onload();
        },
        get() {
          return srcValue;
        },
      });
      return img as unknown as HTMLImageElement;
    },
  };
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

describe('lifecycle', () => {
  it('attach/has/detach/has', () => {
    const rt = new SpriteAnimRuntime();
    rt.attach('Hero', id(1), BASE_EXT);
    expect(rt.has(id(1))).toBe(true);
    rt.detach(id(1));
    expect(rt.has(id(1))).toBe(false);
  });

  it('has retourne false pour entite non attachee', () => {
    const rt = new SpriteAnimRuntime();
    expect(rt.has(id(99))).toBe(false);
  });

  it('clear vide toutes les instances', () => {
    const rt = new SpriteAnimRuntime();
    rt.attach('Hero', id(1), BASE_EXT);
    rt.attach('Hero', id(2), BASE_EXT);
    rt.clear();
    expect(rt.has(id(1))).toBe(false);
    expect(rt.has(id(2))).toBe(false);
  });

  it('reattach après detach fonctionne', () => {
    const rt = new SpriteAnimRuntime();
    rt.attach('Hero', id(1), BASE_EXT);
    rt.detach(id(1));
    rt.attach('Hero', id(1), BASE_EXT);
    expect(rt.has(id(1))).toBe(true);
    expect(rt.getState(id(1))?.clip).toBe('idle');
  });
});

// ─── Simulation ───────────────────────────────────────────────────────────────

describe('simulation', () => {
  it('tick avance la frame', () => {
    const rt = new SpriteAnimRuntime();
    rt.attach('Hero', id(1), BASE_EXT);
    rt.tick(1 / 8); // 1 frame à 8fps
    expect(rt.getState(id(1))?.frameCursor).toBe(1);
  });

  it('ignore deltaTime negatif ou zero', () => {
    const rt = new SpriteAnimRuntime();
    rt.attach('Hero', id(1), BASE_EXT);
    rt.tick(-1);
    rt.tick(0);
    expect(rt.getState(id(1))?.frameCursor).toBe(0);
  });

  it('pause/resume', () => {
    const rt = new SpriteAnimRuntime();
    rt.attach('Hero', id(1), BASE_EXT);
    rt.pause(id(1));
    rt.tick(1);
    expect(rt.getState(id(1))?.paused).toBe(true);
    expect(rt.getState(id(1))?.frameCursor).toBe(0);
    rt.resume(id(1));
    rt.tick(1 / 8);
    expect(rt.getState(id(1))?.frameCursor).toBeGreaterThan(0);
  });

  it('stop remet a l etat initial et pause', () => {
    const rt = new SpriteAnimRuntime();
    rt.attach('Hero', id(1), BASE_EXT);
    rt.setParam(id(1), 'moving', true);
    rt.tick(0.5);
    rt.stop(id(1));
    const s = rt.getState(id(1));
    expect(s?.paused).toBe(true);
    expect(s?.state).toBe('idle');
  });

  it('setSpeed multiplie la vitesse d avance', () => {
    const rt = new SpriteAnimRuntime();
    rt.attach('Hero', id(1), BASE_EXT);
    rt.setSpeed(id(1), 2);
    rt.tick(1 / 8); // 1 frame à 8fps × 2 = ~2 frames
    expect(rt.getState(id(1))?.frameCursor).toBeGreaterThanOrEqual(1);
  });

  it('maxFrameAdvancesPerEntity plafonne les avances', () => {
    const rt = new SpriteAnimRuntime({}, { maxFrameAdvancesPerEntity: 1 });
    rt.attach('Hero', id(1), BASE_EXT);
    rt.tick(10);
    expect(rt.getState(id(1))?.frameCursor).toBeLessThanOrEqual(1);
  });
});

// ─── Contrôleur ───────────────────────────────────────────────────────────────

describe('controleur', () => {
  it('setParam + tick → transition bool', () => {
    const rt = new SpriteAnimRuntime();
    rt.attach('Hero', id(1), BASE_EXT);
    rt.setParam(id(1), 'moving', true);
    rt.tick(1 / 8);
    expect(rt.getState(id(1))?.state).toBe('run');
  });

  it('setTrigger → transition puis consommation', () => {
    const rt = new SpriteAnimRuntime();
    rt.attach('Hero', id(1), BASE_EXT);
    rt.setTrigger(id(1), 'shoot');
    rt.tick(1 / 8);
    expect(rt.getState(id(1))?.state).toBe('shoot');
    expect(rt.getParam(id(1), 'shoot')).toBe(false);
  });

  it('setState force un etat immediatement', () => {
    const rt = new SpriteAnimRuntime();
    rt.attach('Hero', id(1), BASE_EXT);
    rt.setState(id(1), 'run');
    expect(rt.getState(id(1))?.state).toBe('run');
  });

  it('resetTrigger annule un trigger en attente', () => {
    const rt = new SpriteAnimRuntime();
    rt.attach('Hero', id(1), BASE_EXT);
    rt.setTrigger(id(1), 'shoot');
    rt.resetTrigger(id(1), 'shoot');
    rt.tick(1 / 8);
    expect(rt.getState(id(1))?.state).toBe('idle'); // pas transité
  });

  it('play force un clip direct', () => {
    const rt = new SpriteAnimRuntime();
    rt.attach('Hero', id(1), BASE_EXT);
    rt.play(id(1), 'run', { interrupt: true });
    expect(rt.getState(id(1))?.clip).toBe('run');
  });

  it('getParam retourne la valeur courante', () => {
    const rt = new SpriteAnimRuntime();
    rt.attach('Hero', id(1), BASE_EXT);
    rt.setParam(id(1), 'moving', true);
    expect(rt.getParam(id(1), 'moving')).toBe(true);
  });

  it('getParam retourne undefined pour parametre inconnu', () => {
    const rt = new SpriteAnimRuntime();
    rt.attach('Hero', id(1), BASE_EXT);
    expect(rt.getParam(id(1), 'unknown')).toBeUndefined();
  });
});

// ─── Culling ──────────────────────────────────────────────────────────────────

describe('culling', () => {
  it('setCulled skippe le tick', () => {
    const rt = new SpriteAnimRuntime();
    rt.attach('Hero', id(1), BASE_EXT);
    rt.setCulled(id(1), true);
    expect(rt.isCulled(id(1))).toBe(true);
    const before = rt.getState(id(1))?.frameCursor;
    rt.tick(10);
    expect(rt.getState(id(1))?.frameCursor).toBe(before);
  });

  it('desactive le culling reprend le tick', () => {
    const rt = new SpriteAnimRuntime();
    rt.attach('Hero', id(1), BASE_EXT);
    rt.setCulled(id(1), true);
    rt.setCulled(id(1), false);
    expect(rt.isCulled(id(1))).toBe(false);
    rt.tick(1 / 8);
    expect(rt.getState(id(1))?.frameCursor).toBeGreaterThan(0);
  });
});

// ─── getState / snapshot cache ────────────────────────────────────────────────

describe('getState', () => {
  it('retourne null si entite non attachee', () => {
    const rt = new SpriteAnimRuntime();
    expect(rt.getState(id(99))).toBeNull();
  });

  it('retourne un snapshot apres attach', () => {
    const rt = new SpriteAnimRuntime();
    rt.attach('Hero', id(1), BASE_EXT);
    const s = rt.getState(id(1));
    expect(s?.clip).toBe('idle');
    expect(s?.paused).toBe(false);
  });

  it('retourne la meme reference si aucune mutation', () => {
    const rt = new SpriteAnimRuntime();
    rt.attach('Hero', id(1), BASE_EXT);
    const s1 = rt.getState(id(1));
    const s2 = rt.getState(id(1));
    expect(s1).toBe(s2);
  });

  it('retourne une nouvelle reference apres mutation', () => {
    const rt = new SpriteAnimRuntime();
    rt.attach('Hero', id(1), BASE_EXT);
    const s1 = rt.getState(id(1));
    rt.tick(1 / 8); // mutation
    const s2 = rt.getState(id(1));
    expect(s1).not.toBe(s2);
  });
});

// ─── setVisible ───────────────────────────────────────────────────────────────

describe('setVisible', () => {
  it('setVisible false → getState.visible false', () => {
    const rt = new SpriteAnimRuntime();
    rt.attach('Hero', id(1), BASE_EXT);
    rt.setVisible(id(1), false);
    expect(rt.getState(id(1))?.visible).toBe(false);
  });

  it('entite invisible non dessinee', () => {
    const rt = new SpriteAnimRuntime({ imageLoader: mockImageLoader() });
    const ctx = mockCtx();
    rt.attach('Hero', id(1), BASE_EXT);
    rt.setVisible(id(1), false);
    rt.tick(1 / 8);
    const drawn = rt.draw(ctx, id(1), 50, 50);
    expect(drawn).toBe(false);
    expect((ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });
});

// ─── DI : events sink ─────────────────────────────────────────────────────────

describe('DI: events', () => {
  it('emet onFrame a chaque avance de frame', () => {
    const onFrame = vi.fn();
    const rt = new SpriteAnimRuntime({ events: { onFrame } });
    rt.attach('Hero', id(1), BASE_EXT);
    rt.tick(1 / 8);
    expect(onFrame).toHaveBeenCalled();
  });

  it('emet onComplete en fin de clip one-shot', () => {
    const onComplete = vi.fn();
    const rt = new SpriteAnimRuntime({ events: { onComplete } });
    rt.attach('Hero', id(1), BASE_EXT);
    rt.play(id(1), 'shoot');
    rt.tick(1);
    expect(onComplete).toHaveBeenCalled();
  });

  it('emet onTransition lors d une transition de controleur', () => {
    const onTransition = vi.fn();
    const rt = new SpriteAnimRuntime({ events: { onTransition } });
    rt.attach('Hero', id(1), BASE_EXT);
    rt.setParam(id(1), 'moving', true);
    rt.tick(1 / 8);
    expect(onTransition).toHaveBeenCalledWith(id(1), 'idle', 'run');
  });
});

// ─── DI : imageLoader ─────────────────────────────────────────────────────────

describe('DI: imageLoader', () => {
  it('utilise imageLoader injecte pour charger l atlas', () => {
    const loader = mockImageLoader();
    const rt = new SpriteAnimRuntime({ imageLoader: loader });
    const ctx = mockCtx();
    rt.attach('Hero', id(1), BASE_EXT);
    rt.tick(1 / 8);
    // 1er draw: déclenche le chargement, 2e draw: image disponible
    expect(rt.draw(ctx, id(1), 0, 0)).toBe(false);
    const drawn = rt.draw(ctx, id(1), 0, 0);
    expect(drawn).toBe(true);
    expect((ctx.drawImage as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it('imageLoader null → draw retourne false', () => {
    const rt = new SpriteAnimRuntime({ imageLoader: { createImage: () => null } });
    const ctx = mockCtx();
    rt.attach('Hero', id(1), BASE_EXT);
    const drawn = rt.draw(ctx, id(1), 0, 0);
    expect(drawn).toBe(false);
  });
});

// ─── DI : logger ──────────────────────────────────────────────────────────────

describe('DI: logger', () => {
  it('appelle logger.warn pour UI sans clips valides', () => {
    const warn = vi.fn();
    const rt = new SpriteAnimRuntime({ logger: { warn } });
    rt.attach('Empty', id(1), {
      atlas: '/s.png',
      frame: { width: 16, height: 16, columns: 4 },
      clips: {},
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no valid clips'));
  });
});

// ─── Pool ─────────────────────────────────────────────────────────────────────

describe('pool', () => {
  it('reattache une entite après detach depuis le pool', () => {
    const rt = new SpriteAnimRuntime({}, { maxFrameAdvancesPerEntity: 16 });
    rt.attach('Hero', id(1), BASE_EXT);
    rt.tick(0.5);
    rt.detach(id(1));
    rt.attach('Hero', id(2), BASE_EXT);
    // l'instance réutilisée doit être propre
    const s = rt.getState(id(2));
    expect(s?.frameCursor).toBe(0);
    expect(s?.paused).toBe(false);
    expect(s?.clip).toBe('idle');
  });
});
