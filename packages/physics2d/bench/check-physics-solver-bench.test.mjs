#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

const raw = execFileSync('node', ['./packages/physics2d/bench/bench-physics2d-solver.mjs', '--json'], {
  cwd: repoRoot,
  encoding: 'utf8',
}).trim();

const payload = JSON.parse(raw);
if (payload.scenario !== 'solver-presets' || !Array.isArray(payload.results) || payload.results.length !== 4) {
  throw new Error(`Invalid solver bench payload: ${raw}`);
}

for (const row of payload.results) {
  if (typeof row.stepP50Ms !== 'number' || row.stepP50Ms <= 0) {
    throw new Error(`Invalid stepP50Ms for ${row.preset}: ${raw}`);
  }
  if (typeof row.stepP95Ms !== 'number' || row.stepP95Ms < row.stepP50Ms) {
    throw new Error(`Invalid stepP95Ms for ${row.preset}: ${raw}`);
  }
  if (typeof row.tunnelRate !== 'number' || row.tunnelRate < 0 || row.tunnelRate > 1) {
    throw new Error(`Invalid tunnelRate for ${row.preset}: ${raw}`);
  }
  if (typeof row.stabilityJitterM !== 'number' || row.stabilityJitterM < 0) {
    throw new Error(`Invalid stabilityJitterM for ${row.preset}: ${raw}`);
  }
}

const byPreset = Object.fromEntries(payload.results.map((row) => [row.preset, row]));
if (byPreset.high.tunnelRate > byPreset.low.tunnelRate || byPreset.esport.tunnelRate > byPreset.low.tunnelRate) {
  throw new Error(`Expected high/esport to be no worse than low on tunnel rate: ${raw}`);
}
if (byPreset.esport.solverIterations < byPreset.high.solverIterations) {
  throw new Error(`Expected esport solver iterations >= high: ${raw}`);
}

console.log('✅ check-physics-solver-bench.test.mjs passed');

