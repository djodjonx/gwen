/**
 * @file Stateless Canvas2D shape-drawing utilities for `@gwenjs/renderer-canvas2d`.
 *
 * All helpers in {@link ShapeRenderer} are pure functions — they accept a
 * `CanvasRenderingContext2D` and an options object, produce side effects on
 * the canvas, and return nothing.  They can be used in any plugin lifecycle
 * hook without instantiating a full `Canvas2DRenderer`.
 *
 * @example
 * ```typescript
 * import { ShapeRenderer } from '@gwenjs/renderer-canvas2d';
 *
 * // Inside a plugin's onRender hook:
 * ShapeRenderer.rect(ctx, { x: 100, y: 100, width: 50, height: 50, color: 'red' });
 * ShapeRenderer.circle(ctx, { x: 200, y: 200, radius: 25, color: 'blue' });
 * ```
 */

/**
 * Options for drawing a rectangle on a Canvas2D context.
 *
 * All positional coordinates refer to the **center** of the rectangle —
 * the renderer translates to `(x, y)` before drawing so that rotation is
 * applied around the center.
 *
 * @example
 * ```typescript
 * const opts: RectOptions = {
 *   x: 100, y: 150, width: 80, height: 40,
 *   color: '#3399ff', strokeColor: '#ffffff', strokeWidth: 2,
 *   rotation: Math.PI / 6, alpha: 0.9,
 * };
 * ```
 *
 * @since 1.0.0
 */
export interface RectOptions {
  /** Center X coordinate in canvas pixels. */
  x: number;
  /** Center Y coordinate in canvas pixels. */
  y: number;
  /** Rectangle width in canvas pixels. */
  width: number;
  /** Rectangle height in canvas pixels. */
  height: number;
  /** Fill color (any CSS color string). Omit to skip fill. */
  color?: string;
  /** Stroke color (any CSS color string). Omit to skip stroke. */
  strokeColor?: string;
  /** Stroke line width in pixels. @default 1 */
  strokeWidth?: number;
  /** Rotation in radians applied around the rect center. @default 0 */
  rotation?: number;
  /** Global opacity in the range `[0, 1]`. @default 1 */
  alpha?: number;
}

/**
 * Options for drawing a circle on a Canvas2D context.
 *
 * @example
 * ```typescript
 * const opts: CircleOptions = {
 *   x: 200, y: 200, radius: 30,
 *   color: '#ff6600', strokeColor: '#ffffff', strokeWidth: 1,
 *   alpha: 0.75,
 * };
 * ```
 *
 * @since 1.0.0
 */
export interface CircleOptions {
  /** Center X coordinate in canvas pixels. */
  x: number;
  /** Center Y coordinate in canvas pixels. */
  y: number;
  /** Circle radius in canvas pixels. */
  radius: number;
  /** Fill color (any CSS color string). Omit to skip fill. */
  color?: string;
  /** Stroke color (any CSS color string). Omit to skip stroke. */
  strokeColor?: string;
  /** Stroke line width in pixels. @default 1 */
  strokeWidth?: number;
  /** Global opacity in the range `[0, 1]`. @default 1 */
  alpha?: number;
}

/**
 * Options for drawing a line segment on a Canvas2D context.
 *
 * @example
 * ```typescript
 * const opts: LineOptions = {
 *   x1: 0, y1: 0, x2: 100, y2: 100,
 *   color: '#00ff00', width: 2, alpha: 0.8,
 * };
 * ```
 *
 * @since 1.0.0
 */
export interface LineOptions {
  /** X coordinate of the start point. */
  x1: number;
  /** Y coordinate of the start point. */
  y1: number;
  /** X coordinate of the end point. */
  x2: number;
  /** Y coordinate of the end point. */
  y2: number;
  /** Stroke color (any CSS color string). @default '#ffffff' */
  color?: string;
  /** Line width in pixels. @default 1 */
  width?: number;
  /** Global opacity in the range `[0, 1]`. @default 1 */
  alpha?: number;
}

/**
 * Options for drawing text on a Canvas2D context.
 *
 * @example
 * ```typescript
 * const opts: TextOptions = {
 *   x: 400, y: 30, text: 'Score: 0',
 *   color: '#ffffff', font: 'bold 20px sans-serif',
 *   align: 'center', baseline: 'top',
 *   shadowBlur: 6, shadowColor: '#000000',
 * };
 * ```
 *
 * @since 1.0.0
 */
export interface TextOptions {
  /** X coordinate of the text anchor. */
  x: number;
  /** Y coordinate of the text anchor. */
  y: number;
  /** The string to render. */
  text: string;
  /** Fill color (any CSS color string). @default '#ffffff' */
  color?: string;
  /** CSS font shorthand, e.g. `'bold 16px sans-serif'`. @default '16px sans-serif' */
  font?: string;
  /** Horizontal text alignment. @default 'left' */
  align?: CanvasTextAlign;
  /** Vertical text baseline. @default 'top' */
  baseline?: CanvasTextBaseline;
  /** Global opacity in the range `[0, 1]`. @default 1 */
  alpha?: number;
  /** Shadow blur radius in pixels. `0` disables the shadow. @default 0 */
  shadowBlur?: number;
  /** Shadow color (any CSS color string). Falls back to `color` when omitted. */
  shadowColor?: string;
}

