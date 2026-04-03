/**
 * @module platformer.bench
 *
 * Platformer kit end-to-end benchmarks for @gwenjs/kit-platformer.
 *
 * Measures:
 *  1. Full query + component read overhead for one game frame with N entities
 *     (simulates the hot path of PlatformerMovementSystem with a mock physics API).
 *  2. buildPlatformerStaticGeometry() — pure-TS geometry bake from pixel blocks.
 *
 * The engine is created with the TypeScript-only ECS (no WASM loaded) to
 * isolate JavaScript orchestration overhead from Rust physics cost.
 * The Rust physics solver is benchmarked separately in @gwenjs/physics2d.
 *
 * All fixtures are pre-computed OUTSIDE `bench()` calls.
 *
 * Baseline machine: M-series Mac, single-threaded Node 20.
 *
 * Run:
 *   pnpm --filter @gwenjs/kit-platformer bench
 */

import { bench, describe } from 'vitest';
import { EntityManager, ComponentRegistry, QueryEngine } from '@gwenjs/core';
import type { EntityId } from '@gwenjs/core';

import {
  PlatformerController,
  PLATFORMER_CONTROLLER_DEFAULTS,
} from '../src/components/PlatformerController.js';
import { PlatformerIntent } from '../src/components/PlatformerIntent.js';
import { Position } from '../src/components/StandardComponents.js';
import { buildPlatformerStaticGeometry } from '../src/helpers/staticGeometry.js';
import type {
  PlatformerLevelBlock,
  BuildPlatformerStaticGeometryOptions,
} from '../src/helpers/staticGeometry.js';
import type { PlatformerControllerData } from '../src/components/PlatformerController.js';

// ---------------------------------------------------------------------------
// Mock physics service — no-op, measures only TS orchestration cost
// ---------------------------------------------------------------------------

interface MinimalPhysics {
  getLinearVelocity(eid: EntityId): { x: number; y: number } | null;
  setLinearVelocity(eid: EntityId, vx: number, vy: number): void;
  getPosition(eid: EntityId): { x: number; y: number; rotation: number } | null;
}

function makeMockPhysics(): MinimalPhysics {
  return {
    getLinearVelocity: (_eid) => ({ x: 0, y: 0 }),
    setLinearVelocity: (_eid, _vx, _vy) => undefined,
    getPosition: (_eid) => ({ x: 0, y: 0, rotation: 0 }),
  };
}

// ---------------------------------------------------------------------------
// World factory — populates N entities with platformer components
// ---------------------------------------------------------------------------

interface PlatformerWorld {
  em: EntityManager;
  cr: ComponentRegistry;
  qe: QueryEngine;
  physics: MinimalPhysics;
}

/** Default controller data — matches real component defaults. */
const DEFAULT_CTRL: PlatformerControllerData = {
  ...PLATFORMER_CONTROLLER_DEFAULTS,
};

/** Default intent — all neutral. */
const DEFAULT_INTENT = {
  moveX: 0,
  jumpJustPressed: false,
  jumpPressed: false,
};

/**
 * Build a world with a player (index 0) and `enemyCount` enemy entities.
 *
 * Both players and enemies have the full platformer component set so the
 * query bench exercises a realistic workload.
 */
function makePlatformerWorld(enemyCount: number): PlatformerWorld {
  const total = 1 + enemyCount;
  const em = new EntityManager(total + 1);
  const cr = new ComponentRegistry();
  const qe = new QueryEngine();

  for (let i = 0; i <= enemyCount; i++) {
    const id = em.create();
    cr.add(id, Position, { x: i * 32, y: 0 });
    cr.add(id, PlatformerController, { ...DEFAULT_CTRL });
    cr.add(id, PlatformerIntent, { ...DEFAULT_INTENT });
  }

  return { em, cr, qe, physics: makeMockPhysics() };
}

// ---------------------------------------------------------------------------
// One-frame simulation — mirrors the hot path of PlatformerMovementSystem
// ---------------------------------------------------------------------------

/**
 * Simulate one game frame: query matching entities, read components, apply mock physics.
 *
 * This is a simplified version of PlatformerMovementSystem.onUpdate() that
 * measures the TS-side orchestration cost without requiring the full plugin system.
 */
function simulateFrame(world: PlatformerWorld): void {
  world.qe.invalidate();
  const entities = world.qe.resolve(
    [PlatformerController, PlatformerIntent, Position],
    world.em,
    world.cr,
  );

  for (const id of entities) {
    const ctrl = world.cr.get<PlatformerControllerData>(id, PlatformerController);
    const intent = world.cr.get<{ moveX: number; jumpJustPressed: boolean; jumpPressed: boolean }>(
      id,
      PlatformerIntent,
    );

    if (!ctrl || !intent) continue;

    const vel = world.physics.getLinearVelocity(id as EntityId);
    const targetVx = intent.moveX * ctrl.speed;
    const vy = vel?.y ?? 0;

    world.physics.setLinearVelocity(id as EntityId, targetVx, vy);
  }
}

// ---------------------------------------------------------------------------
// Pre-built worlds (outside bench() calls)
// ---------------------------------------------------------------------------

const WORLD_MINIMAL = makePlatformerWorld(0);
const WORLD_50 = makePlatformerWorld(50);
const WORLD_500 = makePlatformerWorld(500);

// ---------------------------------------------------------------------------
// Benchmark: full frame cost
// ---------------------------------------------------------------------------

describe('PlatformerKit — full frame (mocked physics)', () => {
  bench('frame with 1 player, 0 enemies (minimal scene)', () => {
    simulateFrame(WORLD_MINIMAL);
  });

  bench('frame with 1 player, 50 enemies', () => {
    simulateFrame(WORLD_50);
  });

  bench('frame with 1 player, 500 enemies (stress)', () => {
    simulateFrame(WORLD_500);
  });
});

// ---------------------------------------------------------------------------
// Benchmark: static geometry building
// ---------------------------------------------------------------------------

/**
 * Generate a list of `count` platform blocks distributed across a 1600×900 world.
 */
function makeBlocks(count: number): ReadonlyArray<PlatformerLevelBlock> {
  return Array.from({ length: count }, (_, i) => ({
    x: (i % 40) * 40 + 20,
    y: Math.floor(i / 40) * 64 + 32,
    w: 32,
    h: 16,
  }));
}

const BLOCKS_100 = makeBlocks(100);
const BLOCKS_1000 = makeBlocks(1_000);

const BASE_GEO_OPTS: Omit<BuildPlatformerStaticGeometryOptions, 'blocks'> = {
  worldWidthPx: 1_600,
  worldHeightPx: 3_200,
  tileSizePx: 16,
  chunkSizeTiles: 16,
};

describe('PlatformerKit — static geometry', () => {
  bench('buildPlatformerStaticGeometry() — 100 blocks', () => {
    buildPlatformerStaticGeometry({ ...BASE_GEO_OPTS, blocks: BLOCKS_100 });
  });

  bench('buildPlatformerStaticGeometry() — 1000 blocks', () => {
    buildPlatformerStaticGeometry({ ...BASE_GEO_OPTS, blocks: BLOCKS_1000 });
  });
});
