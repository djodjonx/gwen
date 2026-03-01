/**
 * Canvas2DRenderer — TsPlugin that draws entities to an HTML Canvas
 *
 * Implements TsPlugin — participates in the game loop via PluginManager.
 * Reads entities with a 'sprite' component each frame and draws them.
 *
 * Usage:
 * ```typescript
 * const renderer = new Canvas2DRenderer({ canvasId: 'game-canvas' });
 * engine.registerSystem(renderer);
 * ```
 *
 * Required component: 'transform' + optionally 'sprite'.
 */

import type { TsPlugin, EngineAPI, EntityId } from './types';

// ============= Sprite Component Schema =============

export interface SpriteComponent {
  /** Shape to draw */
  shape: 'rect' | 'circle' | 'image';
  /** Width / diameter */
  width: number;
  /** Height (rect only — defaults to width if omitted) */
  height?: number;
  /** Fill color (CSS string, e.g. '#ff0000' or 'rgba(255,0,0,0.5)') */
  color?: string;
  /** Stroke color */
  strokeColor?: string;
  /** Stroke width */
  strokeWidth?: number;
  /** Image source URL (shape='image') */
  src?: string;
  /** Loaded HTMLImageElement (managed internally) */
  _image?: HTMLImageElement;
  /** Z-order (higher = drawn on top) */
  zOrder?: number;
  /** Whether to draw */
  visible?: boolean;
}

export interface TransformComponent {
  x: number;
  y: number;
  rotation?: number;    // radians
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
  /** Canvas element ID or the element itself */
  canvas: string | HTMLCanvasElement;
  /** Background clear color (CSS) — defaults to '#000000' */
  background?: string;
  /** Pixel ratio for HiDPI screens — defaults to devicePixelRatio */
  pixelRatio?: number;
}

// ============= Canvas2DRenderer =============

export class Canvas2DRenderer implements TsPlugin {
  readonly name = 'Canvas2DRenderer';

  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private config: Required<Canvas2DRendererConfig>;
  private camera: Camera = { x: 0, y: 0, zoom: 1 };
  private imageCache = new Map<string, HTMLImageElement>();

  constructor(config: Canvas2DRendererConfig) {
    this.config = {
      background: '#000000',
      pixelRatio: typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1,
      ...config,
    };
  }

  onInit(api: EngineAPI): void {
    // Resolve canvas
    if (typeof this.config.canvas === 'string') {
      const el = document.getElementById(this.config.canvas);
      if (!el || !(el instanceof HTMLCanvasElement)) {
        throw new Error(`[Canvas2DRenderer] Canvas element '${this.config.canvas}' not found.`);
      }
      this.canvas = el;
    } else {
      this.canvas = this.config.canvas;
    }

    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('[Canvas2DRenderer] Could not get 2D context.');
    }
    this.ctx = ctx;

    // HiDPI scaling
    this.applyPixelRatio();
  }

  onRender(api: EngineAPI): void {
    const { width, height } = this.canvas;
    const ctx = this.ctx;

    // 1. Clear
    ctx.fillStyle = this.config.background;
    ctx.fillRect(0, 0, width, height);

    // 2. Apply camera transform
    ctx.save();
    ctx.translate(-this.camera.x * this.camera.zoom, -this.camera.y * this.camera.zoom);
    ctx.scale(this.camera.zoom, this.camera.zoom);

    // 3. Collect entities with transform
    const entities = api.query(['transform']);

    // Sort by zOrder (lower zOrder drawn first)
    const sorted = entities.slice().sort((a, b) => {
      const sa = api.getComponent<SpriteComponent>(a, 'sprite');
      const sb = api.getComponent<SpriteComponent>(b, 'sprite');
      return (sa?.zOrder ?? 0) - (sb?.zOrder ?? 0);
    });

    // 4. Draw each entity
    for (const id of sorted) {
      const transform = api.getComponent<TransformComponent>(id, 'transform');
      if (!transform) continue;

      const sprite = api.getComponent<SpriteComponent>(id, 'sprite');
      if (sprite?.visible === false) continue;

      this.drawEntity(ctx, id, transform, sprite, api);
    }

    ctx.restore();
  }

  onDestroy(): void {
    this.imageCache.clear();
  }

  // ── Camera control ─────────────────────────────────────────────────────

  setCamera(camera: Partial<Camera>): void {
    this.camera = { ...this.camera, ...camera };
  }

  getCamera(): Camera {
    return { ...this.camera };
  }

  /** Move camera to follow a target position smoothly. */
  followTarget(targetX: number, targetY: number, lerp = 1): void {
    this.camera.x += (targetX - this.camera.x) * lerp;
    this.camera.y += (targetY - this.camera.y) * lerp;
  }

  // ── Canvas utilities ───────────────────────────────────────────────────

  get width(): number { return this.canvas.width; }
  get height(): number { return this.canvas.height; }

  resize(width: number, height: number): void {
    this.canvas.width = width * this.config.pixelRatio;
    this.canvas.height = height * this.config.pixelRatio;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.applyPixelRatio();
  }

  // ── Private drawing ────────────────────────────────────────────────────

  private drawEntity(
    ctx: CanvasRenderingContext2D,
    _id: EntityId,
    transform: TransformComponent,
    sprite: SpriteComponent | undefined,
    _api: EngineAPI,
  ): void {
    ctx.save();

    // Apply transform
    ctx.translate(transform.x, transform.y);
    if (transform.rotation) ctx.rotate(transform.rotation);
    if (transform.scaleX !== undefined || transform.scaleY !== undefined) {
      ctx.scale(transform.scaleX ?? 1, transform.scaleY ?? 1);
    }

    if (!sprite) {
      // Default: small white dot
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

        case 'circle': {
          ctx.beginPath();
          ctx.arc(0, 0, w / 2, 0, Math.PI * 2);
          if (sprite.color) ctx.fill();
          if (sprite.strokeColor) ctx.stroke();
          break;
        }

        case 'image': {
          const img = this.getOrLoadImage(sprite);
          if (img && img.complete) {
            ctx.drawImage(img, -w / 2, -h / 2, w, h);
          } else {
            // Placeholder while loading
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

    if (this.imageCache.has(sprite.src)) {
      return this.imageCache.get(sprite.src)!;
    }

    // Cache the sprite's _image reference for re-use
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
    if (this.config.pixelRatio !== 1 && this.ctx) {
      this.ctx.scale(this.config.pixelRatio, this.config.pixelRatio);
    }
  }
}
