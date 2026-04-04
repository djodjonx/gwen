/**
 * @file runtime.ts
 * @description
 * High-performance sprite animation runtime (v0.3.6).
 *
 * This file intentionally keeps the hot path in a single module for runtime
 * performance (tick/update, transitions, draw, image cache, state cache).
 *
 * Injectable dependencies (`SpriteAnimRuntimeDeps`):
 * - `events`: animation event sink (`onFrame`, `onComplete`, `onTransition`)
 * - `imageLoader`: image factory (browser, tests, SSR fallback)
 * - `logger`: warning logger
 */

import type { EntityId } from '@gwenjs/core';
import type {
  SpriteAnimClip,
  SpriteAnimCondition,
  SpriteAnimController,
  SpriteAnimDrawOptions,
  SpriteAnimParamType,
  SpriteAnimParamValue,
  SpriteAnimPlayOptions,
  SpriteAnimState,
  SpriteAnimTickOptions,
  SpriteAnimTransition,
  SpriteAnimUIExtension,
} from '../types.js';
import { defaultImageLoader, defaultLogger } from './contracts.js';
import type {
  SpriteAnimEventSink,
  SpriteAnimImageLoader,
  SpriteAnimLogger,
  SpriteAnimRuntimeConfig,
  SpriteAnimRuntimeDeps,
} from './contracts.js';

export type {
  SpriteAnimEventSink,
  SpriteAnimImageLoader,
  SpriteAnimLogger,
  SpriteAnimRuntimeConfig,
  SpriteAnimRuntimeDeps,
};

/** Compiled clip data used by the hot path. */
interface CompiledClip {
  name: string;
  frames: number[];
  fps: number;
  loop: boolean;
  next?: string;
}

/** Compiled controller state mapped to a concrete clip and speed multiplier. */
interface CompiledControllerState {
  name: string;
  clip: string;
  speed: number;
}

/** Preprocessed transition rule evaluated by the controller state machine. */
interface CompiledTransition {
  from: string | '*';
  to: string;
  hasExitTime: boolean;
  exitTime: number;
  priority: number;
  conditions: SpriteAnimCondition[];
}

/** Compiled parameter metadata with normalized default value. */
interface CompiledParameter {
  type: SpriteAnimParamType;
  defaultValue: SpriteAnimParamValue;
}

/** Fully compiled controller with fast transition indices. */
interface CompiledController {
  initial: string;
  states: Record<string, CompiledControllerState>;
  stateByClip: Record<string, string>;
  transitionsByState: Map<string, CompiledTransition[]>;
  transitionsByWildcard: CompiledTransition[];
  parameters: Record<string, CompiledParameter>;
}

/** Image cache entry status for atlas loading lifecycle. */
interface CachedImage {
  image: HTMLImageElement | null;
  status: 'idle' | 'loading' | 'loaded' | 'error';
}

/** Compiled UI definition reused by all entities sharing the same UI/extension. */
interface CompiledDefinition {
  signature: string;
  uiName: string;
  atlas: string;
  frameWidth: number;
  frameHeight: number;
  columns?: number;
  marginX: number;
  marginY: number;
  spacingX: number;
  spacingY: number;
  anchorX: number;
  anchorY: number;
  initial: string;
  clips: Record<string, CompiledClip>;
  controller?: CompiledController;
  visible: boolean;
}

/**
 * Per-entity runtime instance state.
 * Includes state snapshot cache metadata for zero-allocation repeated reads.
 */
interface Instance {
  entityId: EntityId;
  definition: CompiledDefinition;
  state: SpriteAnimState;
  params: Record<string, SpriteAnimParamValue>;
  triggers: Record<string, boolean>;
  culled?: boolean;
  stateVersion: number;
  cachedVersion: number;
  cachedState: Readonly<SpriteAnimState> | null;
}

/** Internal immutable snapshot shape returned by `getState()`. */
interface StateSnapshot {
  clip: string;
  state: string;
  frameCursor: number;
  frameIndex: number;
  elapsed: number;
  normalizedTime: number;
  paused: boolean;
  speed: number;
  visible: boolean;
}

/**
 * Expands a clip declaration into absolute frame indices.
 * Supports explicit frame arrays and row/range declarations.
 */
