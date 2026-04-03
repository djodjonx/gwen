/**
 * Pure Snake game state and logic — no GWEN dependencies.
 *
 * All functions are immutable-style: they return new state objects rather than
 * mutating in place, making them straightforward to test.
 */

/** One of the four cardinal movement directions. */
export type Direction = 'up' | 'down' | 'left' | 'right';

/** A 2-D integer grid coordinate. */
export interface Point {
  /** Column index (0-based, left to right). */
  x: number;
  /** Row index (0-based, top to bottom). */
  y: number;
}

/** Number of cells along each axis of the square grid. */
export const GRID = 20;

/** Milliseconds between snake movement ticks. */
export const TICK_MS = 150;

/** Complete snapshot of the snake game at any moment. */
export interface SnakeState {
  /**
   * Ordered list of occupied grid cells.  The head is always at index 0;
   * the tail is at the last index.
   */
  segments: Point[];
  /** Direction the snake is currently travelling. */
  direction: Direction;
  /**
   * Direction queued for the next tick (applied before movement so that a
   * direction key pressed between ticks is not missed).
   */
  nextDirection: Direction;
  /** Current position of the food pellet. */
  food: Point;
  /** Number of food items eaten this game. */
  score: number;
  /** `true` once the snake has hit a wall or its own body. */
  gameOver: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns `true` when `a` and `b` occupy the same grid cell.
 *
 * @param a First point.
 * @param b Second point.
 */
function pointsEqual(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * Returns a new food position chosen uniformly at random from all cells not
 * occupied by any segment.
 *
 * @param segments Current snake body cells (head first).
 * @returns A free grid cell for the next food pellet.
 */
export function randomFood(segments: Point[]): Point {
  const occupied = new Set(segments.map((p) => `${p.x},${p.y}`));

  // Collect all free cells and pick one at random.
  const free: Point[] = [];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (!occupied.has(`${x},${y}`)) free.push({ x, y });
    }
  }

  // Fallback: if the grid is completely full the snake has won — reuse head.
  if (free.length === 0) return { ...segments[0] };

  return free[Math.floor(Math.random() * free.length)]!;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Creates a fresh {@link SnakeState} with the snake centred on the grid,
 * moving right, at length 3, and a randomly placed food pellet.
 *
 * @returns A new game state ready to be used in the first tick.
 */
export function createInitialState(): SnakeState {
  const cx = Math.floor(GRID / 2);
  const cy = Math.floor(GRID / 2);

  // Head at (cx, cy), body stretching left.
  const segments: Point[] = [
    { x: cx, y: cy },
    { x: cx - 1, y: cy },
    { x: cx - 2, y: cy },
  ];

  return {
    segments,
    direction: 'right',
    nextDirection: 'right',
    food: randomFood(segments),
    score: 0,
    gameOver: false,
  };
}

/**
 * Advances the game by one tick: applies the queued direction, moves the
 * snake, checks collisions, handles food consumption, and returns a new state.
 *
 * This function never mutates its argument.
 *
 * @param state The current game state.
 * @returns A new {@link SnakeState} reflecting the outcome of the tick.
 */
export function tick(state: SnakeState): SnakeState {
  if (state.gameOver) return state;

  // Commit the queued direction (180° reversals are already blocked by the
  // system that sets nextDirection).
  const direction = state.nextDirection;

  // Compute the new head position.
  const head = state.segments[0]!;
  let nx = head.x;
  let ny = head.y;
  if (direction === 'right') nx += 1;
  else if (direction === 'left') nx -= 1;
  else if (direction === 'down') ny += 1;
  else ny -= 1; // 'up'

  // Wall collision.
  if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) {
    return { ...state, direction, gameOver: true };
  }

  const newHead: Point = { x: nx, y: ny };

  // Self-collision — check against all segments except the current tail (which
  // will vacate its cell this tick unless we grow).
  const ateFood = pointsEqual(newHead, state.food);

  // If we ate food the tail stays (snake grows); otherwise it is removed.
  const bodyToCheck = ateFood ? state.segments : state.segments.slice(0, -1);
  const selfCollision = bodyToCheck.some((s) => pointsEqual(s, newHead));
  if (selfCollision) {
    return { ...state, direction, gameOver: true };
  }

  // Build next segments list.
  const nextSegments = ateFood
    ? [newHead, ...state.segments]
    : [newHead, ...state.segments.slice(0, -1)];

  const nextScore = ateFood ? state.score + 1 : state.score;
  const nextFood = ateFood ? randomFood(nextSegments) : state.food;

  return {
    segments: nextSegments,
    direction,
    nextDirection: direction,
    food: nextFood,
    score: nextScore,
    gameOver: false,
  };
}

/**
 * Returns `true` if `dir` is the direct opposite of `current`, which would
 * cause an illegal 180° reversal.
 *
 * @param dir     Candidate new direction.
 * @param current Current (committed) direction.
 */
export function isReversal(dir: Direction, current: Direction): boolean {
  return (
    (dir === 'up' && current === 'down') ||
    (dir === 'down' && current === 'up') ||
    (dir === 'left' && current === 'right') ||
    (dir === 'right' && current === 'left')
  );
}
