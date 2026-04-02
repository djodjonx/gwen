/**
 * @module playgrounds-e2e.test
 * End-to-end Vitest test suite for @gwenjs/physics2d playground integration and perf regression.
 *
 * All tests are gated behind `BENCH_SLOW=1` because they:
 * - Invoke `tsc` / playground typecheck scripts (slow)
 * - Run the Rust `bench_solver_presets` binary via `cargo run` (very slow)
 *
 * ```sh
 * BENCH_SLOW=1 pnpm --filter @gwenjs/physics2d test:e2e:playgrounds
 * ```
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import { buildTilemapPhysicsChunks, patchTilemapPhysicsChunk } from '../src/index';
import { evaluatePerfGate } from './perf-score';
import type { PerfPayload, SolverPayload } from './perf-score';
import thresholds from './physics-perf-thresholds.json';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BENCH_SLOW = Boolean(process.env['BENCH_SLOW']);

const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const manifestPath = path.join(repoRoot, 'crates/gwen-core/Cargo.toml');
const baselinePath = path.join(
  repoRoot,
  'specs/enhance-physic/benchmarks/sprint-8-playgrounds-baseline.json',
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generates a deterministic synthetic terrain tile array.
 *
 * @param width  - Map width in tiles.
 * @param height - Map height in tiles.
 * @returns Flat tile array where 1 = solid, 0 = empty.
 */
function makeTiles(width: number, height: number): number[] {
  const tiles = new Array<number>(width * height).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (y > height - 5 || (y % 11 === 0 && x % 3 !== 0) || (x % 17 === 0 && y % 5 < 3)) {
        tiles[y * width + x] = 1;
      }
    }
  }
  return tiles;
}

/**
 * Collects a `PerfPayload` by running the Rust solver binary and timing tilemap functions.
 *
 * @returns A fully-populated `PerfPayload` ready for `evaluatePerfGate`.
 */
function collectPerfPayload(): PerfPayload {
  // --- Solver ---
  const solverRaw = execFileSync(
    'cargo',
    [
      'run',
      '--quiet',
      '--manifest-path',
      manifestPath,
      '--bin',
      'bench_solver_presets',
      '--features',
      'physics2d',
      '--',
      '--json',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  ).trim();

  const solver = JSON.parse(solverRaw) as SolverPayload;

  // --- Tilemap ---
  const MAP_WIDTH_TILES = 256;
  const MAP_HEIGHT_TILES = 128;
  const CHUNK_SIZE_TILES = 16;
  const TILE_SIZE_PX = 16;

  const tiles = makeTiles(MAP_WIDTH_TILES, MAP_HEIGHT_TILES);

  const t0 = performance.now();
  const baked = buildTilemapPhysicsChunks({
    tiles,
    mapWidthTiles: MAP_WIDTH_TILES,
    mapHeightTiles: MAP_HEIGHT_TILES,
    chunkSizeTiles: CHUNK_SIZE_TILES,
    tileSizePx: TILE_SIZE_PX,
  });
  const buildMs = performance.now() - t0;

  const patchedTiles = [...tiles];
  const patchX = 3 * CHUNK_SIZE_TILES + 2;
  const patchY = 2 * CHUNK_SIZE_TILES + 1;
  const idx = patchY * MAP_WIDTH_TILES + patchX;
  patchedTiles[idx] = patchedTiles[idx] === 0 ? 1 : 0;

  const p0 = performance.now();
  patchTilemapPhysicsChunk({
    source: {
      tiles: patchedTiles,
      mapWidthTiles: MAP_WIDTH_TILES,
      mapHeightTiles: MAP_HEIGHT_TILES,
      chunkSizeTiles: CHUNK_SIZE_TILES,
      tileSizePx: TILE_SIZE_PX,
    },
    chunkX: 3,
    chunkY: 2,
    previous: baked,
  });
  const patchMs = performance.now() - p0;

  return {
    solver,
    tilemap: { buildMs, patchMs },
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

/** Baseline structure loaded from `sprint-8-playgrounds-baseline.json`. */
interface Baseline {
  max: Record<string, number>;
}

/**
 * Playground end-to-end test suite.
 *
 * Verifies playground TypeScript compilation and that perf metrics do not
 * regress against the sprint-8 baseline.
 */
describe('playgrounds e2e', () => {
  it.skipIf(!BENCH_SLOW)(
    'mario-css playground typechecks',
    () => {
      execFileSync('pnpm', ['--dir', 'playground/mario-css', 'run', 'typecheck'], {
        cwd: repoRoot,
        stdio: 'pipe',
      });
    },
    300_000,
  );

  it.skipIf(!BENCH_SLOW)(
    'space-shooter-2 playground typechecks',
    () => {
      execFileSync('pnpm', ['--dir', 'playground/space-shooter-2', 'exec', 'tsc', '--noEmit'], {
        cwd: repoRoot,
        stdio: 'pipe',
      });
    },
    300_000,
  );

  it.skipIf(!BENCH_SLOW)(
    'perf score does not regress against sprint-8 baseline',
    async () => {
      const baselineRaw = await fs.readFile(baselinePath, 'utf8');
      const baseline = JSON.parse(baselineRaw) as Baseline;

      const perfPayload = collectPerfPayload();
      const report = evaluatePerfGate(perfPayload, thresholds);

      const metricNames = [
        'solverHighStepP95Ms',
        'solverHighTunnelRate',
        'solverEsportStepP95Ms',
        'tilemapBuildMs',
        'tilemapPatchMs',
      ] as const;

      for (const metricName of metricNames) {
        const measured = report.metrics[metricName]?.value;
        const baselineMax = baseline.max[metricName];
        if (measured !== null && measured !== undefined && baselineMax !== undefined) {
          expect(
            measured,
            `[GWEN] Perf regression: ${metricName}=${measured} exceeds sprint-8 baseline max=${baselineMax}`,
          ).toBeLessThanOrEqual(baselineMax);
        }
      }
    },
    300_000,
  );
});
