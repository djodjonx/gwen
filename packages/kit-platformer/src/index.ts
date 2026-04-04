// packages/@gwenjs/kit-platformer/src/index.ts

// ── Level 1 — Turnkey scene ────────────────────────────────────────────────
export { createPlatformerScene } from './scenes/platformer';
export type { PlatformerSceneOptions } from './scenes/platformer';

// ── Level 2 — Prefabs & Components ─────────────────────────────────────────
export { createPlayerPrefab } from './prefabs/player';
export type { PlayerPrefabOptions, ColliderPixelDef } from './prefabs/player';
export type { PlatformerUnits } from './plugin/units';
export { DEFAULT_PIXELS_PER_METER, DEFAULT_PLATFORMER_UNITS } from './plugin/units';

export { PlatformerController } from './components/PlatformerController';
export type { PlatformerControllerData } from './components/PlatformerController';
export { PlatformerIntent } from './components/PlatformerIntent';
export { Position } from './components/StandardComponents';

// ── Level 3 — Advanced Configuration ───────────────────────────────────────
export { PlatformerKitPlugin } from './plugin/index';
export type {
  PlatformerKitConfig,
  PlatformerKitComponents,
  PlatformerKitService,
} from './plugin/index';

// ── Level 4 — Logic & Internal Systems ─────────────────────────────────────
export { PlatformerInputSystem } from './systems/PlatformerInputSystem';
export { PlatformerMovementSystem } from './systems/PlatformerMovementSystem';

// ── Level Geometry Helpers ──────────────────────────────────────────────────
export {
  buildPlatformerStaticGeometry,
  loadPlatformerStaticGeometry,
  createPlatformerStaticGeometry,
} from './helpers/staticGeometry';
export type {
  PlatformerLevelBlock,
  BuildPlatformerStaticGeometryOptions,
  LoadPlatformerStaticGeometryOptions,
  PlatformerStaticGeometryHandle,
} from './helpers/staticGeometry';

// ── Shared constants & types ───────────────────────────────────────────────
export { PlatformerDefaultInputMap } from './plugin/input';

// ─── Module, composables & type augmentations ─────────────────────────────────
export * from './augment';
export { usePlatformer } from './composables';
export { default } from './module';
