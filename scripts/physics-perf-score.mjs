#!/usr/bin/env node

import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const thresholdsPath = path.resolve(__dirname, 'physics-perf-thresholds.json');

function parseArgs(argv) {
  const args = { json: false, input: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    if (arg === '--input') args.input = argv[i + 1];
    if (arg === '--input') i += 1;
  }
  return args;
}

async function loadThresholds() {
  return JSON.parse(await fs.readFile(thresholdsPath, 'utf8'));
}

function runJsonCommand(command, args) {
  const raw = execFileSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
  return JSON.parse(raw);
}

function collectBenchPayload() {
  const solver = runJsonCommand('node', ['./scripts/bench-physics2d-solver.mjs', '--json']);
  const tilemap = runJsonCommand('node', ['./scripts/bench-physics2d-tilemap.mjs', '--json']);
  return { solver, tilemap };
}

export function evaluatePerfGate(payload, thresholds) {
  const high = payload.solver.results.find((row) => row.preset === 'high');
  const esport = payload.solver.results.find((row) => row.preset === 'esport');
  if (!high || !esport) {
    throw new Error('Perf score requires `high` and `esport` rows from solver bench payload.');
  }

  const defs = thresholds.metrics;
  const measuredMetrics = {
    solverHighStepP95Ms: {
      value: high.stepP95Ms,
      threshold: defs.solverHighStepP95Ms.max,
      weight: defs.solverHighStepP95Ms.weight,
      unit: 'ms',
      pass: high.stepP95Ms <= defs.solverHighStepP95Ms.max,
    },
    solverHighTunnelRate: {
      value: high.tunnelRate,
      threshold: defs.solverHighTunnelRate.max,
      weight: defs.solverHighTunnelRate.weight,
      unit: 'ratio',
      pass: high.tunnelRate <= defs.solverHighTunnelRate.max,
    },
    solverEsportStepP95Ms: {
      value: esport.stepP95Ms,
      threshold: defs.solverEsportStepP95Ms.max,
      weight: defs.solverEsportStepP95Ms.weight,
      unit: 'ms',
      pass: esport.stepP95Ms <= defs.solverEsportStepP95Ms.max,
    },
    tilemapBuildMs: {
      value: payload.tilemap.buildMs,
      threshold: defs.tilemapBuildMs.max,
      weight: defs.tilemapBuildMs.weight,
      unit: 'ms',
      pass: payload.tilemap.buildMs <= defs.tilemapBuildMs.max,
    },
    tilemapPatchMs: {
      value: payload.tilemap.patchMs,
      threshold: defs.tilemapPatchMs.max,
      weight: defs.tilemapPatchMs.weight,
      unit: 'ms',
      pass: payload.tilemap.patchMs <= defs.tilemapPatchMs.max,
    },
  };

  const reservedMetrics = {
    droppedEvents: {
      value: null,
      threshold: null,
      weight: 0,
      unit: 'count',
      pass: true,
      status: thresholds.reserved?.droppedEvents ?? 'reserved',
    },
    allocations: {
      value: null,
      threshold: null,
      weight: 0,
      unit: 'count',
      pass: true,
      status: thresholds.reserved?.allocations ?? 'reserved',
    },
  };

  const totalWeight = Object.values(measuredMetrics).reduce((sum, item) => sum + item.weight, 0);
  const passedWeight = Object.values(measuredMetrics).reduce(
    (sum, item) => sum + (item.pass ? item.weight : 0),
    0,
  );

  return {
    version: thresholds.version,
    verdict: Object.values(measuredMetrics).every((item) => item.pass) ? 'pass' : 'fail',
    score: totalWeight === 0 ? 100 : Number(((passedWeight / totalWeight) * 100).toFixed(2)),
    metrics: {
      ...measuredMetrics,
      ...reservedMetrics,
    },
    payload,
  };
}

export async function loadPayloadFromFile(filePath) {
  return JSON.parse(await fs.readFile(path.resolve(repoRoot, filePath), 'utf8'));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const thresholds = await loadThresholds();
  const payload = args.input ? await loadPayloadFromFile(args.input) : collectBenchPayload();
  const report = evaluatePerfGate(payload, thresholds);

  if (args.json) {
    console.log(JSON.stringify(report));
    return;
  }

  console.log('[bench:physics:score] result');
  console.log(`verdict=${report.verdict} score=${report.score}`);
  for (const [name, metric] of Object.entries(report.metrics)) {
    if (metric.value === null) {
      console.log(`- ${name}: ${metric.status}`);
      continue;
    }
    console.log(
      `- ${name}: value=${metric.value}${metric.unit === 'ms' ? 'ms' : ''} threshold<=${metric.threshold}${metric.unit === 'ms' ? 'ms' : ''} pass=${metric.pass}`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

