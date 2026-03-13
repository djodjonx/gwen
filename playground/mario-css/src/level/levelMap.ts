/**
 * Données pures du niveau 1.
 * Toutes les coordonnées sont en pixels CSS (origine haut-gauche).
 */

export type TileData =
  | { type: 'floor'; x: number; y: number; w: number; h: number }
  | { type: 'pipe'; x: number; y: number; w: number; h: number }
  | { type: 'box'; x: number; y: number; w: number; h: number }
  | { type: 'flag'; x: number; y: number; w: number; h: number };

export const LEVEL_WIDTH = 5500;
export const VIEWPORT_W = 800;
export const VIEWPORT_H = 480;
export const GROUND_Y = 416; // top du sol en px
export const TILE_SIZE = 32;

export const LEVEL_1: TileData[] = [
  // ── Sol continu ──────────────────────────────────────────────────────────
  { type: 'floor', x: 0, y: GROUND_Y, w: LEVEL_WIDTH, h: 64 },

  // ── Plateformes ──────────────────────────────────────────────────────────
  { type: 'floor', x: 300, y: 352, w: 96, h: 16 },
  { type: 'floor', x: 650, y: 320, w: 64, h: 16 },
  { type: 'floor', x: 1050, y: 288, w: 128, h: 16 },
  { type: 'floor', x: 1400, y: 320, w: 96, h: 16 },
  { type: 'floor', x: 1800, y: 256, w: 64, h: 16 },
  { type: 'floor', x: 2200, y: 288, w: 160, h: 16 },
  { type: 'floor', x: 2700, y: 320, w: 96, h: 16 },
  { type: 'floor', x: 3100, y: 256, w: 128, h: 16 },
  { type: 'floor', x: 3600, y: 288, w: 64, h: 16 },
  { type: 'floor', x: 4000, y: 256, w: 192, h: 16 },
  { type: 'floor', x: 4500, y: 320, w: 96, h: 16 },

  // ── Tuyaux ───────────────────────────────────────────────────────────────
  { type: 'pipe', x: 500, y: GROUND_Y - 96, w: 64, h: 96 },
  { type: 'pipe', x: 900, y: GROUND_Y - 128, w: 64, h: 128 },
  { type: 'pipe', x: 1600, y: GROUND_Y - 80, w: 64, h: 80 },
  { type: 'pipe', x: 2500, y: GROUND_Y - 112, w: 64, h: 112 },
  { type: 'pipe', x: 3300, y: GROUND_Y - 96, w: 64, h: 96 },
  { type: 'pipe', x: 4200, y: GROUND_Y - 80, w: 64, h: 80 },

  // ── Mystery boxes ────────────────────────────────────────────────────────
  { type: 'box', x: 320, y: 288, w: 32, h: 32 },
  { type: 'box', x: 352, y: 288, w: 32, h: 32 },
  { type: 'box', x: 384, y: 288, w: 32, h: 32 },
  { type: 'box', x: 672, y: 256, w: 32, h: 32 },
  { type: 'box', x: 1072, y: 224, w: 32, h: 32 },
  { type: 'box', x: 1104, y: 224, w: 32, h: 32 },
  { type: 'box', x: 1420, y: 256, w: 32, h: 32 },
  { type: 'box', x: 1820, y: 192, w: 32, h: 32 },
  { type: 'box', x: 2220, y: 224, w: 32, h: 32 },
  { type: 'box', x: 2252, y: 224, w: 32, h: 32 },
  { type: 'box', x: 2720, y: 256, w: 32, h: 32 },
  { type: 'box', x: 3120, y: 192, w: 32, h: 32 },
  { type: 'box', x: 3620, y: 224, w: 32, h: 32 },
  { type: 'box', x: 4020, y: 192, w: 32, h: 32 },

  // ── Drapeau (fin de niveau) ───────────────────────────────────────────────
  { type: 'flag', x: 5200, y: GROUND_Y - 352, w: 24, h: 352 },
];
