/**
 * GWEN Engine Lifecycle Management
 *
 * Public interface for engine lifecycle: start(), stop().
 * Also defines the main game loop and tick logic.
 * @internal
 */

import { Engine } from './engine';

export function start(engine: Engine): void {
  engine._start();
}

export function stop(engine: Engine): void {
  engine._stop();
}

// These are exported via Engine class methods:
// - engine.start() delegates to start(engine)
// - engine.stop() delegates to stop(engine)
// - engine.tick() is managed internally via RAF loop in _start()

