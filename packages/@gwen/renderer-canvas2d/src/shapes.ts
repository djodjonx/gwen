/**
 * ShapeRenderer — Utilitaires de dessin Canvas2D stateless
 *
 * Fonctions pures utilisables dans n'importe quel plugin de rendu
 * sans instancier un Canvas2DRenderer complet.
 *
 * @example
 * ```typescript
 * import { ShapeRenderer } from '@gwen/renderer-canvas2d';
 *
 * // Dans onRender d'un TsPlugin custom :
 * ShapeRenderer.rect(ctx, { x: 100, y: 100, width: 50, height: 50, color: 'red' });
 * ShapeRenderer.circle(ctx, { x: 200, y: 200, radius: 25, color: 'blue' });
 * ```
 */

export interface RectOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  strokeColor?: string;
  strokeWidth?: number;
  /** Rotation in radians around the rect center */
  rotation?: number;
  alpha?: number;
}

export interface CircleOptions {
  x: number;
  y: number;
  radius: number;
  color?: string;
  strokeColor?: string;
  strokeWidth?: number;
  alpha?: number;
}

export interface LineOptions {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color?: string;
  width?: number;
  alpha?: number;
}

export interface TextOptions {
  x: number;
  y: number;
  text: string;
  color?: string;
  font?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  alpha?: number;
  /** Shadow blur radius (0 = no shadow) */
  shadowBlur?: number;
  shadowColor?: string;
}

export const ShapeRenderer = {
  /**
   * Draw a filled/stroked rectangle, optionally rotated around its center.
   */
  rect(ctx: CanvasRenderingContext2D, opts: RectOptions): void {
    ctx.save();
    if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
    ctx.translate(opts.x, opts.y);
    if (opts.rotation) ctx.rotate(opts.rotation);

    const hw = opts.width / 2;
    const hh = opts.height / 2;

    if (opts.color) {
      ctx.fillStyle = opts.color;
      ctx.fillRect(-hw, -hh, opts.width, opts.height);
    }
    if (opts.strokeColor) {
      ctx.strokeStyle = opts.strokeColor;
      ctx.lineWidth = opts.strokeWidth ?? 1;
      ctx.strokeRect(-hw, -hh, opts.width, opts.height);
    }
    ctx.restore();
  },

  /**
   * Draw a filled/stroked circle.
   */
  circle(ctx: CanvasRenderingContext2D, opts: CircleOptions): void {
    ctx.save();
    if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
    ctx.beginPath();
    ctx.arc(opts.x, opts.y, opts.radius, 0, Math.PI * 2);
    if (opts.color) {
      ctx.fillStyle = opts.color;
      ctx.fill();
    }
    if (opts.strokeColor) {
      ctx.strokeStyle = opts.strokeColor;
      ctx.lineWidth = opts.strokeWidth ?? 1;
      ctx.stroke();
    }
    ctx.restore();
  },

  /**
   * Draw a line segment.
   */
  line(ctx: CanvasRenderingContext2D, opts: LineOptions): void {
    ctx.save();
    if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
    ctx.beginPath();
    ctx.moveTo(opts.x1, opts.y1);
    ctx.lineTo(opts.x2, opts.y2);
    ctx.strokeStyle = opts.color ?? '#ffffff';
    ctx.lineWidth = opts.width ?? 1;
    ctx.stroke();
    ctx.restore();
  },

  /**
   * Draw text with optional shadow.
   */
  text(ctx: CanvasRenderingContext2D, opts: TextOptions): void {
    ctx.save();
    if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
    if (opts.shadowBlur) {
      ctx.shadowBlur = opts.shadowBlur;
      ctx.shadowColor = opts.shadowColor ?? opts.color ?? '#ffffff';
    }
    ctx.fillStyle = opts.color ?? '#ffffff';
    ctx.font = opts.font ?? '16px sans-serif';
    ctx.textAlign = opts.align ?? 'left';
    ctx.textBaseline = opts.baseline ?? 'top';
    ctx.fillText(opts.text, opts.x, opts.y);
    ctx.restore();
  },

  /**
   * Clear a rectangular area (useful for partial redraws).
   */
  clear(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.clearRect(x, y, w, h);
  },

  /**
   * Fill the entire canvas with a solid color.
   */
  background(ctx: CanvasRenderingContext2D, color: string): void {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  },
};

