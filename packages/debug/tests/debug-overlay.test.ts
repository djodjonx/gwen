// @vitest-environment jsdom
/**
 * DebugOverlay + FpsTracker unit tests.
 *
 * Runs in jsdom so DOM APIs are available for overlay creation/removal tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FpsTracker } from '../src/plugin/fps-tracker';
import { DebugOverlay } from '../src/plugin/overlay';
import type { DebugMetrics } from '../src/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMetrics(overrides: Partial<DebugMetrics> = {}): DebugMetrics {
  return {
    fps: 60,
    rollingFps: 60,
    minFps: 55,
    maxFps: 65,
    jitter: 1.2,
    frameTimeMs: 16.67,
    budgetMs: 16.667,
    overBudget: false,
    frameCount: 100,
    entityCount: 42,
    memoryMB: undefined,
    isDropping: false,
    lastDropAt: 0,
    phaseMs: {
      tick: 0.1,
      plugins: 1.2,
      physics: 4.5,
      wasm: 0.2,
      update: 0.8,
      render: 3.1,
      afterTick: 0.1,
      total: 10.0,
    },
    ...overrides,
  };
}

// ── FPS tracking ─────────────────────────────────────────────────────────────

describe('DebugOverlay', () => {
  describe('FPS tracking', () => {
    it('computes rolling average FPS from frame deltas', () => {
      const tracker = new FpsTracker(4);
      // Push four 60 FPS frames
      tracker.push(1 / 60);
      tracker.push(1 / 60);
      tracker.push(1 / 60);
      tracker.push(1 / 60);
      expect(tracker.rollingFps()).toBeCloseTo(60, 0);
    });

    it('detects frame drops below threshold using minFps', () => {
      const tracker = new FpsTracker(10);
      // Simulate a drop frame (33 FPS) among normal frames
      tracker.push(1 / 60);
      tracker.push(1 / 60);
      tracker.push(1 / 30); // drop
      expect(tracker.minFps()).toBeCloseTo(30, 0);
    });

    it('resets counters after reset()', () => {
      const tracker = new FpsTracker(10);
      tracker.push(1 / 60);
      tracker.push(1 / 60);
      tracker.reset();
      expect(tracker.instantFps()).toBe(0);
      expect(tracker.rollingFps()).toBe(0);
      expect(tracker.jitter()).toBe(0);
    });
  });

  describe('DOM overlay', () => {
    let overlay: DebugOverlay;

    beforeEach(() => {
      // Clean up any leftover overlay elements between tests
      document.body.innerHTML = '';
    });

    it('creates and mounts the overlay element on the document body', () => {
      overlay = new DebugOverlay();
      const elements = document.body.querySelectorAll('div');
      expect(elements.length).toBeGreaterThanOrEqual(1);
      overlay.destroy();
    });

    it('removes the overlay element from the DOM on destroy()', () => {
      overlay = new DebugOverlay();
      const countBefore = document.body.querySelectorAll('div').length;
      overlay.destroy();
      const countAfter = document.body.querySelectorAll('div').length;
      expect(countAfter).toBe(countBefore - 1);
    });

    it('update() sets text content with FPS metrics', () => {
      overlay = new DebugOverlay();
      overlay.update(makeMetrics({ fps: 58, rollingFps: 59.5 }));
      const el = document.body.querySelector('div') as HTMLDivElement;
      expect(el.textContent).toContain('58');
      overlay.destroy();
    });

    it('changes text color to drop color when isDropping is true', () => {
      overlay = new DebugOverlay({ colorNormal: '#00ff00', colorDrop: '#ff0000' });
      overlay.update(makeMetrics({ isDropping: true }));
      const el = document.body.querySelector('div') as HTMLDivElement;
      expect(el.style.color).toBe('rgb(255, 0, 0)');
      overlay.destroy();
    });

    it('setVisible(false) hides the overlay', () => {
      overlay = new DebugOverlay();
      overlay.setVisible(false);
      const el = document.body.querySelector('div') as HTMLDivElement;
      expect(el.style.display).toBe('none');
      overlay.destroy();
    });
  });
});
