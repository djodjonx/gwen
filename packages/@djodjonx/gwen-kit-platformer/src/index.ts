// packages/@djodjonx/gwen-kit-platformer/src/index.ts

// ── Level 1 — Turnkey scene ────────────────────────────────────────────────
export { createPlatformerScene } from './scenes/platformer.js';
export type { PlatformerSceneOptions } from './scenes/platformer.js';

// ── Level 2 — Player prefab ────────────────────────────────────────────────
export { createPlayerPrefab } from './prefabs/player.js';
export type { PlayerPrefabOptions } from './prefabs/player.js';

// ── Level 3 — Raw ECS components (advanced use) ────────────────────────────
export {
  PlatformerController,
  PLATFORMER_CONTROLLER_DEFAULTS,
} from './components/PlatformerController.js';
export type { PlatformerControllerData } from './components/PlatformerController.js';
export { PlatformerIntent } from './components/PlatformerIntent.js';

// ── Systems (for manual scene assembly) ────────────────────────────────────
export { PlatformerInputSystem } from './systems/PlatformerInputSystem.js';
export { PlatformerMovementSystem } from './systems/PlatformerMovementSystem.js';

// ── Shared constants & types ───────────────────────────────────────────────
export { PlatformerDefaultInputMap } from './input.js';
