import { defineSystem } from '@djodjonx/gwen-engine-core';
import { renderSnakeView } from '../ui/SnakeUI';

const GRID_SIZE = 20;
const START_SPEED_SECONDS = 0.12;
const MIN_SPEED_SECONDS = 0.06;
const SPEED_STEP = 0.003;

type Cell = { x: number; y: number };
type Direction = 'up' | 'down' | 'left' | 'right';

function opposite(a: Direction, b: Direction): boolean {
  return (
    (a === 'up' && b === 'down') ||
    (a === 'down' && b === 'up') ||
    (a === 'left' && b === 'right') ||
    (a === 'right' && b === 'left')
  );
}

function nextHead(head: Cell, dir: Direction): Cell {
  if (dir === 'up') return { x: head.x, y: head.y - 1 };
  if (dir === 'down') return { x: head.x, y: head.y + 1 };
  if (dir === 'left') return { x: head.x - 1, y: head.y };
  return { x: head.x + 1, y: head.y };
}

function outOfBounds(c: Cell): boolean {
  return c.x < 0 || c.y < 0 || c.x >= GRID_SIZE || c.y >= GRID_SIZE;
}

function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}

function randomFood(snake: Cell[]): Cell {
  const occupied = new Set(snake.map((c) => `${c.x},${c.y}`));
  const free: Cell[] = [];

  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const key = `${x},${y}`;
      if (!occupied.has(key)) free.push({ x, y });
    }
  }

  if (free.length === 0) return snake[0] ?? { x: 0, y: 0 };
  return free[Math.floor(Math.random() * free.length)];
}

function bestScore(): number {
  if (typeof localStorage === 'undefined') return 0;
  const raw = localStorage.getItem('gwen-snake-best');
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function saveBestScore(value: number): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem('gwen-snake-best', String(value));
}

export const SnakeSystem = defineSystem('SnakeSystem', () => {
  let snake: Cell[] = [];
  let food: Cell = { x: 0, y: 0 };
  let direction: Direction = 'right';
  let queuedDirection: Direction = 'right';
  let accumulator = 0;
  let alive = true;
  let score = 0;
  let best = bestScore();

  function reset(): void {
    snake = [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ];
    direction = 'right';
    queuedDirection = 'right';
    accumulator = 0;
    alive = true;
    score = 0;
    food = randomFood(snake);
    renderSnakeView({ snake, food, score, best, alive });
  }

  function queue(next: Direction): void {
    if (!opposite(next, direction) && !opposite(next, queuedDirection)) {
      queuedDirection = next;
    }
  }

  function step(): void {
    direction = queuedDirection;

    const head = snake[0];
    const candidate = nextHead(head, direction);

    if (outOfBounds(candidate) || snake.some((c) => sameCell(c, candidate))) {
      alive = false;
      renderSnakeView({ snake, food, score, best, alive });
      return;
    }

    snake.unshift(candidate);

    if (sameCell(candidate, food)) {
      score += 1;
      if (score > best) {
        best = score;
        saveBestScore(best);
      }
      food = randomFood(snake);
    } else {
      snake.pop();
    }

    renderSnakeView({ snake, food, score, best, alive });
  }

  function currentTick(): number {
    return Math.max(MIN_SPEED_SECONDS, START_SPEED_SECONDS - score * SPEED_STEP);
  }

  return {
    onInit() {
      reset();
    },

    onUpdate(api, dt) {
      const keyboard = api.services.get('keyboard');

      if (keyboard.isJustPressed('ArrowUp') || keyboard.isJustPressed('KeyW')) queue('up');
      if (keyboard.isJustPressed('ArrowDown') || keyboard.isJustPressed('KeyS')) queue('down');
      if (keyboard.isJustPressed('ArrowLeft') || keyboard.isJustPressed('KeyA')) queue('left');
      if (keyboard.isJustPressed('ArrowRight') || keyboard.isJustPressed('KeyD')) queue('right');

      if (!alive) {
        if (keyboard.isJustPressed('KeyR')) reset();
        return;
      }

      accumulator += dt;
      const tick = currentTick();
      while (accumulator >= tick) {
        accumulator -= tick;
        step();
        if (!alive) break;
      }
    },
  };
});
