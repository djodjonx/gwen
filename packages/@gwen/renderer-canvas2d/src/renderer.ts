/**
 * Canvas2DRenderer — TsPlugin that draws entities to an HTML Canvas
 *
 * Part of the @gwen/renderer-canvas2d package.
 * Implements TsPlugin from @gwen/engine-core.
 *
 * @example
 * ```typescript
 * import { Engine } from '@gwen/engine-core';
 * import { Canvas2DRenderer } from '@gwen/renderer-canvas2d';
 *
 * const engine = new Engine({ maxEntities: 5000 });
 * engine.registerSystem(new Canvas2DRenderer({ canvas: 'game-canvas' }));
 * engine.start();
 * ```
 */

import type { EngineAPI, EntityId } from '@gwen/engine-core';
import type { GwenPlugin } from '@gwen/engine-core';

// ============= Component Types =============

export interface SpriteComponent {
  shape: 'rect' | 'circle' | 'image';
  width: number;
  /** Height (defaults to width if omitted — useful for circles) */
  height?: number;
  color?: string;
  strokeColor?: string;
  strokeWidth?: number;
  /** Image source URL (shape='image') */
  src?: string;
  /** Loaded HTMLImageElement (managed internally) */
  _image?: HTMLImageElement;
  /** Drawing order — higher = drawn on top */
  zOrder?: number;
  visible?: boolean;
}

export interface TransformComponent {
  x: number;
  y: number;
  rotation?: number;   // radians
  scaleX?: number;
  scaleY?: number;
}

// ============= Camera =============

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

// ============= Renderer Config =============

export interface Canvas2DRendererConfig {
  /** Canvas element ID (string) or the HTMLCanvasElement directly */
  canvas: string | HTMLCanvasElement;
  /** Background clear color (CSS) — defaults to '#000000' */
  background?: string;
  /** Pixel ratio for HiDPI — defaults to window.devicePixelRatio */
  pixelRatio?: number;
}

// ============= Canvas2DRenderer =============

export class Canvas2DRenderer implements GwenPlugin<'Canvas2DRenderer', { renderer: Canvas2DRenderer }> {
  readonly name = 'Canvas2DRenderer' as const;

  /**
   * Déclare le service 'renderer' injecté dans api.services.
   * Utilisé par TypeScript pour l'inférence — jamais lu à runtime.
   */
  readonly provides = { renderer: {} as Canvas2DRenderer };

  private _canvas!: HTMLCanvasElement;
  private _ctx!: CanvasRenderingContext2D;
  private config: Required<Canvas2DRendererConfig>;

  /** Canvas element — disponible après onInit() */
  get canvas(): HTMLCanvasElement { return this._canvas; }
  /** 2D rendering context — disponible après onInit() */
  get ctx(): CanvasRenderingContext2D { return this._ctx; }
  private camera: Camera = { x: 0, y: 0, zoom: 1 };
  private imageCache = new Map<string, HTMLImageElement>();

  constructor(config: Canvas2DRendererConfig) {
    this.config = {
      background: '#000000',
      pixelRatio: typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1,
      ...config,
    };
  }

  onInit(_api: EngineAPI): void {
    if (typeof this.config.canvas === 'string') {
      const el = document.getElementById(this.config.canvas);
      if (!el || !(el instanceof HTMLCanvasElement)) {
        throw new Error(`[Canvas2DRenderer] Canvas element '${this.config.canvas}' not found.`);
      }
      this._canvas = el;
    } else {
      this._canvas = this.config.canvas;
    }

    const ctx = this._canvas.getContext('2d');
    if (!ctx) throw new Error('[Canvas2DRenderer] Could not get 2D rendering context.');
    this._ctx = ctx;

    this.applyPixelRatio();
  }

  onRender(api: EngineAPI): void {
    const { width, height } = this._canvas;
    const ctx = this._ctx;

    // 1. Clear
    ctx.fillStyle = this.config.background;
    ctx.fillRect(0, 0, width, height);

    // 2. Camera transform
    ctx.save();
    ctx.translate(-this.camera.x * this.camera.zoom, -this.camera.y * this.camera.zoom);
    ctx.scale(this.camera.zoom, this.camera.zoom);

    // 3. Query entities with a transform and sort by zOrder
    const entities = api.query(['transform']);
    const sorted = entities.slice().sort((a, b) => {
      const sa = api.getComponent<SpriteComponent>(a, 'sprite');
      const sb = api.getComponent<SpriteComponent>(b, 'sprite');
      return (sa?.zOrder ?? 0) - (sb?.zOrder ?? 0);
    });

    // 4. Draw
    for (const id of sorted) {
      const transform = api.getComponent<TransformComponent>(id, 'transform');
      if (!transform) continue;

      const sprite = api.getComponent<SpriteComponent>(id, 'sprite');
      if (sprite?.visible === false) continue;

      this.drawEntity(ctx, id, transform, sprite);
    }

    ctx.restore();
  }

  onDestroy(): void {
    this.imageCache.clear();
  }

  // ── Camera ─────────────────────────────────────────────────────────────

  setCamera(camera: Partial<Camera>): void {
    this.camera = { ...this.camera, ...camera };
  }

  getCamera(): Camera {
    return { ...this.camera };
  }

  /** Smooth camera follow with lerp factor (1 = instant snap). */
  followTarget(targetX: number, targetY: number, lerp = 1): void {
    this.camera.x += (targetX - this.camera.x) * lerp;
    this.camera.y += (targetY - this.camera.y) * lerp;
  }

  // ── Canvas utilities ───────────────────────────────────────────────────

  get width(): number { return this._canvas.width; }
  get height(): number { return this._canvas.height; }

  resize(width: number, height: number): void {
    this._canvas.width = width * this.config.pixelRatio;
    this._canvas.height = height * this.config.pixelRatio;
    this._canvas.style.width = `${width}px`;
    this._canvas.style.height = `${height}px`;
    this.applyPixelRatio();
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private drawEntity(
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
          const img = this.getOrLoadImage(sprite);
          if (img?.complete) {
            ctx.drawImage(img, -w / 2, -h / 2, w, h);
          } else {
            ctx.fillStyle = '#444';
            ctx.fillRect(-w / 2, -h / 2, w, h);
          }
          break;
        }
      }
    }

    ctx.restore();
  }

  private getOrLoadImage(sprite: SpriteComponent): HTMLImageElement | undefined {
    if (!sprite.src) return undefined;
    if (this.imageCache.has(sprite.src)) return this.imageCache.get(sprite.src)!;
    if (sprite._image) {
      this.imageCache.set(sprite.src, sprite._image);
      return sprite._image;
    }
    const img = new Image();
    img.src = sprite.src;
    sprite._image = img;
    this.imageCache.set(sprite.src, img);
    return img;
  }

  private applyPixelRatio(): void {
    if (this.config.pixelRatio !== 1 && this._ctx) {
      this._ctx.scale(this.config.pixelRatio, this.config.pixelRatio);
    }
  }
}