function clipToFrames(clip: SpriteAnimClip, columns: number): number[] {
  if ('frames' in clip) {
    return clip.frames.filter((n) => Number.isFinite(n) && n >= 0).map((n) => Math.floor(n));
  }

  const step = clip.from <= clip.to ? 1 : -1;
  const out: number[] = [];
  for (let col = clip.from; step > 0 ? col <= clip.to : col >= clip.to; col += step) {
    out.push(clip.row * columns + col);
  }
  return out;
}

/** Resolves user-facing anchor syntax into normalized numeric coordinates. */
function resolveAnchor(anchor: SpriteAnimUIExtension['anchor']): { x: number; y: number } {
  if (!anchor || anchor === 'center') return { x: 0.5, y: 0.5 };
  if (anchor === 'top-left') return { x: 0, y: 0 };
  return { x: anchor.x, y: anchor.y };
}

/** Returns `fallback` when value is not a finite positive number. */
function clampPositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Computes a stable signature for extension-cache invalidation. */
function toSignature(extension: SpriteAnimUIExtension): string {
  return JSON.stringify(extension);
}

/**
 * Evaluates one transition condition against current instance parameters.
 * Handles trigger, boolean, integer, and float parameter types.
 */
function evaluateCondition(
  condition: SpriteAnimCondition,
  params: Record<string, SpriteAnimParamValue>,
  parameterTypes: Record<string, CompiledParameter>,
): boolean {
  const def = parameterTypes[condition.param];
  if (!def) return false;

  const left = params[condition.param];
  if (def.type === 'trigger') return Boolean(left);

  const op = condition.op ?? '==';
  const right = condition.value ?? (def.type === 'bool' ? true : 0);

  if (def.type === 'bool') {
    const l = Boolean(left);
    const r = Boolean(right);
    if (op === '==') return l === r;
    if (op === '!=') return l !== r;
    return false;
  }

  const l = Number(left);
  const r = Number(right);
  switch (op) {
    case '==':
      return l === r;
    case '!=':
      return l !== r;
    case '<':
      return l < r;
    case '<=':
      return l <= r;
    case '>':
      return l > r;
    case '>=':
      return l >= r;
    default:
      return false;
  }
}

/** Returns `true` when a draw rectangle intersects the given culling rectangle. */
function isInsideCullRect(
  x: number,
  y: number,
  width: number,
  height: number,
  cullRect: NonNullable<SpriteAnimDrawOptions['cullRect']>,
): boolean {
  return !(
    x + width < cullRect.x ||
    y + height < cullRect.y ||
    x > cullRect.x + cullRect.width ||
    y > cullRect.y + cullRect.height
  );
}

export class SpriteAnimRuntime {
  private readonly definitionsByUI = new Map<string, CompiledDefinition>();
  private readonly imagesByAtlas = new Map<string, CachedImage>();
  private readonly instances = new Map<EntityId, Instance>();

  private readonly instancePool: Instance[] = [];
  private readonly poolSize: number;
  private readonly maxFrameAdvancesPerEntity: number;

  private readonly events: SpriteAnimEventSink;
  private readonly imageLoader: SpriteAnimImageLoader;
  private readonly logger: SpriteAnimLogger;

  /**
   * Creates a new sprite animation runtime.
   *
   * @param deps Runtime dependencies (events, image loader, logger).
   * @param config Runtime configuration (frame-advance safety cap).
   */
  constructor(deps: SpriteAnimRuntimeDeps = {}, config: SpriteAnimRuntimeConfig = {}) {
    this.events = deps.events ?? {};
    this.imageLoader = deps.imageLoader ?? defaultImageLoader;
    this.logger = deps.logger ?? defaultLogger;

    this.maxFrameAdvancesPerEntity = Math.max(1, config.maxFrameAdvancesPerEntity ?? 16);
    this.poolSize = Math.max(1, Math.floor(this.maxFrameAdvancesPerEntity / 2));
  }

