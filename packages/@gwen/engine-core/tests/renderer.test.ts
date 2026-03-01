/**
 * Canvas2DRenderer tests
 *
 * Uses a mock canvas/context to test rendering behavior headlessly.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Canvas2DRenderer } from '../src/renderer';
import type { SpriteComponent, TransformComponent } from '../src/renderer';
import { EntityManager, ComponentRegistry, QueryEngine } from '../src/ecs';
import { createEngineAPI } from '../src/api';
import type { EngineAPI } from '../src/types';

// ── Canvas mock ──────────────────────────────────────────────────────────

function makeCtxMock() {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    drawImage: vi.fn(),
  };
}

function makeCanvasMock(width = 800, height = 600) {
  const ctx = makeCtxMock();
  const canvas = {
    width,
    height,
    style: { width: '', height: '' },
    getContext: vi.fn(() => ctx),
    id: 'mock-canvas',
  } as unknown as HTMLCanvasElement;
  return { canvas, ctx };
}

function makeAPI(): EngineAPI {
  return createEngineAPI(
    new EntityManager(100),
    new ComponentRegistry(),
    new QueryEngine(),
  );
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('Canvas2DRenderer', () => {
  let api: EngineAPI;

  beforeEach(() => {
    api = makeAPI();
  });

  // ── Initialization ────────────────────────────────────────────────────

  describe('onInit', () => {
    it('should initialize with canvas element', () => {
      const { canvas } = makeCanvasMock();
      const renderer = new Canvas2DRenderer({ canvas, pixelRatio: 1 });
      expect(() => renderer.onInit(api)).not.toThrow();
    });

    it('should throw if canvas element is not found in DOM', () => {
      // Simulate missing DOM element by mocking getElementById
      const origGetById = (globalThis as any).document?.getElementById;
      (globalThis as any).document = {
        getElementById: () => null,
      };
      const renderer = new Canvas2DRenderer({ canvas: 'non-existent', pixelRatio: 1 });
      expect(() => renderer.onInit(api)).toThrow('not found');
      // Restore
      if (origGetById !== undefined) {
        (globalThis as any).document.getElementById = origGetById;
      }
    });

    it('should have name "Canvas2DRenderer"', () => {
      const renderer = new Canvas2DRenderer({ canvas: 'x', pixelRatio: 1 });
      expect(renderer.name).toBe('Canvas2DRenderer');
    });
  });

  // ── Rendering ─────────────────────────────────────────────────────────

  describe('onRender', () => {
    let renderer: Canvas2DRenderer;
    let ctx: ReturnType<typeof makeCtxMock>;

    beforeEach(() => {
      const { canvas, ctx: c } = makeCanvasMock();
      ctx = c;
      renderer = new Canvas2DRenderer({ canvas, background: '#111', pixelRatio: 1 });
      renderer.onInit(api);
    });

    it('should clear canvas with background color', () => {
      renderer.onRender(api);
      expect(ctx.fillRect).toHaveBeenCalled();
    });

    it('should not throw with no entities', () => {
      expect(() => renderer.onRender(api)).not.toThrow();
    });

    it('should draw entity with transform but no sprite (white dot)', () => {
      const e = api.createEntity();
      api.addComponent<TransformComponent>(e, 'transform', { x: 100, y: 100 });
      renderer.onRender(api);
      expect(ctx.fillRect).toHaveBeenCalled();
    });

    it('should draw rect sprite', () => {
      const e = api.createEntity();
      api.addComponent<TransformComponent>(e, 'transform', { x: 50, y: 50 });
      api.addComponent<SpriteComponent>(e, 'sprite', {
        shape: 'rect',
        width: 32,
        height: 32,
        color: '#ff0000',
      });
      renderer.onRender(api);
      expect(ctx.fillRect).toHaveBeenCalled();
    });

    it('should draw circle sprite', () => {
      const e = api.createEntity();
      api.addComponent<TransformComponent>(e, 'transform', { x: 200, y: 200 });
      api.addComponent<SpriteComponent>(e, 'sprite', {
        shape: 'circle',
        width: 20,
        color: '#00ff00',
      });
      renderer.onRender(api);
      expect(ctx.beginPath).toHaveBeenCalled();
      expect(ctx.arc).toHaveBeenCalled();
    });

    it('should skip invisible sprites', () => {
      const e = api.createEntity();
      api.addComponent<TransformComponent>(e, 'transform', { x: 0, y: 0 });
      api.addComponent<SpriteComponent>(e, 'sprite', {
        shape: 'rect', width: 10, height: 10, visible: false,
      });
      renderer.onRender(api);
      // fillRect called only once for background clear
      expect(ctx.fillRect).toHaveBeenCalledTimes(1);
    });

    it('should apply transform (translate/rotate/scale)', () => {
      const e = api.createEntity();
      api.addComponent<TransformComponent>(e, 'transform', {
        x: 100, y: 200, rotation: Math.PI / 4, scaleX: 2, scaleY: 2,
      });
      renderer.onRender(api);
      expect(ctx.translate).toHaveBeenCalledWith(expect.any(Number), expect.any(Number));
      expect(ctx.rotate).toHaveBeenCalled();
      expect(ctx.scale).toHaveBeenCalled();
    });

    it('should ignore entity without transform', () => {
      const e = api.createEntity();
      api.addComponent<SpriteComponent>(e, 'sprite', { shape: 'rect', width: 10, height: 10 });
      // entity has 'sprite' but no 'transform', so query(['transform']) won't return it
      expect(() => renderer.onRender(api)).not.toThrow();
    });
  });

  // ── Camera ─────────────────────────────────────────────────────────────

  describe('Camera', () => {
    let renderer: Canvas2DRenderer;

    beforeEach(() => {
      const { canvas } = makeCanvasMock();
      renderer = new Canvas2DRenderer({ canvas, pixelRatio: 1 });
      renderer.onInit(api);
    });

    it('should have default camera at origin', () => {
      const cam = renderer.getCamera();
      expect(cam.x).toBe(0);
      expect(cam.y).toBe(0);
      expect(cam.zoom).toBe(1);
    });

    it('should update camera', () => {
      renderer.setCamera({ x: 100, y: 50, zoom: 2 });
      const cam = renderer.getCamera();
      expect(cam.x).toBe(100);
      expect(cam.y).toBe(50);
      expect(cam.zoom).toBe(2);
    });

    it('should follow target with lerp=1 (instant snap)', () => {
      renderer.followTarget(300, 200, 1);
      const cam = renderer.getCamera();
      expect(cam.x).toBe(300);
      expect(cam.y).toBe(200);
    });

    it('should partially follow target with lerp < 1', () => {
      renderer.setCamera({ x: 0, y: 0 });
      renderer.followTarget(100, 100, 0.5);
      const cam = renderer.getCamera();
      expect(cam.x).toBe(50);
      expect(cam.y).toBe(50);
    });
  });

  // ── Resize ─────────────────────────────────────────────────────────────

  describe('resize()', () => {
    it('should update canvas dimensions', () => {
      const { canvas } = makeCanvasMock();
      const renderer = new Canvas2DRenderer({ canvas, pixelRatio: 1 });
      renderer.onInit(api);
      renderer.resize(1920, 1080);
      expect(canvas.width).toBe(1920);
      expect(canvas.height).toBe(1080);
    });
  });

  // ── Destroy ────────────────────────────────────────────────────────────

  describe('onDestroy', () => {
    it('should not throw on destroy', () => {
      const { canvas } = makeCanvasMock();
      const renderer = new Canvas2DRenderer({ canvas, pixelRatio: 1 });
      renderer.onInit(api);
      expect(() => renderer.onDestroy()).not.toThrow();
    });
  });
});
