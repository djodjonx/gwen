#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { evaluatePerfGate } from './physics-perf-score.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const thresholds = JSON.parse(
  await fs.readFile(path.resolve(__dirname, 'physics-perf-thresholds.json'), 'utf8'),
);

const nominalRaw = execFileSync('node', ['./scripts/physics-perf-score.mjs', '--json'], {
  cwd: repoRoot,
  encoding: 'utf8',
}).trim();
const nominal = JSON.parse(nominalRaw);
assert.equal(nominal.verdict, 'pass', `Expected nominal perf gate to pass: ${nominalRaw}`);
assert.equal(typeof nominal.score, 'number');
assert.equal(nominal.score > 0, true);

const degradedPayload = {
  solver: {
    scenario: 'solver-presets',
    results: [
      { preset: 'low', stepP95Ms: 1, tunnelRate: 1 },
      { preset: 'medium', stepP95Ms: 1, tunnelRate: 1 },
      { preset: 'high', stepP95Ms: 99, tunnelRate: 0.5 },
      { preset: 'esport', stepP95Ms: 99, tunnelRate: 0.5 },
    ],
  },
  tilemap: {
    buildMs: 9999,
    patchMs: 999,
  },
};
const degraded = evaluatePerfGate(degradedPayload, thresholds);
assert.equal(degraded.verdict, 'fail');
assert.equal(degraded.metrics.solverHighTunnelRate.pass, false);
assert.equal(degraded.metrics.tilemapBuildMs.pass, false);

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'physics-perf-score-'));
const degradedPath = path.join(tempDir, 'degraded.json');
await fs.writeFile(degradedPath, JSON.stringify(degradedPayload), 'utf8');

const degradedCliRaw = execFileSync(
  'node',
  ['./scripts/physics-perf-score.mjs', '--json', '--input', degradedPath],
  {
    cwd: repoRoot,
    encoding: 'utf8',
  },
).trim();
const degradedCli = JSON.parse(degradedCliRaw);
assert.equal(degradedCli.verdict, 'fail');

console.log('✅ check-physics-perf-score.test.mjs passed');

