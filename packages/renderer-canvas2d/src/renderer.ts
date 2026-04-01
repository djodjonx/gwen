/**
 * Canvas2DRenderer — draws entities to an HTML Canvas.
 *
 * Registers a `RendererService` in `api.services` as `'renderer'`.
 *
 * @example
 * ```typescript
 * import { Canvas2DRenderer } from '@gwenengine/gwen-renderer-canvas2d';
 *
 * export default defineConfig({
 *   plugins: [new Canvas2DRenderer({ canvas: 'game-canvas' })],
 * });
 * ```
 */

import { definePlugin } from '@gwenengine/kit';
import type { EntityId, GwenEngine, GwenPluginMeta } from '@gwenengine/kit';

// ── Component types ───────────────────────────────────────────────────────────

export interface SpriteComponent {
  shape: 'rect' | 'circle' | 'image';
  width: number;
  height?: number;
  color?: string;
  strokeColor?: string;
  strokeWidth?: number;
  src?: string;
  _image?: HTMLImageElement;
  zOrder?: number;
  visible?: boolean;
}

export interface TransformComponent {
  x: number;
  y: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

// ── Config ────────────────────────────────────────────────────────────────────

export interface Canvas2DRendererConfig {
  /** Canvas element ID or HTMLCanvasElement. Creates one if omitted. */
  canvas?: string | HTMLCanvasElement;
  /** CSS selector or HTMLElement to mount the created canvas into. Default: document.body */
  container?: string | HTMLElement;
  /** Canvas CSS width in pixels. Default: 480. Ignored if canvas is provided. */
  width?: number;
  /** Canvas CSS height in pixels. Default: 640. Ignored if canvas is provided. */
  height?: number;
  /** Background clear color. Default: '#000000' */
  background?: string;
  /** Device pixel ratio. Default: window.devicePixelRatio. Pass 1 to disable HiDPI. */
  pixelRatio?: number;
  /**
   * If `true`, skip auto clear+draw in `onRender()`.
   * Use when a custom RenderSystem drives rendering. Default: false.
   */
  manualRender?: boolean;
}

// ── RendererService ───────────────────────────────────────────────────────────

/**
 * Service exposed by Canvas2DRenderer via `api.services.get('renderer')`.
 */
export interface RendererService {
  /** The underlying HTMLCanvasElement. */
  readonly canvas: HTMLCanvasElement;
  /** The 2D rendering context. */
  readonly ctx: CanvasRenderingContext2D;
  /** Canvas pixel width (includes pixel ratio). */
  readonly width: number;
  /** Canvas pixel height (includes pixel ratio). */
  readonly height: number;
  /** Logical width in CSS pixels. */
  readonly logicalWidth: number;
  /** Logical height in CSS pixels. */
  readonly logicalHeight: number;

