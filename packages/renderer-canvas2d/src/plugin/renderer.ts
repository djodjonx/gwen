/**
 * @file Canvas2D renderer plugin for `@gwenjs/renderer-canvas2d`.
 *
 * Registers a {@link RendererService} in the engine's provide/inject registry
 * under the key `'renderer'` so downstream plugins and systems can call
 * `engine.inject('renderer')` or {@link useCanvas2D} to access the canvas.
 */

import { definePlugin } from '@gwenjs/kit';
import type { EntityId, GwenEngine } from '@gwenjs/kit';
// Side-effect: augments GwenProvides with 'renderer' key, enabling typed provide/inject.
import '../augment.js';

// ── Internal type helpers ─────────────────────────────────────────────────────

/**
 * Internal interface for string-named component and query access.
 *
 * The renderer is component-agnostic — it queries `'transform'` and `'sprite'`
 * components by string name at runtime. The public `GwenEngine` type accepts
 * typed `ComponentDefinition` descriptors; the runtime engine also supports
 * string names, which this plugin relies on for flexibility.
 *
 * @internal Do not use this type outside of this module.
 */
interface GwenEngineStringComponentAccess {
  /**
   * Query all entities that have every component in the given name array.
   * @param names - Component names to match.
   * @returns Iterable of `{ id: EntityId }` accessor objects.
   */
  createLiveQuery(names: string[]): Iterable<{ id: EntityId }>;
  /**
   * Retrieve component data by string name.
   * @param id   - Entity to read from.
   * @param name - Component name.
   * @returns Component data or `undefined`.
   */
  getComponent(id: EntityId, name: string): unknown;
}

// ── Component types ───────────────────────────────────────────────────────────

/**
 * Visual representation component attached to an entity.
 *
 * The renderer reads this component each frame to decide how to paint the
 * entity.  At minimum you must specify `shape` and `width`; all other fields
 * are optional and fall back to sensible defaults.
 *
 * @example
 * ```typescript
 * engine.addComponent(playerId, 'sprite', {
 *   shape: 'rect',
 *   width: 32, height: 48,
 *   color: '#4488ff',
 *   zOrder: 1,
 * } satisfies SpriteComponent);
 * ```
 *
 * @since 1.0.0
 */
export interface SpriteComponent {
  /** Primitive shape to render. Use `'image'` to draw a bitmap loaded from `src`. */
  shape: 'rect' | 'circle' | 'image';
  /** Width of the sprite in canvas pixels. Also used as the diameter for `'circle'`. */
  width: number;
  /** Height of the sprite in canvas pixels. Defaults to `width` when omitted. */
  height?: number;
  /** Fill color (any CSS color string). Omit to skip fill. */
  color?: string;
  /** Stroke color (any CSS color string). Omit to skip stroke. */
  strokeColor?: string;
  /** Stroke line width in pixels. @default 1 */
  strokeWidth?: number;
  /** URL of the image asset for `shape: 'image'`. */
  src?: string;
  /** Cached `HTMLImageElement` — populated automatically on first render. */
  _image?: HTMLImageElement;
  /** Paint order (lower values are drawn first, underneath higher values). @default 0 */
  zOrder?: number;
  /** When `false` the entity is skipped entirely during rendering. @default true */
  visible?: boolean;
}

/**
 * Position and orientation component for an entity in 2D world space.
 *
 * The renderer applies `translate → rotate → scale` transforms in that order
 * before painting the associated {@link SpriteComponent}.
 *
 * @example
 * ```typescript
 * engine.addComponent(enemyId, 'transform', {
 *   x: 240, y: 320, rotation: Math.PI / 2, scaleX: 1.5,
 * } satisfies TransformComponent);
 * ```
 *
 * @since 1.0.0
 */
export interface TransformComponent {
  /** World X coordinate (canvas pixels, positive right). */
  x: number;
  /** World Y coordinate (canvas pixels, positive down). */
  y: number;
  /** Rotation in radians, applied around the entity origin. @default 0 */
  rotation?: number;
  /** Horizontal scale factor. @default 1 */
  scaleX?: number;
  /** Vertical scale factor. @default 1 */
  scaleY?: number;
}

/**
 * Camera state used to transform world coordinates into screen space.
 *
 * The renderer applies `translate(-x * zoom, -y * zoom)` then `scale(zoom, zoom)`
 * before drawing entities, so a camera positioned at `(100, 50)` shifts all
 * content 100 px left and 50 px up relative to the canvas origin.
 *
 * @example
 * ```typescript
 * const renderer = engine.inject('renderer');
 * renderer.setCamera({ x: player.x - 240, y: player.y - 320, zoom: 1.5 });
 * ```
 *
 * @since 1.0.0
 */
export interface Camera {
  /** Camera X position in world pixels. @default 0 */
  x: number;
  /** Camera Y position in world pixels. @default 0 */
  y: number;
  /** Uniform zoom factor (1 = no zoom). @default 1 */
  zoom: number;
}

// ── Config ────────────────────────────────────────────────────────────────────

/**
 * Configuration options for {@link Canvas2DRenderer}.
 *
 * All fields are optional.  When `canvas` is omitted the renderer creates a
 * new `<canvas>` element and appends it to `container` (or `document.body`).
 *
 * @example
 * ```typescript
 * const renderer = Canvas2DRenderer({
 *   canvas: 'game-canvas',
 *   background: '#1a1a2e',
 *   pixelRatio: 1,
 * });
 * ```
 *
 * @since 1.0.0
 */
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
 * Public API surface exposed by {@link Canvas2DRenderer} via the engine's
 * provide/inject registry under the key `'renderer'`.
 *
 * Obtain a reference with `engine.inject('renderer')` or the
 * {@link useCanvas2D} composable.
 *
 * @example
 * ```typescript
 * const renderer: RendererService = engine.inject('renderer');
 * renderer.setCamera({ x: 100, y: 50, zoom: 2 });
 * ```
 *
 * @since 1.0.0
 */
