// packages/@djodjonx/gwen-kit-platformer/src/index.ts

// ── Level 1 — Turnkey scene ────────────────────────────────────────────────
export { createPlatformerScene } from './scenes/platformer.js';
export type { PlatformerSceneOptions } from './scenes/platformer.js';

// ── Level 2 — Prefabs & Components ─────────────────────────────────────────
export { createPlayerPrefab } from './prefabs/player.js';
export type { PlayerPrefabOptions, ColliderPixelDef } from './prefabs/player.js';

export { PlatformerController } from './components/PlatformerController.js';
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

// ── Shared constants & types ───────────────────────────────────────────────
export { PlatformerDefaultInputMap } from './input.js';
