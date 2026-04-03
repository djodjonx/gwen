/**
 * HTML/CSS rendering helpers for the Snake playground.
 *
 * Provides a single mount call that injects the grid template once, and an
 * update function that efficiently repaints only the cells that need to change
 * each tick.
 */

import type { HtmlUI } from '@gwenjs/ui';
import type { EntityId } from '@gwenjs/core';
import { GRID, type SnakeState } from '../gameState';

// ── Colour palette ────────────────────────────────────────────────────────────

/** Background colour for empty grid cells. */
const COLOR_EMPTY = '#0b1020';

/** Fill colour for the snake's head cell. */
const COLOR_HEAD = '#00d4ff';

/** Fill colour for snake body cells. */
const COLOR_BODY = '#0090aa';

/** Fill colour for the food pellet cell. */
const COLOR_FOOD = '#ff4466';

// ── Template ──────────────────────────────────────────────────────────────────

/** Pixel size of each grid cell. */
const CELL_PX = 20;

/** Total canvas dimension in pixels. */
const CANVAS_PX = GRID * CELL_PX;

/**
 * Builds the full HTML template string used for the snake UI.
 *
 * The template includes:
 * - A `<style>` block (deduplicated by HtmlUIPlugin).
 * - A centred game wrapper with score, grid, and game-over overlay.
 *
 * The grid is pre-populated with `GRID * GRID` cell `<div>` elements so that
 * `updateSnakeUI` can update their background colours in-place without
 * recreating DOM nodes.
 */
function buildTemplate(): string {
  // Build all 400 cell divs up front.
  const cells = Array.from({ length: GRID * GRID }, () => `<div class="cell"></div>`).join('');

  return /* html */ `
<style>
  #snake-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100vw;
    height: 100vh;
    background: #060d1a;
    font-family: 'Courier New', monospace;
    color: #c8e0ff;
    user-select: none;
  }

  #snake-title {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 4px;
    text-transform: uppercase;
    color: #00d4ff;
    margin-bottom: 12px;
    text-shadow: 0 0 8px #00d4ff88;
  }

  #snake-score-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-bottom: 10px;
    color: #7ab8e8;
  }

  #score {
    font-size: 20px;
    font-weight: 700;
    color: #ffffff;
    min-width: 32px;
    text-align: right;
  }

  #snake-grid-wrap {
    position: relative;
    width: ${CANVAS_PX}px;
    height: ${CANVAS_PX}px;
    border: 2px solid #1a2a44;
    box-shadow: 0 0 24px #00d4ff22;
  }

  #grid {
    display: grid;
    grid-template-columns: repeat(${GRID}, ${CELL_PX}px);
    grid-template-rows: repeat(${GRID}, ${CELL_PX}px);
    width: ${CANVAS_PX}px;
    height: ${CANVAS_PX}px;
  }

  .cell {
    width: ${CELL_PX}px;
    height: ${CELL_PX}px;
    background: ${COLOR_EMPTY};
    box-sizing: border-box;
  }

  #overlay {
    display: none;
    position: absolute;
    inset: 0;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(6, 13, 26, 0.82);
    gap: 12px;
  }

  #overlay-title {
    font-size: 28px;
    font-weight: 700;
    letter-spacing: 4px;
    color: #ff4466;
    text-shadow: 0 0 12px #ff446688;
  }

  #overlay-final-score {
    font-size: 16px;
    color: #c8e0ff;
    letter-spacing: 2px;
  }

  #overlay-hint {
    font-size: 13px;
    color: #7ab8e8;
    letter-spacing: 1px;
    animation: blink 1.2s step-end infinite;
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0; }
  }
</style>

<div id="snake-wrapper">
  <div id="snake-title">SNAKE</div>
  <div id="snake-score-row">SCORE <span id="score">0</span></div>
  <div id="snake-grid-wrap">
    <div id="grid">${cells}</div>
    <div id="overlay">
      <div id="overlay-title">GAME OVER</div>
      <div id="overlay-final-score">SCORE: <span id="final-score">0</span></div>
      <div id="overlay-hint">PRESS SPACE / ENTER TO RESTART</div>
    </div>
  </div>
</div>
`;
}

// ── Mount ─────────────────────────────────────────────────────────────────────

/**
 * Mounts the snake HTML template for the given entity and pre-caches the
 * cell elements for fast per-frame updates.
 *
 * Call this once during system setup.
 *
 * @param ui       The `HtmlUI` service from `useHtmlUI()`.
 * @param entityId The entity that owns the UI.
 */
export function mountSnakeUI(ui: HtmlUI, entityId: EntityId): void {
  ui.mount(entityId, buildTemplate());
}

// ── Update ────────────────────────────────────────────────────────────────────

/**
 * Updates every visual element of the snake UI to reflect the given state.
 *
 * This is intentionally brute-force: all `GRID * GRID` cell backgrounds are
 * set on every call.  At 20×20 = 400 cells and 60 fps this costs less than a
 * tenth of a millisecond and avoids dirty-tracking complexity.
 *
 * @param ui       The `HtmlUI` service.
 * @param entityId The entity that owns the UI.
 * @param state    Current game state snapshot.
 */
export function updateSnakeUI(ui: HtmlUI, entityId: EntityId, state: SnakeState): void {
  // ── Build fast lookup sets ────────────────────────────────────────────────
  const headKey = `${state.segments[0]!.x},${state.segments[0]!.y}`;
  const bodyKeys = new Set(state.segments.slice(1).map((p) => `${p.x},${p.y}`));
  const foodKey = `${state.food.x},${state.food.y}`;

  // ── Update grid cells ─────────────────────────────────────────────────────
  const gridEl = ui.el(entityId, 'grid');
  if (gridEl) {
    const cells = gridEl.children;
    for (let i = 0; i < cells.length; i++) {
      const x = i % GRID;
      const y = Math.floor(i / GRID);
      const key = `${x},${y}`;

      let color: string;
      if (key === headKey) color = COLOR_HEAD;
      else if (bodyKeys.has(key)) color = COLOR_BODY;
      else if (key === foodKey) color = COLOR_FOOD;
      else color = COLOR_EMPTY;

      (cells[i] as HTMLElement).style.background = color;
    }
  }

  // ── Score ─────────────────────────────────────────────────────────────────
  ui.text(entityId, 'score', String(state.score));

  // ── Game-over overlay ─────────────────────────────────────────────────────
  ui.style(entityId, 'overlay', 'display', state.gameOver ? 'flex' : 'none');

  if (state.gameOver) {
    ui.text(entityId, 'final-score', String(state.score));
  }
}
