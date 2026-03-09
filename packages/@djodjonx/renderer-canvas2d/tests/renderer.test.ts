/**
 * Canvas2DRenderer tests
 * Uses a mock canvas/context to test rendering behavior headlessly.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Canvas2DRenderer } from '../src/renderer';
import { ShapeRenderer } from '../src/shapes';
import type { SpriteComponent, TransformComponent, RendererService } from '../src/renderer';
import {
  EntityManager,
  ComponentRegistry,
  QueryEngine,
  createEngineAPI,
} from '@djodjonx/gwen-engine-core';
import type { EngineAPI } from '@djodjonx/gwen-engine-core';

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
  return createEngineAPI(new EntityManager(100), new ComponentRegistry(), new QueryEngine());
}

function getRendererService(api: EngineAPI): RendererService {
  return api.services.get('renderer') as RendererService;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('Canvas2DRenderer', () => {
  let api: EngineAPI;

  beforeEach(() => {
    api = makeAPI();
  });

  describe('onInit', () => {
    it('should initialize with canvas element', () => {
      const { canvas } = makeCanvasMock();
      const renderer = new Canvas2DRenderer({ canvas, pixelRatio: 1 });
      expect(() => renderer.onInit(api)).not.toThrow();
    });

    it('should throw if canvas element is not found in DOM', () => {
      const origGetById = (globalThis as any).document?.getElementById;
      (globalThis as any).document = { getElementById: () => null };
      const renderer = new Canvas2DRenderer({ canvas: 'non-existent', pixelRatio: 1 });
      expect(() => renderer.onInit(api)).toThrow('not found');
      if (origGetById !== undefined) {
        (globalThis as any).document.getElementById = origGetById;
      }
    });

    it('should have name "Canvas2DRenderer"', () => {
      const renderer = new Canvas2DRenderer({ canvas: 'x', pixelRatio: 1 });
      expect(renderer.name).toBe('Canvas2DRenderer');
    });
  });

  describe('onRender', () => {
    let renderer: InstanceType<typeof Canvas2DRenderer>;
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
        shape: 'rect',
        width: 10,
        height: 10,
        visible: false,
      });
      renderer.onRender(api);
      expect(ctx.fillRect).toHaveBeenCalledTimes(1); // only background
    });

    it('should apply transform (translate/rotate/scale)', () => {
      const e = api.createEntity();
      api.addComponent<TransformComponent>(e, 'transform', {
        x: 100,
        y: 200,
        rotation: Math.PI / 4,
        scaleX: 2,
        scaleY: 2,
      });
      renderer.onRender(api);
      expect(ctx.translate).toHaveBeenCalled();
      expect(ctx.rotate).toHaveBeenCalled();
      expect(ctx.scale).toHaveBeenCalled();
    });

    it('should ignore entity without transform', () => {
      const e = api.createEntity();
      api.addComponent<SpriteComponent>(e, 'sprite', { shape: 'rect', width: 10, height: 10 });
      expect(() => renderer.onRender(api)).not.toThrow();
    });
  });

  describe('Camera', () => {
    let renderer: InstanceType<typeof Canvas2DRenderer>;

    beforeEach(() => {
      const { canvas } = makeCanvasMock();
      renderer = new Canvas2DRenderer({ canvas, pixelRatio: 1 });
      renderer.onInit(api);
    });

    it('should have default camera at origin', () => {
      const cam = getRendererService(api).getCamera();
      expect(cam).toEqual({ x: 0, y: 0, zoom: 1 });
    });

    it('should update camera with setCamera()', () => {
      const svc = getRendererService(api);
      svc.setCamera({ x: 100, y: 50, zoom: 2 });
      expect(svc.getCamera()).toEqual({ x: 100, y: 50, zoom: 2 });
    });

    it('should snap to target with lerp=1', () => {
      const svc = getRendererService(api);
      svc.followTarget(300, 200, 1);
      expect(svc.getCamera()).toMatchObject({ x: 300, y: 200 });
    });

    it('should partially follow target with lerp < 1', () => {
      const svc = getRendererService(api);
      svc.setCamera({ x: 0, y: 0 });
      svc.followTarget(100, 100, 0.5);
      expect(svc.getCamera()).toMatchObject({ x: 50, y: 50 });
    });
  });

  describe('resize()', () => {
    it('should update canvas dimensions', () => {
      const { canvas } = makeCanvasMock();
      const renderer = new Canvas2DRenderer({ canvas, pixelRatio: 1 });
      renderer.onInit(api);
      getRendererService(api).resize(1920, 1080);
      expect(canvas.width).toBe(1920);
      expect(canvas.height).toBe(1080);
    });
  });

  describe('onDestroy', () => {
    it('should not throw on destroy', () => {
      const { canvas } = makeCanvasMock();
      const renderer = new Canvas2DRenderer({ canvas, pixelRatio: 1 });
      renderer.onInit(api);
      expect(() => renderer.onDestroy()).not.toThrow();
    });
  });
});

// ── ShapeRenderer ─────────────────────────────────────────────────────────────

function makeCtx2() {
  return {
    fillStyle: '' as string,
    strokeStyle: '' as string,
    lineWidth: 1,
    globalAlpha: 1,
    shadowBlur: 0,
    shadowColor: '',
    font: '',
    textAlign: 'left' as CanvasTextAlign,
    textBaseline: 'top' as CanvasTextBaseline,
    canvas: { width: 800, height: 600 } as HTMLCanvasElement,
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    fillText: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe('ShapeRenderer', () => {
  describe('rect()', () => {
    it('fills a rect when color provided', () => {
      const ctx = makeCtx2();
      ShapeRenderer.rect(ctx, { x: 10, y: 20, width: 50, height: 30, color: 'red' });
      expect(ctx.fillRect).toHaveBeenCalledWith(-25, -15, 50, 30);
    });

    it('strokes a rect when strokeColor provided', () => {
      const ctx = makeCtx2();
      ShapeRenderer.rect(ctx, {
        x: 0,
        y: 0,
        width: 40,
        height: 20,
        strokeColor: 'blue',
        strokeWidth: 2,
      });
      expect(ctx.strokeRect).toHaveBeenCalledWith(-20, -10, 40, 20);
    });

    it('calls save/restore', () => {
      const ctx = makeCtx2();
      ShapeRenderer.rect(ctx, { x: 0, y: 0, width: 10, height: 10, color: 'white' });
      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
    });

    it('applies rotation', () => {
      const ctx = makeCtx2();
      ShapeRenderer.rect(ctx, { x: 0, y: 0, width: 10, height: 10, rotation: Math.PI / 4 });
      expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 4);
    });

    it('applies alpha', () => {
      const ctx = makeCtx2();
      ShapeRenderer.rect(ctx, { x: 0, y: 0, width: 10, height: 10, alpha: 0.5, color: 'red' });
      expect((ctx as any).globalAlpha).toBe(0.5);
    });
  });

  describe('circle()', () => {
    it('draws arc with correct radius', () => {
      const ctx = makeCtx2();
      ShapeRenderer.circle(ctx, { x: 50, y: 50, radius: 20, color: 'green' });
      expect(ctx.arc).toHaveBeenCalledWith(50, 50, 20, 0, Math.PI * 2);
      expect(ctx.fill).toHaveBeenCalled();
    });

    it('strokes circle when strokeColor provided', () => {
      const ctx = makeCtx2();
      ShapeRenderer.circle(ctx, { x: 0, y: 0, radius: 10, strokeColor: 'white' });
      expect(ctx.stroke).toHaveBeenCalled();
    });

    it('calls save/restore', () => {
      const ctx = makeCtx2();
      ShapeRenderer.circle(ctx, { x: 0, y: 0, radius: 5, color: 'red' });
      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
    });
  });

  describe('line()', () => {
    it('draws a line between two points', () => {
      const ctx = makeCtx2();
      ShapeRenderer.line(ctx, { x1: 0, y1: 0, x2: 100, y2: 100, color: 'yellow', width: 2 });
      expect(ctx.moveTo).toHaveBeenCalledWith(0, 0);
      expect(ctx.lineTo).toHaveBeenCalledWith(100, 100);
      expect(ctx.stroke).toHaveBeenCalled();
    });

    it('uses default color white when none specified', () => {
      const ctx = makeCtx2();
      ShapeRenderer.line(ctx, { x1: 0, y1: 0, x2: 10, y2: 10 });
      expect((ctx as any).strokeStyle).toBe('#ffffff');
    });
  });

  describe('text()', () => {
    it('calls fillText with correct arguments', () => {
      const ctx = makeCtx2();
      ShapeRenderer.text(ctx, { x: 100, y: 50, text: 'Hello', color: 'white' });
      expect(ctx.fillText).toHaveBeenCalledWith('Hello', 100, 50);
    });

    it('applies shadow when shadowBlur provided', () => {
      const ctx = makeCtx2();
      ShapeRenderer.text(ctx, { x: 0, y: 0, text: 'Hi', shadowBlur: 10, shadowColor: 'red' });
      expect((ctx as any).shadowBlur).toBe(10);
      expect((ctx as any).shadowColor).toBe('red');
    });
  });

  describe('background()', () => {
    it('fills entire canvas', () => {
      const ctx = makeCtx2();
      ShapeRenderer.background(ctx, '#111');
      expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 800, 600);
    });
  });

  describe('clear()', () => {
    it('clears specified region', () => {
      const ctx = makeCtx2();
      ShapeRenderer.clear(ctx, 10, 20, 100, 50);
      expect(ctx.clearRect).toHaveBeenCalledWith(10, 20, 100, 50);
    });
  });
});