export interface RendererService {
  /** The underlying `HTMLCanvasElement` managed by the renderer. */
  readonly canvas: HTMLCanvasElement;
  /** The `CanvasRenderingContext2D` attached to {@link canvas}. */
  readonly ctx: CanvasRenderingContext2D;
  /** Physical pixel width of the canvas (logical width × pixel ratio). */
  readonly width: number;
  /** Physical pixel height of the canvas (logical height × pixel ratio). */
  readonly height: number;
  /** Logical width in CSS pixels, independent of device pixel ratio. */
  readonly logicalWidth: number;
  /** Logical height in CSS pixels, independent of device pixel ratio. */
  readonly logicalHeight: number;

  /**
   * Set or partially update the camera state.
   *
   * Only the supplied fields are overwritten; unspecified fields keep their
   * current values.
   *
   * @param camera - Partial camera state to merge into the current camera.
   * @returns `void`
   *
   * @example
   * ```typescript
   * renderer.setCamera({ zoom: 2 }); // only changes zoom, x/y unchanged
   * ```
   *
   * @since 1.0.0
   */
  setCamera(camera: Partial<Camera>): void;

  /**
   * Return a shallow copy of the current camera state.
   *
   * @returns A new {@link Camera} object — mutations do not affect the
   *   renderer's internal state.
   *
   * @example
   * ```typescript
   * const cam = renderer.getCamera();
   * console.log(cam.zoom); // e.g. 1
   * ```
   *
   * @since 1.0.0
   */
  getCamera(): Camera;

  /**
   * Smoothly move the camera towards a target position using linear
   * interpolation.
   *
   * Call this once per frame inside an `onUpdate` hook to achieve a
   * smooth-follow effect.  Pass `lerp = 1` to snap the camera instantly.
   *
   * @param targetX - World X coordinate to follow.
   * @param targetY - World Y coordinate to follow.
   * @param lerp - Interpolation factor in the range `(0, 1]`. @default 1
   * @returns `void`
   *
   * @example
   * ```typescript
   * // Smooth follow at 10 % per frame
   * renderer.followTarget(player.x, player.y, 0.1);
   * ```
   *
   * @since 1.0.0
   */
  followTarget(targetX: number, targetY: number, lerp?: number): void;

  /**
   * Resize the canvas to new logical pixel dimensions.
   *
   * The underlying canvas element's physical size is scaled by the configured
   * pixel ratio, and CSS size properties are updated accordingly.
   *
   * @param width - New logical width in CSS pixels.
   * @param height - New logical height in CSS pixels.
   * @returns `void`
   *
   * @example
   * ```typescript
   * window.addEventListener('resize', () => {
   *   renderer.resize(window.innerWidth, window.innerHeight);
   * });
   * ```
   *
   * @since 1.0.0
   */
  resize(width: number, height: number): void;
}

// ── Canvas2DRenderer ──────────────────────────────────────────────────────────

/**
 * Canvas2D renderer plugin — draws entities with `transform` and `sprite`
 * components to an HTML `<canvas>` element each frame.
 *
 * On `setup` the plugin:
 * 1. Resolves or creates the `<canvas>` element.
 * 2. Obtains a `CanvasRenderingContext2D`.
 * 3. Registers a {@link RendererService} in the engine under the key
 *    `'renderer'` so it can be injected by other plugins.
 *
 * On `onRender` (when `manualRender` is `false`) the plugin:
 * 1. Clears the canvas with the configured background color.
 * 2. Applies camera transform.
 * 3. Queries all entities with a `transform` component, sorts by `zOrder`, and
 *    draws each one using its `sprite` component (or a 8×8 white square if no
 *    sprite is attached).
 *
 * @param config - Optional renderer configuration. All fields have defaults.
 * @returns A GWEN plugin object ready to pass to `defineConfig({ plugins })`.
 *
 * @example
 * ```typescript
 * import { Canvas2DRenderer } from '@gwenjs/renderer-canvas2d';
 * import { defineConfig } from '@gwenjs/kit';
 *
 * export default defineConfig({
 *   plugins: [Canvas2DRenderer({ canvas: 'game-canvas', background: '#0a0a1a' })],
 * });
 * ```
 *
 * @since 1.0.0
 */
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
    name: '@gwenjs/renderer-canvas2d',

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

      engine.provide('renderer', service);
    },

    onRender(): void {
      if (manualRender || !_engine) return;

      const { width, height } = _canvas;
      _ctx.fillStyle = background;
      _ctx.fillRect(0, 0, width, height);

      _ctx.save();
      _ctx.translate(-camera.x * camera.zoom, -camera.y * camera.zoom);
      _ctx.scale(camera.zoom, camera.zoom);

      // Access the runtime string-based query/component API. The renderer is
      // component-agnostic and works with component names as strings.
      const stringEngine = _engine as unknown as GwenEngineStringComponentAccess;
      const getComp = stringEngine.getComponent.bind(stringEngine);

      // String-based live query — renderer doesn't own typed ComponentDef objects.
      const liveQuery = stringEngine.createLiveQuery(['transform']);
      const entities = [...liveQuery];
      const sorted = entities.slice().sort((a, b) => {
        const sa = getComp(a.id, 'sprite') as SpriteComponent | undefined;
        const sb = getComp(b.id, 'sprite') as SpriteComponent | undefined;
        return (sa?.zOrder ?? 0) - (sb?.zOrder ?? 0);
      });

      for (const { id } of sorted) {
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
