/** Shared mutable game state — imported by all systems that need cross-system data. */
export const gameState = {
  /** Current player score (enemy kills). */
  score: 0,
  /** Remaining player lives. */
  lives: 3,
  /** True when lives reach zero — stops all game logic. */
  gameOver: false,
  /** Accumulated time since last enemy spawn (seconds). */
  spawnTimer: 0,
  /** Remaining seconds of player invincibility after taking a hit. */
  invincibleTimer: 0,
};

/** Resets all game state values to their defaults. */
export function resetGame(): void {
  gameState.score = 0;
  gameState.lives = 3;
  gameState.gameOver = false;
  gameState.spawnTimer = 0;
  gameState.invincibleTimer = 0;
}
