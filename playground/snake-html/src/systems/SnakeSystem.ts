/**
 * SnakeSystem — main GWEN system for the Snake playground.
 *
 * Responsibilities:
 * - Reads keyboard input each frame to queue direction changes.
 * - Accumulates elapsed time and fires game-logic ticks at a fixed interval.
 * - Delegates all DOM updates to SnakeUI helpers.
 * - Handles restart input when the game is over.
 */

import { defineSystem, onUpdate, useEngine } from '@gwenjs/core';
import { useKeyboard, Keys } from '@gwenjs/input';
import { useHtmlUI } from '@gwenjs/ui';
import { createInitialState, isReversal, tick, TICK_MS, type Direction } from '../gameState';
import { mountSnakeUI, updateSnakeUI } from '../ui/SnakeUI';

export const SnakeSystem = defineSystem(function SnakeSystem() {
  const engine = useEngine();
  const kb = useKeyboard();
  const ui = useHtmlUI();

  // Create a dedicated entity to own the HTML UI subtree.
  const uiEntityId = engine.createEntity();
  mountSnakeUI(ui, uiEntityId);

  let state = createInitialState();
  // Render initial frame so the grid is visible before the first tick.
  updateSnakeUI(ui, uiEntityId, state);

  /**
   * Millisecond accumulator: carries over surplus time between frames so that
   * the snake moves at exactly {@link TICK_MS} ms per cell regardless of FPS.
   */
  let accumulator = 0;

  onUpdate((dt) => {
    // ── Restart ─────────────────────────────────────────────────────────────
    if (state.gameOver) {
      if (kb.isJustPressed(Keys.Space) || kb.isJustPressed(Keys.Enter)) {
        state = createInitialState();
        accumulator = 0;
        updateSnakeUI(ui, uiEntityId, state);
      }
      // No movement processing while the game-over overlay is shown.
      return;
    }

    // ── Direction input ──────────────────────────────────────────────────────
    // Use isJustPressed so holding a key doesn't spam direction changes —
    // exactly one direction change per physical keypress.
    let requestedDir: Direction | null = null;

    if (kb.isJustPressed(Keys.ArrowUp) || kb.isJustPressed(Keys.W)) {
      requestedDir = 'up';
    } else if (kb.isJustPressed(Keys.ArrowDown) || kb.isJustPressed(Keys.S)) {
      requestedDir = 'down';
    } else if (kb.isJustPressed(Keys.ArrowLeft) || kb.isJustPressed(Keys.A)) {
      requestedDir = 'left';
    } else if (kb.isJustPressed(Keys.ArrowRight) || kb.isJustPressed(Keys.D)) {
      requestedDir = 'right';
    }

    // Only apply the request if it isn't a 180° reversal of the committed direction.
    if (requestedDir !== null && !isReversal(requestedDir, state.direction)) {
      state = { ...state, nextDirection: requestedDir };
    }

    // ── Fixed-step tick ──────────────────────────────────────────────────────
    // dt arrives in seconds; convert to milliseconds for the accumulator.
    accumulator += dt * 1000;

    while (accumulator >= TICK_MS) {
      accumulator -= TICK_MS;
      state = tick(state);

      // Stop advancing time once the game ends so we don't stack up more ticks.
      if (state.gameOver) {
        accumulator = 0;
        break;
      }
    }

    // ── UI ───────────────────────────────────────────────────────────────────
    updateSnakeUI(ui, uiEntityId, state);
  });
});
