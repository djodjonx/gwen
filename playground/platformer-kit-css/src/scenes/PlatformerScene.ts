import { UIComponent, defineComponent, Types, type EngineAPI } from '@djodjonx/gwen-engine-core';
import { createPlatformerScene, createPlayerPrefab } from '@djodjonx/gwen-kit-platformer';
import { PlayerUI, BlockUI, HudUI, blockLayout } from '../ui/GameUI.ts';
import {
  createLevelStaticGeometry,
  type LevelBlock,
  type LevelStaticGeometryHandle,
} from '../level/staticGeometry.ts';
import '../style.css';

const TILE_SIZE_PX = 16;
const WORLD_WIDTH_PX = 1280;
const WORLD_HEIGHT_PX = 640;

const LEVEL_BLOCKS: ReadonlyArray<LevelBlock> = [
  { x: WORLD_WIDTH_PX / 2, y: 550, w: WORLD_WIDTH_PX, h: 64 },
  { x: 300, y: 420, w: 128, h: 32 },
  { x: 550, y: 320, w: 128, h: 32 },
  { x: 800, y: 220, w: 128, h: 32 },
];

let staticGeometry: LevelStaticGeometryHandle | null = null;

/**
 * Advanced Example:
 * Custom position component that extends the standard one with additional fields
 * (e.g., for custom interpolation or tracking).
 */
const AdvancedPosition = defineComponent({
  name: 'position', // Must keep 'position' for Physics2D compatibility
  schema: {
    x: Types.f32,
    y: Types.f32,
    lastX: Types.f32,
    lastY: Types.f32,
  },
});

/**
 * Platformer Kit CSS Playground
 *
 * Demonstrates:
 * 1. Automatic physical colliders (body + feet)
 * 2. Advanced Mode: Overriding kit components with custom schemas
 * 3. CSS rendering synchronized with authoritative physics
 */

export const PlatformerScene = createPlatformerScene({
  name: 'PlatformerScene',
  units: 'pixels',
  gravity: 35,

  ui: [PlayerUI, BlockUI, HudUI],

  async onEnter(api) {
    // Setup DOM containers
    const viewport = document.createElement('div');
    viewport.id = 'game-viewport';
    const world = document.createElement('div');
    world.id = 'game-world';
    viewport.appendChild(world);
    document.body.appendChild(viewport);

    // Register Prefabs
    api.prefabs.register(PlayerPrefab);

    // Create visual blocks and load merged static colliders from a tile bake.
    spawnLevelVisuals(api, LEVEL_BLOCKS);
    loadMergedLevelCollision(api, LEVEL_BLOCKS);

    // Spawn Player
    api.prefabs.instantiate('Player', 100, 450);

    // Spawn HUD
    const hud = api.createEntity();
    api.addComponent(hud, UIComponent, { uiName: 'HudUI' });
  },

  onExit(_api) {
    staticGeometry?.unload();
    staticGeometry = null;
    document.getElementById('game-viewport')?.remove();
    blockLayout.clear();
  },
});

const PlayerPrefab = createPlayerPrefab({
  name: 'Player',
  units: 'pixels',
  speed: 400,
  jumpForce: 750,

  // Advanced Mode: Inject our custom position component
  // The kit will now use AdvancedPosition instead of the default Position.
  components: {
    position: AdvancedPosition,
  },

  colliders: {
    body: { w: 28, h: 28 },
    foot: { w: 24, h: 6 },
  },
  onCreated(api, entity) {
    api.addComponent(entity, UIComponent, { uiName: 'PlayerUI' });
  },
});

function createBlockVisual(api: EngineAPI, x: number, y: number, w: number, h: number) {
  const block = api.createEntity();
  blockLayout.set(block, { x, y, w, h });
  api.addComponent(block, UIComponent, { uiName: 'BlockUI' });
  return block;
}

function spawnLevelVisuals(api: EngineAPI, blocks: ReadonlyArray<LevelBlock>) {
  for (const block of blocks) {
    createBlockVisual(api, block.x, block.y, block.w, block.h);
  }
}

function loadMergedLevelCollision(api: EngineAPI, blocks: ReadonlyArray<LevelBlock>) {
  if (!api.services.has('physics')) {
    console.error('[PlatformerScene] Physics service not available during onEnter!');
    return;
  }

  const physics = api.services.get('physics');
  staticGeometry = createLevelStaticGeometry(physics, {
    blocks,
    worldWidthPx: WORLD_WIDTH_PX,
    worldHeightPx: WORLD_HEIGHT_PX,
    tileSizePx: TILE_SIZE_PX,
    chunkSizeTiles: 16,
  });
}
