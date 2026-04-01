import type { EntityId } from '@gwenengine/core';

export type SpriteAnimParamType = 'bool' | 'int' | 'float' | 'trigger';
export type SpriteAnimParamValue = boolean | number;

export interface SpriteAnimPluginConfig {
  /** If true, the plugin ticks animations during `onUpdate`. */
  autoUpdate?: boolean;
  /** Optional fixed-step update (seconds). Example: `1 / 60`. */
  fixedDelta?: number;
  /** Safety cap for fixed-step loops. */
  maxSubSteps?: number;
  /** Safety cap for frame advances per entity/tick. */
  maxFrameAdvancesPerEntity?: number;
  /** Optional debug logs. */
  debug?: boolean;
}

export interface SpriteAnimFrameGrid {
  width: number;
  height: number;
  columns?: number;
  marginX?: number;
  marginY?: number;
  spacingX?: number;
  spacingY?: number;
}

export interface SpriteAnimClipRange {
  row: number;
  from: number;
  to: number;
  fps?: number;
  loop?: boolean;
  next?: string;
}

export interface SpriteAnimClipFrames {
  frames: number[];
  fps?: number;
  loop?: boolean;
  next?: string;
}

export type SpriteAnimClip = SpriteAnimClipRange | SpriteAnimClipFrames;

export interface SpriteAnimParameterDefinition {
  type: SpriteAnimParamType;
  default?: SpriteAnimParamValue;
}

export type SpriteAnimConditionOperator = '==' | '!=' | '<' | '<=' | '>' | '>=';

export interface SpriteAnimCondition {
  param: string;
  op?: SpriteAnimConditionOperator;
  value?: SpriteAnimParamValue;
}

export interface SpriteAnimTransition {
  from?: string | '*';
  to: string;
  hasExitTime?: boolean;
  /** Normalized [0..1] state time before transition can fire. */
  exitTime?: number;
  priority?: number;
  conditions?: SpriteAnimCondition[];
}

export interface SpriteAnimControllerState {
  clip: string;
  speed?: number;
}

export interface SpriteAnimController {
  initial: string;
  states: Record<string, SpriteAnimControllerState>;
  transitions?: SpriteAnimTransition[];
  parameters?: Record<string, SpriteAnimParameterDefinition>;
}

export type SpriteAnimAnchor = 'center' | 'top-left' | { x: number; y: number };

export interface SpriteAnimUIExtension {
  atlas: string;
  frame: SpriteAnimFrameGrid;
  clips: Record<string, SpriteAnimClip>;
  initial?: string;
  defaultFps?: number;
  anchor?: SpriteAnimAnchor;
  visible?: boolean;
  /** Optional V3 animator controller (Unity-like state machine). */
  controller?: SpriteAnimController;
}

export interface SpriteAnimCullRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SpriteAnimDrawOptions {
  width?: number;
  height?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  alpha?: number;
  flipX?: boolean;
  flipY?: boolean;
  /** Skip draw when sprite bounds are outside this rect. */
  cullRect?: SpriteAnimCullRect;
  /** Snap draw origin to integer pixels. */
  pixelSnap?: boolean;
}

export interface SpriteAnimPlayOptions {
  restart?: boolean;
  interrupt?: boolean;
}

export interface SpriteAnimTickOptions {
  maxFrameAdvancesPerEntity?: number;
}

export interface SpriteAnimState {
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

export interface SpriteAnimatorService {
  attach(uiName: string, entityId: EntityId, extension: SpriteAnimUIExtension): void;
  detach(entityId: EntityId): void;
  has(entityId: EntityId): boolean;

  tick(deltaTime: number, options?: SpriteAnimTickOptions): void;
  draw(
    ctx: CanvasRenderingContext2D,
    entityId: EntityId,
    x: number,
    y: number,
    options?: SpriteAnimDrawOptions,
  ): boolean;

  play(entityId: EntityId, clip: string, options?: SpriteAnimPlayOptions): boolean;
  setState(entityId: EntityId, state: string, options?: SpriteAnimPlayOptions): boolean;

  setParam(entityId: EntityId, name: string, value: SpriteAnimParamValue): boolean;
  getParam(entityId: EntityId, name: string): SpriteAnimParamValue | undefined;
  setTrigger(entityId: EntityId, name: string): boolean;
  resetTrigger(entityId: EntityId, name: string): boolean;

  pause(entityId: EntityId): void;
  resume(entityId: EntityId): void;
  stop(entityId: EntityId): void;
  setSpeed(entityId: EntityId, speed: number): void;
  setVisible(entityId: EntityId, visible: boolean): void;
  setCulled(entityId: EntityId, culled: boolean): void;
  isCulled(entityId: EntityId): boolean;

  getState(entityId: EntityId): Readonly<SpriteAnimState> | null;
  clear(): void;
}

export interface SpriteAnimPluginHooks {
  'spriteAnim:complete': (entityId: EntityId, clip: string, state: string) => void;
  'spriteAnim:frame': (
    entityId: EntityId,
    clip: string,
    state: string,
    frameCursor: number,
    frameIndex: number,
  ) => void;
  'spriteAnim:transition': (entityId: EntityId, fromState: string, toState: string) => void;
}
