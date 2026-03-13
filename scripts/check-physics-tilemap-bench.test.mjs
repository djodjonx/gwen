#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

// Build plugin dist first so the bench can import dist/index.js reliably.
execFileSync('pnpm', ['--filter', '@djodjonx/gwen-plugin-physics2d', 'build'], {
  cwd: repoRoot,
  stdio: 'pipe',
});

const raw = execFileSync('node', ['./scripts/bench-physics2d-tilemap.mjs', '--json'], {
  cwd: repoRoot,
  encoding: 'utf8',
}).trim();

const payload = JSON.parse(raw);

if (typeof payload.buildMs !== 'number' || payload.buildMs <= 0) {
  throw new Error(`Invalid buildMs from tilemap bench: ${raw}`);
}
if (typeof payload.patchMs !== 'number' || payload.patchMs <= 0) {
  throw new Error(`Invalid patchMs from tilemap bench: ${raw}`);
}
if (payload.changedChunkChecksumBefore === payload.changedChunkChecksumAfter) {
  throw new Error(`Expected changed chunk checksum to differ after patch: ${raw}`);
}

console.log('✅ check-physics-tilemap-bench.test.mjs passed');