  /**
   * Attaches a sprite animation definition to an entity.
   * Compiles and caches UI definitions as needed.
   */
  attach(uiName: string, entityId: EntityId, extension: SpriteAnimUIExtension): void {
    const definition = this.getOrCompileDefinition(uiName, extension);
    const initialClip = definition.clips[definition.initial] ?? Object.values(definition.clips)[0];
    if (!initialClip) {
      this.logger.warn(
        `[SpriteAnim] UI '${uiName}' has no valid clips — attach skipped for entity ${String(entityId)}.`,
      );
      return;
    }

    const controllerState = definition.controller?.initial ?? definition.initial;
    const params: Record<string, SpriteAnimParamValue> = {};
    const triggers: Record<string, boolean> = {};

    if (definition.controller) {
      for (const [name, param] of Object.entries(definition.controller.parameters)) {
        params[name] = param.defaultValue;
        if (param.type === 'trigger') triggers[name] = false;
      }
    }

    const state: SpriteAnimState = {
      clip: initialClip.name,
      state: controllerState,
      frameCursor: 0,
      frameIndex: initialClip.frames[0] ?? 0,
      elapsed: 0,
      normalizedTime: 0,
      paused: false,
      speed: 1,
      visible: definition.visible,
    };

    let instance: Instance | undefined;
    if (this.instancePool.length > 0) {
      instance = this.instancePool.pop();
      if (instance) {
        instance.entityId = entityId;
        instance.definition = definition;
        instance.state = state;
        instance.params = params;
        instance.triggers = triggers;
        instance.culled = false;
        instance.stateVersion = 0;
        instance.cachedVersion = -1;
        instance.cachedState = null;
      }
    }

    if (!instance) {
      instance = {
        entityId,
        definition,
        state,
        params,
        triggers,
        stateVersion: 0,
        cachedVersion: -1,
        cachedState: null,
      };
    }

    this.instances.set(entityId, instance);
  }

  /**
   * Detaches an entity animation and recycles its instance in the pool.
   */
  detach(entityId: EntityId): void {
    const instance = this.instances.get(entityId);
    if (!instance) return;

    this.instances.delete(entityId);

    if (this.instancePool.length < this.poolSize) {
      instance.culled = false;
      instance.state.paused = true;
      instance.cachedState = null;
      this.instancePool.push(instance);
    }
  }

  /** Returns `true` if the entity currently has an attached animation instance. */
  has(entityId: EntityId): boolean {
    return this.instances.has(entityId);
  }

  /**
   * Advances all active animations by `deltaTime` (seconds).
   * Invalid or non-positive deltas are ignored.
   */
  tick(deltaTime: number, options: SpriteAnimTickOptions = {}): void {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) return;

    const maxAdvances = Math.max(
      1,
      Math.floor(options.maxFrameAdvancesPerEntity ?? this.maxFrameAdvancesPerEntity),
    );