/**
 * Collection of stateless Canvas2D shape-drawing helpers.
 *
 * Every method saves and restores canvas context state so there are no
 * unintended side effects outside the shape being drawn.  Methods can be
 * called freely in any order from plugin lifecycle hooks.
 *
 * @example
 * ```typescript
 * import { ShapeRenderer } from '@gwenjs/renderer-canvas2d';
 *
 * // Inside a plugin's onRender hook:
 * ShapeRenderer.rect(ctx, { x: 100, y: 100, width: 50, height: 50, color: '#ff0000' });
 * ShapeRenderer.text(ctx, { x: 8, y: 8, text: 'Hello', color: '#ffffff' });
 * ```
 *
 * @since 1.0.0
 */
export const ShapeRenderer = {
  /**
   * Draw a filled and/or stroked rectangle, optionally rotated around its center.
   *
   * Saves and restores the canvas context state — no side effects outside the
   * painted shape.
   *
   * @param ctx - Canvas 2D rendering context to draw onto.
   * @param opts - Rectangle position, dimensions, colors, rotation, and opacity.
   * @returns `void`
   *
   * @example
   * ```typescript
   * ShapeRenderer.rect(ctx, {
   *   x: 100, y: 100, width: 50, height: 50,
   *   color: '#FF0000', strokeColor: '#000000', strokeWidth: 2,
   *   rotation: Math.PI / 4, alpha: 0.8,
   * });
   * ```
   *
   * @since 1.0.0
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
   * Draw a filled and/or stroked circle.
   *
   * Saves and restores the canvas context state — no side effects outside the
   * painted shape.
   *
   * @param ctx - Canvas 2D rendering context to draw onto.
   * @param opts - Circle center, radius, colors, and opacity.
   * @returns `void`
   *
   * @example
   * ```typescript
   * ShapeRenderer.circle(ctx, {
   *   x: 200, y: 200, radius: 30,
   *   color: '#0088ff', strokeColor: '#ffffff', strokeWidth: 1,
   *   alpha: 0.9,
   * });
   * ```
   *
   * @since 1.0.0
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
   * Draw a line segment between two points.
   *
   * Saves and restores the canvas context state — no side effects outside the
   * painted shape.
   *
   * @param ctx - Canvas 2D rendering context to draw onto.
   * @param opts - Start point `(x1, y1)`, end point `(x2, y2)`, color, width,
   *   and opacity.
   * @returns `void`
   *
   * @example
   * ```typescript
   * ShapeRenderer.line(ctx, {
   *   x1: 0, y1: 0, x2: 320, y2: 240,
   *   color: '#00ff00', width: 2,
   * });
   * ```
   *
   * @since 1.0.0
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
   * Draw text with optional shadow, custom font, alignment, and opacity.
   *
   * Saves and restores the canvas context state — no side effects outside the
   * painted text.
   *
   * @param ctx - Canvas 2D rendering context to draw onto.
   * @param opts - Text content, anchor position, color, font descriptor, shadow,
   *   alignment, and opacity.
   * @returns `void`
   *
   * @example
   * ```typescript
   * ShapeRenderer.text(ctx, {
   *   x: 400, y: 200, text: 'Score: 9999',
   *   color: '#FFFFFF', font: 'bold 24px Arial',
   *   align: 'center', baseline: 'middle',
   *   shadowBlur: 10, shadowColor: '#000000',
   * });
   * ```
   *
   * @since 1.0.0
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
   * Clear a rectangular region of the canvas to fully transparent pixels.
   *
   * Useful for partial redraws when only a sub-region of the canvas changes
   * each frame.
   *
   * @param ctx - Canvas 2D rendering context to clear.
   * @param x - Left edge of the region in canvas pixels.
   * @param y - Top edge of the region in canvas pixels.
   * @param w - Width of the region in canvas pixels.
   * @param h - Height of the region in canvas pixels.
   * @returns `void`
   *
   * @example
   * ```typescript
   * // Clear only the HUD area at the top of a 480×640 canvas
   * ShapeRenderer.clear(ctx, 0, 0, 480, 60);
   * ```
   *
   * @since 1.0.0
   */
  clear(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.clearRect(x, y, w, h);
  },

  /**
   * Fill the entire canvas with a solid background color.
   *
   * Call this at the start of each render pass to clear the previous frame
   * before drawing new content.
   *
   * @param ctx - Canvas 2D rendering context to fill.
   * @param color - Any CSS color string (e.g. `'#000000'`, `'rgba(0,0,0,1)'`).
   * @returns `void`
   *
   * @example
   * ```typescript
   * // Paint a deep-navy background before drawing game objects
   * ShapeRenderer.background(ctx, '#0a0a1a');
   * ```
   *
   * @since 1.0.0
   */
  background(ctx: CanvasRenderingContext2D, color: string): void {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  },
};
