// packages/@gwenengine/kit-platformer/src/index.ts

// ── Level 1 — Turnkey scene ────────────────────────────────────────────────
export { createPlatformerScene } from './scenes/platformer.js';
export type { PlatformerSceneOptions } from './scenes/platformer.js';

// ── Level 2 — Prefabs & Components ─────────────────────────────────────────
export { createPlayerPrefab } from './prefabs/player.js';
export type { PlayerPrefabOptions, ColliderPixelDef } from './prefabs/player.js';
export type { PlatformerUnits } from './units.js';
export { DEFAULT_PIXELS_PER_METER, DEFAULT_PLATFORMER_UNITS } from './units.js';

export { PlatformerController } from './components/PlatformerController.js';
export type { PlatformerControllerData } from './components/PlatformerController.js';
export { PlatformerIntent } from './components/PlatformerIntent.js';
export { Position } from './components/StandardComponents.js';

// ── Level 3 — Advanced Configuration ───────────────────────────────────────
export { PlatformerKitPlugin } from './plugin.js';
export type {
  PlatformerKitConfig,
  PlatformerKitComponents,
  PlatformerKitService,
} from './plugin.js';

// ── Level 4 — Logic & Internal Systems ─────────────────────────────────────
export { PlatformerInputSystem } from './systems/PlatformerInputSystem.js';
export { PlatformerMovementSystem } from './systems/PlatformerMovementSystem.js';

// ── Level Geometry Helpers ──────────────────────────────────────────────────
export {
  buildPlatformerStaticGeometry,
  loadPlatformerStaticGeometry,
  createPlatformerStaticGeometry,
} from './helpers/staticGeometry.js';
export type {
  PlatformerLevelBlock,
  BuildPlatformerStaticGeometryOptions,
  LoadPlatformerStaticGeometryOptions,
  PlatformerStaticGeometryHandle,
} from './helpers/staticGeometry.js';

// ── Shared constants & types ───────────────────────────────────────────────
export { PlatformerDefaultInputMap } from './input.js';

// ─── Module, composables & type augmentations ─────────────────────────────────
export * from './augment.js';
export { usePlatformer } from './composables.js';
export { default } from './module.js';