    for (const instance of this.instances.values()) {
      const { definition, state } = instance;
      if (state.paused || instance.culled) continue;

      this.tryAutoTransition(instance);

      const clip = definition.clips[state.clip];
      if (!clip || clip.frames.length <= 0) continue;

      const stateSpeed = definition.controller?.states[state.state]?.speed ?? 1;
      const dt = deltaTime * state.speed * stateSpeed;
      if (dt <= 0) continue;

      const frameDuration = 1 / clip.fps;
      state.elapsed += dt;

      let advances = 0;
      while (state.elapsed >= frameDuration && advances < maxAdvances) {
        state.elapsed -= frameDuration;
        state.frameCursor += 1;
        advances += 1;

        if (state.frameCursor >= clip.frames.length) {
          this.events.onComplete?.(instance.entityId, clip.name, state.state);

          if (clip.loop) {
            state.frameCursor = 0;
          } else if (clip.next && definition.clips[clip.next]) {
            this.applyClip(instance, clip.next, true);
            break;
          } else {
            state.frameCursor = clip.frames.length - 1;
            state.paused = true;
            break;
          }
        }

        state.frameIndex = clip.frames[state.frameCursor] ?? state.frameIndex;
        this.events.onFrame?.(
          instance.entityId,
          state.clip,
          state.state,
          state.frameCursor,
          state.frameIndex,
        );
      }

      if (advances >= maxAdvances) {
        state.elapsed = Math.min(state.elapsed, frameDuration);
      }

      const denom = Math.max(1, clip.frames.length);
      state.normalizedTime = Math.min(
        1,
        (state.frameCursor + state.elapsed / frameDuration) / denom,
      );

      this.tryAutoTransition(instance);
      this.consumeUnusedTriggers(instance);
      this.invalidateState(instance);
    }
  }

  /**
   * Draws the current animation frame for an entity.
   * Returns `false` if not visible / not ready / culled by draw rect.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    entityId: EntityId,
    x: number,
    y: number,
    options: SpriteAnimDrawOptions = {},
  ): boolean {
    const instance = this.instances.get(entityId);
    if (!instance || !instance.state.visible) return false;

    const { definition, state } = instance;
    const image = this.getOrLoadImage(definition);
    if (!image) return false;

    const frameIndex = state.frameIndex;
    const columns =
      definition.columns ?? Math.max(1, Math.floor(image.width / definition.frameWidth));
    const col = frameIndex % columns;
    const row = Math.floor(frameIndex / columns);

    const sx = definition.marginX + col * (definition.frameWidth + definition.spacingX);
    const sy = definition.marginY + row * (definition.frameHeight + definition.spacingY);

    const drawW = options.width ?? definition.frameWidth;
    const drawH = options.height ?? definition.frameHeight;
    const anchorX = drawW * definition.anchorX;
    const anchorY = drawH * definition.anchorY;

    const dx = options.pixelSnap ? Math.round(x - anchorX) : x - anchorX;
    const dy = options.pixelSnap ? Math.round(y - anchorY) : y - anchorY;

    if (options.cullRect && !isInsideCullRect(dx, dy, drawW, drawH, options.cullRect)) {
      return false;
    }

    ctx.save();
    if (options.alpha !== undefined) ctx.globalAlpha = options.alpha;
    ctx.translate(options.pixelSnap ? Math.round(x) : x, options.pixelSnap ? Math.round(y) : y);
    if (options.rotation) ctx.rotate(options.rotation);

    const scaleX = (options.scaleX ?? 1) * (options.flipX ? -1 : 1);
    const scaleY = (options.scaleY ?? 1) * (options.flipY ? -1 : 1);
    if (scaleX !== 1 || scaleY !== 1) ctx.scale(scaleX, scaleY);

    ctx.drawImage(
      image,
      sx,
      sy,
      definition.frameWidth,
      definition.frameHeight,
      -anchorX,
      -anchorY,
      drawW,
      drawH,
    );
    ctx.restore();
    return true;
  }

  /**
   * Plays a specific clip on an entity.
   * Honors `interrupt` and `restart` options.
   */
  play(entityId: EntityId, clipName: string, options: SpriteAnimPlayOptions = {}): boolean {
    const instance = this.instances.get(entityId);
    if (!instance) return false;

    if (!options.interrupt && !instance.state.paused && instance.state.clip !== clipName) {
      return false;
    }

    return this.applyClip(instance, clipName, options.restart ?? true);
  }

  /**
   * Forces a controller state on an entity.
   * Honors `interrupt` and `restart` options.
   */
  setState(entityId: EntityId, stateName: string, options: SpriteAnimPlayOptions = {}): boolean {
    const instance = this.instances.get(entityId);
    if (!instance) return false;
    return this.applyState(instance, stateName, options.restart ?? true, options.interrupt ?? true);
  }

  /**
   * Sets a non-trigger controller parameter.
   * Returns `false` if parameter is unknown or a trigger.
   */
  setParam(entityId: EntityId, name: string, value: SpriteAnimParamValue): boolean {
    const instance = this.instances.get(entityId);
    if (!instance) return false;
    const def = instance.definition.controller?.parameters[name];
    if (!def || def.type === 'trigger') return false;

    const nextValue = def.type === 'bool' ? Boolean(value) : Number(value);
    if (instance.params[name] === nextValue) return true;

    instance.params[name] = nextValue;
    this.invalidateState(instance);
    return true;
  }

  /** Returns the current controller parameter value, if present. */
  getParam(entityId: EntityId, name: string): SpriteAnimParamValue | undefined {
    return this.instances.get(entityId)?.params[name];
  }

  /** Sets a trigger parameter to `true`. */
  setTrigger(entityId: EntityId, name: string): boolean {
    const instance = this.instances.get(entityId);
    if (!instance) return false;
    const def = instance.definition.controller?.parameters[name];
    if (!def || def.type !== 'trigger') return false;
    instance.params[name] = true;
    instance.triggers[name] = true;
    this.invalidateState(instance);
    return true;
  }

  /** Resets a trigger parameter to `false`. */
  resetTrigger(entityId: EntityId, name: string): boolean {
    const instance = this.instances.get(entityId);
    if (!instance) return false;
    const def = instance.definition.controller?.parameters[name];
    if (!def || def.type !== 'trigger') return false;
    instance.params[name] = false;
    instance.triggers[name] = false;
    this.invalidateState(instance);
    return true;
  }

  /** Pauses animation updates for an entity. */
  pause(entityId: EntityId): void {
    const instance = this.instances.get(entityId);
    if (!instance || instance.state.paused) return;
    instance.state.paused = true;
    this.invalidateState(instance);
  }

  /** Resumes animation updates for a paused entity. */
  resume(entityId: EntityId): void {
    const instance = this.instances.get(entityId);
    if (!instance || !instance.state.paused) return;
    instance.state.paused = false;
    this.invalidateState(instance);
  }

  /**
   * Stops playback and returns to initial state/clip, then pauses.
   */
  stop(entityId: EntityId): void {
    const instance = this.instances.get(entityId);
    if (!instance) return;
    this.applyState(
      instance,
      instance.definition.controller?.initial ?? instance.definition.initial,
      true,
      true,
    );
    instance.state.paused = true;
    this.invalidateState(instance);
  }

  /** Sets playback speed multiplier (`> 0`). */
  setSpeed(entityId: EntityId, speed: number): void {
    const instance = this.instances.get(entityId);
    if (!instance) return;
    const nextSpeed = clampPositive(speed, 1);
    if (instance.state.speed === nextSpeed) return;
    instance.state.speed = nextSpeed;
    this.invalidateState(instance);
  }

  /** Sets entity visibility for draw calls. */
  setVisible(entityId: EntityId, visible: boolean): void {
    const instance = this.instances.get(entityId);
    if (!instance || instance.state.visible === visible) return;
    instance.state.visible = visible;
    this.invalidateState(instance);
  }

  /**
   * Marks entity as culled/unculled.
   * Culled entities are skipped during `tick()`.
   */
  setCulled(entityId: EntityId, culled: boolean): void {
    const instance = this.instances.get(entityId);
    if (!instance || instance.culled === culled) return;
    instance.culled = culled;
    this.invalidateState(instance);
  }

  /** Returns current culling flag for an entity. */
  isCulled(entityId: EntityId): boolean {
    return this.instances.get(entityId)?.culled ?? false;
  }

  /**
   * Returns a cached readonly state snapshot.
   * Snapshot identity stays stable until next mutation.
   */
  getState(entityId: EntityId): Readonly<SpriteAnimState> | null {
    const instance = this.instances.get(entityId);
    if (!instance) return null;

    const version = instance.stateVersion;
    if (instance.cachedVersion === version && instance.cachedState) {
      return instance.cachedState;
    }

    const snapshot: StateSnapshot = {
      clip: instance.state.clip,
      state: instance.state.state,
      frameCursor: instance.state.frameCursor,
      frameIndex: instance.state.frameIndex,
      elapsed: instance.state.elapsed,
      normalizedTime: instance.state.normalizedTime,
      paused: instance.state.paused,
      speed: instance.state.speed,
      visible: instance.state.visible,
    };

    const frozen = snapshot as Readonly<SpriteAnimState>;
    instance.cachedState = frozen;
    instance.cachedVersion = version;
    return frozen;
  }

  /** Clears all runtime state (instances, pools, definition cache, image cache). */
  clear(): void {
    this.instances.clear();
    this.definitionsByUI.clear();
    this.imagesByAtlas.clear();
    this.instancePool.length = 0;
  }

  /** Increments per-instance version to invalidate cached `getState()` snapshot. */
  private invalidateState(instance: Instance): void {
    instance.stateVersion += 1;
  }

  /**
   * Retrieves a compiled definition from cache, or compiles and stores it.
   */
  private getOrCompileDefinition(
    uiName: string,
    extension: SpriteAnimUIExtension,
  ): CompiledDefinition {
    const signature = toSignature(extension);
    const cached = this.definitionsByUI.get(uiName);
    if (cached && cached.signature === signature) return cached;

    const columns = Math.max(1, Math.floor(extension.frame.columns ?? 1));
    const clips: Record<string, CompiledClip> = {};
    const defaultFps = clampPositive(extension.defaultFps ?? 12, 12);

    for (const [name, clip] of Object.entries(extension.clips)) {
      const frames = clipToFrames(clip, columns);
      if (frames.length === 0) continue;

      clips[name] = {
        name,
        frames,
        fps: clampPositive(clip.fps ?? defaultFps, defaultFps),
        loop: clip.loop ?? true,
        next: clip.next,
      };
    }

    const controller = this.compileController(extension.controller, clips, extension.initial);
    const { x: anchorX, y: anchorY } = resolveAnchor(extension.anchor);

    const definition: CompiledDefinition = {
      signature,
      uiName,
      atlas: extension.atlas,
      frameWidth: Math.max(1, Math.floor(extension.frame.width)),
      frameHeight: Math.max(1, Math.floor(extension.frame.height)),
      columns,
      marginX: extension.frame.marginX ?? 0,
      marginY: extension.frame.marginY ?? 0,
      spacingX: extension.frame.spacingX ?? 0,
      spacingY: extension.frame.spacingY ?? 0,
      anchorX,
      anchorY,
      initial:
        controller?.states[controller.initial]?.clip ??
        extension.initial ??
        Object.keys(clips)[0] ??
        'default',
      clips,
      controller,
      visible: extension.visible ?? true,
    };

    this.definitionsByUI.set(uiName, definition);
    return definition;
  }

  /**
   * Compiles controller data into transition/state indices optimized for runtime evaluation.
   */
  private compileController(
    controller: SpriteAnimController | undefined,
    clips: Record<string, CompiledClip>,
    fallbackInitial?: string,
  ): CompiledController | undefined {
    if (!controller) return undefined;

    const states: Record<string, CompiledControllerState> = {};
    for (const [name, state] of Object.entries(controller.states)) {
      if (!clips[state.clip]) continue;
      states[name] = { name, clip: state.clip, speed: clampPositive(state.speed ?? 1, 1) };
    }

    const initial = states[controller.initial]
      ? controller.initial
      : states[fallbackInitial ?? '']
        ? (fallbackInitial as string)
        : Object.keys(states)[0];

    if (!initial) return undefined;

    const parameters: Record<string, CompiledParameter> = {};
    for (const [name, p] of Object.entries(controller.parameters ?? {})) {
      const defaultValue =
        p.default !== undefined ? p.default : p.type === 'bool' || p.type === 'trigger' ? false : 0;
      parameters[name] = { type: p.type, defaultValue };
    }

    const transitions: CompiledTransition[] = (controller.transitions ?? [])
      .filter((t: SpriteAnimTransition) => Boolean(t.to && states[t.to]))
      .map((t) => ({
        from: t.from ?? '*',
        to: t.to,
        hasExitTime: t.hasExitTime ?? false,
        exitTime: Math.max(0, Math.min(1, t.exitTime ?? 1)),
        priority: Math.floor(t.priority ?? 100),
        conditions: t.conditions ?? [],
      }))
      .sort((a, b) => a.priority - b.priority);

    const transitionsByState = new Map<string, CompiledTransition[]>();
    const transitionsByWildcard: CompiledTransition[] = [];
    for (const t of transitions) {
      if (t.from === '*') {
        transitionsByWildcard.push(t);
      } else {
        const arr = transitionsByState.get(t.from) ?? [];
        arr.push(t);
        transitionsByState.set(t.from, arr);
      }
    }

    const stateByClip: Record<string, string> = {};
    for (const [stateName, stateDef] of Object.entries(states)) {
      if (!(stateDef.clip in stateByClip)) stateByClip[stateDef.clip] = stateName;
    }

    return { initial, states, stateByClip, transitionsByState, transitionsByWildcard, parameters };
  }

  /**
   * Returns a loaded atlas image or starts asynchronous loading when needed.
   * Returns `null` while loading or on load failure.
   */
  private getOrLoadImage(definition: CompiledDefinition): HTMLImageElement | null {
    const existing = this.imagesByAtlas.get(definition.atlas);
    if (existing?.status === 'loaded') return existing.image;

    if (!existing) {
      this.imagesByAtlas.set(definition.atlas, { image: null, status: 'idle' });
    }

    const resource = this.imagesByAtlas.get(definition.atlas)!;
    if (resource.status === 'loading' || resource.status === 'error') return null;

    const img = this.imageLoader.createImage();
    if (!img) {
      resource.status = 'error';
      return null;
    }

    resource.image = img;
    resource.status = 'loading';

    img.onload = () => {
      resource.status = 'loaded';
      if (!definition.columns || definition.columns <= 1) {
        definition.columns = Math.max(1, Math.floor(img.width / definition.frameWidth));
      }
    };

    img.onerror = () => {
      resource.status = 'error';
      this.logger.warn(
        `[SpriteAnim] Failed to load atlas '${definition.atlas}' for UI '${definition.uiName}'.`,
      );
    };

    img.src = definition.atlas;
    return null;
  }

  /**
   * Applies a clip to an instance and resets frame-time cursors.
   */
  private applyClip(instance: Instance, clipName: string, restart: boolean): boolean {
    const clip = instance.definition.clips[clipName];
    if (!clip) return false;
    if (!restart && instance.state.clip === clipName) return true;

    instance.state.clip = clip.name;
    instance.state.frameCursor = 0;
    instance.state.frameIndex = clip.frames[0] ?? instance.state.frameIndex;
    instance.state.elapsed = 0;
    instance.state.normalizedTime = 0;
    instance.state.paused = false;
    this.invalidateState(instance);
    return true;
  }

  /**
   * Applies a controller state (or clip fallback when no controller exists).
   */
  private applyState(
    instance: Instance,
    stateName: string,
    restart: boolean,
    interrupt: boolean,
  ): boolean {
    const controller = instance.definition.controller;
    if (!controller) {
      return this.applyClip(instance, stateName, restart);
    }

    const next = controller.states[stateName];
    if (!next) return false;
    if (!interrupt && instance.state.state !== stateName && !instance.state.paused) return false;

    const from = instance.state.state;
    instance.state.state = stateName;
    const applied = this.applyClip(instance, next.clip, restart);
    if (applied && from !== stateName) {
      this.events.onTransition?.(instance.entityId, from, stateName);
    }
    this.invalidateState(instance);
    return applied;
  }

  /**
   * Evaluates and applies automatic transitions for the current state.
   */
  private tryAutoTransition(instance: Instance): void {
    const controller = instance.definition.controller;
    if (!controller) return;

    const byState = controller.transitionsByState.get(instance.state.state);
    if (byState && this.tryTransitionList(instance, byState)) return;
    this.tryTransitionList(instance, controller.transitionsByWildcard);
  }

  /**
   * Scans a transition list in priority order and applies the first matching rule.
   */
  private tryTransitionList(
    instance: Instance,
    transitions: ReadonlyArray<CompiledTransition>,
  ): boolean {
    const controller = instance.definition.controller;
    if (!controller) return false;

    for (let i = 0; i < transitions.length; i += 1) {
      const transition = transitions[i];
      if (transition.hasExitTime && instance.state.normalizedTime < transition.exitTime) continue;

      let ok = true;
      for (let c = 0; c < transition.conditions.length; c += 1) {
        if (!evaluateCondition(transition.conditions[c], instance.params, controller.parameters)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      const previous = instance.state.state;
      if (!this.applyState(instance, transition.to, true, true)) continue;

      for (let c = 0; c < transition.conditions.length; c += 1) {
        const condition = transition.conditions[c];
        const paramDef = controller.parameters[condition.param];
        if (paramDef?.type === 'trigger') {
          instance.params[condition.param] = false;
          instance.triggers[condition.param] = false;
        }
      }

      return previous !== transition.to;
    }

    return false;
  }

  /**
   * Resets triggers that were set but not consumed by any transition during the tick.
   */
  private consumeUnusedTriggers(instance: Instance): void {
    const controller = instance.definition.controller;
    if (!controller) return;

    const keys = Object.keys(instance.triggers);
    for (let i = 0; i < keys.length; i += 1) {
      const name = keys[i];
      if (!instance.triggers[name]) continue;
      if (controller.parameters[name]?.type !== 'trigger') continue;
      instance.params[name] = false;
      instance.triggers[name] = false;
    }
  }
}
