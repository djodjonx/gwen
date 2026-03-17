export interface LevelBlock {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const TILE_SIZE_PX = 16;
export const CHUNK_SIZE_TILES = 16;
export const WORLD_WIDTH_PX = 1280;
export const WORLD_HEIGHT_PX = 640;

// Keep these at zero while no camera transform is applied to block/background UI.
export const VIEWPORT_OFFSET_X_PX = 0;
export const VIEWPORT_OFFSET_Y_PX = 0;

export const PLAYER_SPAWN = { x: 100, y: 450 };

export const LEVEL_BLOCKS: ReadonlyArray<LevelBlock> = [
  { x: WORLD_WIDTH_PX / 2, y: 550, w: WORLD_WIDTH_PX, h: 64 },
  { x: 300, y: 420, w: 128, h: 32 },
  { x: 550, y: 320, w: 128, h: 32 },
  { x: 800, y: 220, w: 128, h: 32 },
];
