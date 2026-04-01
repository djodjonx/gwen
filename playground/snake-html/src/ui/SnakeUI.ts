import { defineUI } from '@gwenengine/core';
import snakeHtml from './snake.html?raw';
import snakeCss from './snake.css?raw';

const GRID_SIZE = 20;

type Cell = { x: number; y: number };

type ViewState = {
  cells: HTMLDivElement[];
  score: HTMLElement;
  best: HTMLElement;
  overlay: HTMLElement;
  overlayText: HTMLElement;
  active: Set<number>;
};

let view: ViewState | null = null;

function toIndex(cell: Cell): number {
  return cell.y * GRID_SIZE + cell.x;
}

function paintCell(index: number, className: string): void {
  if (!view || index < 0 || index >= view.cells.length) return;
  view.cells[index].classList.add(className);
  view.active.add(index);
}

function clearBoard(): void {
  if (!view) return;
  for (const index of view.active) {
    const cell = view.cells[index];
    cell.classList.remove('snake-cell--body', 'snake-cell--head', 'snake-cell--food');
  }
  view.active.clear();
}

export function renderSnakeView(state: {
  snake: Cell[];
  food: Cell;
  score: number;
  best: number;
  alive: boolean;
}): void {
  if (!view) return;

  clearBoard();

  for (let i = 0; i < state.snake.length; i += 1) {
    paintCell(toIndex(state.snake[i]), i === 0 ? 'snake-cell--head' : 'snake-cell--body');
  }

  paintCell(toIndex(state.food), 'snake-cell--food');

  view.score.textContent = `Score: ${state.score}`;
  view.best.textContent = `Best: ${state.best}`;

  if (state.alive) {
    view.overlay.hidden = true;
  } else {
    view.overlayText.textContent = `Game Over\nScore: ${state.score}\nAppuie sur R pour rejouer`;
    view.overlay.hidden = false;
  }
}

export const SnakeUI = defineUI({
  name: 'SnakeUI',

  onMount(api, entityId) {
    const htmlUI = api.services.get('htmlUI');
    htmlUI.mount(entityId, `<style>${snakeCss}</style>${snakeHtml}`);

    const board = htmlUI.el(entityId, 'snake-board');
    const score = htmlUI.el(entityId, 'snake-score');
    const best = htmlUI.el(entityId, 'snake-best');
    const overlay = htmlUI.el(entityId, 'snake-overlay');
    const overlayText = htmlUI.el(entityId, 'snake-overlay-text');

    if (!board || !score || !best || !overlay || !overlayText) return;

    overlay.hidden = true;

    const cells: HTMLDivElement[] = [];
    for (let i = 0; i < GRID_SIZE * GRID_SIZE; i += 1) {
      const cell = document.createElement('div');
      cell.className = 'snake-cell';
      board.appendChild(cell);
      cells.push(cell);
    }

    view = {
      cells,
      score,
      best,
      overlay,
      overlayText,
      active: new Set<number>(),
    };
  },

  render() {},

  onUnmount(api, entityId) {
    api.services.get('htmlUI').unmount(entityId);
    view = null;
  },
});