  /** Set or partially update the camera state. */
  setCamera(camera: Partial<Camera>): void;
  /** Get a copy of the current camera state. */
  getCamera(): Camera;
  /** Smooth camera follow — `lerp = 1` snaps instantly. */
  followTarget(targetX: number, targetY: number, lerp?: number): void;
  /** Resize the canvas (logical pixels). */
  resize(width: number, height: number): void;
}

// ── Canvas2DRenderer ──────────────────────────────────────────────────────────

export const pluginMeta: GwenPluginMeta = {
  serviceTypes: {
    renderer: { from: '@gwenengine/gwen-renderer-canvas2d', exportName: 'Canvas2DRendererService' },
  },
};

export const Canvas2DRenderer = definePlugin((config: Canvas2DRendererConfig = {}) => {
  const pixelRatio =
    config.pixelRatio ?? (typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1);
  const background = config.background ?? '#000000';
  const manualRender = config.manualRender ?? false;

  let _canvas!: HTMLCanvasElement;
  let _ctx!: CanvasRenderingContext2D;
  let camera: Camera = { x: 0, y: 0, zoom: 1 };
  const imageCache = new Map<string, HTMLImageElement>();
  /** Stored engine reference — set in setup(), used in onRender(). */
  let _engine: GwenEngine | null = null;

  // ── Helpers ──────────────────────────────────────────────────────────

  function applyPixelRatio(): void {
    if (pixelRatio !== 1 && _ctx) _ctx.scale(pixelRatio, pixelRatio);
  }

  function resize(width: number, height: number): void {
    _canvas.width = width * pixelRatio;
    _canvas.height = height * pixelRatio;
    _canvas.style.width = `${width}px`;
    _canvas.style.height = `${height}px`;
    applyPixelRatio();
  }

  function getOrLoadImage(sprite: SpriteComponent): HTMLImageElement | undefined {
    if (!sprite.src) return undefined;
    if (imageCache.has(sprite.src)) return imageCache.get(sprite.src)!;
    if (sprite._image) {
      imageCache.set(sprite.src, sprite._image);
      return sprite._image;
    }
    const img = new Image();
    img.src = sprite.src;
    sprite._image = img;
    imageCache.set(sprite.src, img);
    return img;
  }

  function drawEntity(
    ctx: CanvasRenderingContext2D,
    _id: EntityId,
    transform: TransformComponent,
    sprite: SpriteComponent | undefined,
  ): void {
    ctx.save();
    ctx.translate(transform.x, transform.y);
    if (transform.rotation) ctx.rotate(transform.rotation);
    if (transform.scaleX !== undefined || transform.scaleY !== undefined) {
      ctx.scale(transform.scaleX ?? 1, transform.scaleY ?? 1);
    }

    if (!sprite) {
      ctx.fillStyle = 'white';
      ctx.fillRect(-4, -4, 8, 8);
    } else {
      const w = sprite.width;
      const h = sprite.height ?? w;
      if (sprite.color) ctx.fillStyle = sprite.color;
      if (sprite.strokeColor) {
        ctx.strokeStyle = sprite.strokeColor;
        ctx.lineWidth = sprite.strokeWidth ?? 1;
      }
      switch (sprite.shape) {
        case 'rect':
          if (sprite.color) ctx.fillRect(-w / 2, -h / 2, w, h);
          if (sprite.strokeColor) ctx.strokeRect(-w / 2, -h / 2, w, h);
          break;
        case 'circle':
          ctx.beginPath();
          ctx.arc(0, 0, w / 2, 0, Math.PI * 2);
          if (sprite.color) ctx.fill();
          if (sprite.strokeColor) ctx.stroke();
          break;
        case 'image': {
          const img = getOrLoadImage(sprite);
          if (img?.complete) ctx.drawImage(img, -w / 2, -h / 2, w, h);
          else {
            ctx.fillStyle = '#444';
            ctx.fillRect(-w / 2, -h / 2, w, h);
          }
          break;
        }
      }
    }
    ctx.restore();
  }

  const service: RendererService = {
    get canvas() {
      return _canvas;
    },
    get ctx() {
      return _ctx;
    },
    get width() {
      return _canvas.width;
    },
    get height() {
      return _canvas.height;
    },
    get logicalWidth() {
      return _canvas.width / pixelRatio;
    },
    get logicalHeight() {
      return _canvas.height / pixelRatio;
    },
    setCamera(c) {
      camera = { ...camera, ...c };
    },
    getCamera() {
      return { ...camera };
    },
    followTarget(tx, ty, lerp = 1) {
      camera.x += (tx - camera.x) * lerp;
      camera.y += (ty - camera.y) * lerp;
    },
    resize,
  };

  return {
    name: 'Canvas2DRenderer',
    meta: pluginMeta,

    setup(engine: GwenEngine): void {
      _engine = engine;
      if (typeof config.canvas === 'string') {
        const el = document.getElementById(config.canvas);
        if (!el || el.tagName.toLowerCase() !== 'canvas') {
          throw new Error(`[Canvas2DRenderer] Canvas '${config.canvas}' not found.`);
        }
        _canvas = el as HTMLCanvasElement;
      } else if (config.canvas && 'getContext' in config.canvas) {
        _canvas = config.canvas as HTMLCanvasElement;
      } else {
        const containerEl =
          typeof config.container === 'string'
            ? (document.querySelector(config.container) ?? document.body)
            : (config.container ?? document.body);
        _canvas = document.createElement('canvas');
        _canvas.id = 'gwen-canvas';
        resize(config.width ?? 480, config.height ?? 640);
        (containerEl as HTMLElement).appendChild(_canvas);
      }

      const ctx = _canvas.getContext('2d');
      if (!ctx) throw new Error('[Canvas2DRenderer] Could not get 2D context.');
      _ctx = ctx;
      applyPixelRatio();

      (engine as any).provide('renderer', service);
    },

    onRender(): void {
      if (manualRender || !_engine) return;

      const { width, height } = _canvas;
      _ctx.fillStyle = background;
      _ctx.fillRect(0, 0, width, height);

      _ctx.save();
      _ctx.translate(-camera.x * camera.zoom, -camera.y * camera.zoom);
      _ctx.scale(camera.zoom, camera.zoom);

      const getComp = (_engine as any).getComponent as (id: EntityId, name: string) => unknown;

      const entities = [..._engine.createLiveQuery(['transform'])] as EntityId[];
      const sorted = entities.slice().sort((a: EntityId, b: EntityId) => {
        const sa = getComp(a, 'sprite') as SpriteComponent | undefined;
        const sb = getComp(b, 'sprite') as SpriteComponent | undefined;
        return (sa?.zOrder ?? 0) - (sb?.zOrder ?? 0);
      });

      for (const id of sorted) {
        const transform = getComp(id, 'transform') as TransformComponent | undefined;
        if (!transform) continue;
        const sprite = getComp(id, 'sprite') as SpriteComponent | undefined;
        if (sprite?.visible === false) continue;
        drawEntity(_ctx, id, transform, sprite);
      }

      _ctx.restore();
    },

    teardown(): void {
      imageCache.clear();
      _engine = null;
    },
  };
});
