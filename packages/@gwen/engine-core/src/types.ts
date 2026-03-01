/**
 * GWEN Engine Type Definitions
 */

// ============= Core Types =============

export type EntityId = number;

export interface Vector2D {
  x: number;
  y: number;
}

export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Transform extends Vector2D {
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
}

export interface SpriteConfig {
  width: number;
  height: number;
  color?: Color;
  opacity?: number;
  imageUrl?: string;
}

// ============= Component System =============

export type ComponentType = 'transform' | 'sprite' | 'velocity' | 'input' | string;

export interface Component {
  type: ComponentType;
  data: any;
}

export interface Entity {
  id: number;
  components: Map<ComponentType, Component>;
}

// ============= Configuration =============

export interface EngineConfig {
  maxEntities: number;
  canvas: string | HTMLCanvasElement;
  width: number;
  height: number;
  targetFPS: number;
  debug?: boolean;
  enableStats?: boolean;
  plugins?: any[];
}

// ============= Event System =============

export type EngineEvent =
  | 'start'
  | 'stop'
  | 'update'
  | 'render'
  | 'entityCreated'
  | 'entityDestroyed'
  | 'componentAdded'
  | 'componentRemoved';

export interface UpdateEvent {
  deltaTime: number;
  frameCount: number;
}

export interface EngineStats {
  fps: number;
  frameCount: number;
  deltaTime: number;
  entityCount: number;
  isRunning: boolean;
}

// ============= Plugin System =============

export interface Plugin {
  name: string;
  version: string;
  init?(engine: any): void;
  update?(dt: number): void;
  destroy?(): void;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  type: 'wasm' | 'typescript';
  entry?: string;
}

// ============= Query System =============

export interface QueryResult {
  entities: EntityId[];
  count: number;
}

export interface QueryFilter {
  components?: ComponentType[];
  exclude?: ComponentType[];
}

// ============= Renderer Types =============

export interface Renderable {
  entityId: EntityId;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
  color?: Color;
}

export interface CameraConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom?: number;
  rotation?: number;
}

// ============= Input System =============

export interface InputState {
  keys: Set<string>;
  mouseX: number;
  mouseY: number;
  mouseDown: boolean;
  touches: TouchList | null;
}

export type InputListener = (input: InputState) => void;

// ============= Asset System =============

export type AssetType = 'image' | 'audio' | 'json' | 'text';

export interface Asset {
  id: string;
  type: AssetType;
  url: string;
  data?: any;
  loaded: boolean;
}

