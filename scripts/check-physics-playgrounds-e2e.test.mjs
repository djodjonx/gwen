#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const baselinePath = path.resolve(
  repoRoot,
  'specs/enhance-physic/benchmarks/sprint-8-playgrounds-baseline.json',
);

function run(command, args, cwd = repoRoot) {
  execFileSync(command, args, { cwd, stdio: 'pipe' });
}

run('pnpm', ['--dir', 'playground/mario-css', 'run', 'typecheck']);
run('pnpm', ['--dir', 'playground/space-shooter-2', 'exec', 'tsc', '--noEmit']);

const scoreRaw = execFileSync('node', ['./scripts/physics-perf-score.mjs', '--json'], {
  cwd: repoRoot,
  encoding: 'utf8',
}).trim();
const score = JSON.parse(scoreRaw);
const baseline = JSON.parse(await fs.readFile(baselinePath, 'utf8'));

const checks = {
  solverHighStepP95Ms:
    score.metrics.solverHighStepP95Ms.value <= baseline.max.solverHighStepP95Ms,
  solverHighTunnelRate:
    score.metrics.solverHighTunnelRate.value <= baseline.max.solverHighTunnelRate,
  solverEsportStepP95Ms:
    score.metrics.solverEsportStepP95Ms.value <= baseline.max.solverEsportStepP95Ms,
  tilemapBuildMs: score.metrics.tilemapBuildMs.value <= baseline.max.tilemapBuildMs,
  tilemapPatchMs: score.metrics.tilemapPatchMs.value <= baseline.max.tilemapPatchMs,
};

const failed = Object.entries(checks)
  .filter(([, pass]) => !pass)
  .map(([name]) => name);

if (failed.length > 0) {
  throw new Error(
    `Playground e2e baseline regression on: ${failed.join(', ')}. score=${scoreRaw}`,
  );
}

console.log('✅ check-physics-playgrounds-e2e.test.mjs passed');

