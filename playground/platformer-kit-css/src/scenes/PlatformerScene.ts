import { createPlatformerScene, createPlatformerStaticGeometry } from '@gwenengine/kit-platformer';
import {
  CHUNK_SIZE_TILES,
  LEVEL_BLOCKS,
  PLAYER_SPAWN,
  TILE_SIZE_PX,
  WORLD_HEIGHT_PX,
  WORLD_WIDTH_PX,
} from '../level/levelData';
import { BlockPrefab, HudPrefab, PlayerPrefab, SceneChromePrefab } from '../prefabs';
import { BlockUI, HudUI, PlayerUI, SceneChromeUI } from '../ui';

type WorldHandle = { unload(): void };

let world: WorldHandle | null = null;

export const PlatformerScene = createPlatformerScene({
  name: 'PlatformerScene',
  units: 'pixels',
  gravity: 5000,
  ui: [SceneChromeUI, PlayerUI, BlockUI, HudUI],

  onEnter(api) {
    api.prefabs.register(PlayerPrefab);
    api.prefabs.register(BlockPrefab);
    api.prefabs.register(HudPrefab);
    api.prefabs.register(SceneChromePrefab);

    api.prefabs.instantiate('SceneChrome', 0, 0);
    api.prefabs.instantiate('Hud', 0, 0);

    for (const block of LEVEL_BLOCKS) {
      api.prefabs.instantiate('Block', block.x, block.y, block.w, block.h);
    }

    api.prefabs.instantiate('Player', PLAYER_SPAWN.x, PLAYER_SPAWN.y);

    const physics = api.services.get('physics');
    const geometry = createPlatformerStaticGeometry(physics, {
      blocks: LEVEL_BLOCKS,
      worldWidthPx: WORLD_WIDTH_PX,
      worldHeightPx: WORLD_HEIGHT_PX,
      tileSizePx: TILE_SIZE_PX,
      chunkSizeTiles: CHUNK_SIZE_TILES,
      surfaceFriction: 0.02,
      surfaceRestitution: 0,
    });
    world = { unload: () => geometry.unload() };
  },

  onExit() {
    world?.unload();
    world = null;
  },
});
