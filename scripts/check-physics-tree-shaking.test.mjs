#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const raw = execFileSync('node', ['./scripts/bench-physics2d-bundle-size.mjs', '--json'], {
  cwd: repoRoot,
  encoding: 'utf8',
}).trim();

const report = JSON.parse(raw);
if (!report?.entries || !report?.rules) {
  throw new Error(`Invalid bundle-size report payload: ${raw}`);
}

for (const [name, size] of Object.entries(report.entries)) {
  if (typeof size !== 'number' || size <= 0) {
    throw new Error(`Invalid size for ${name}: ${raw}`);
  }
}

for (const [rule, pass] of Object.entries(report.rules)) {
  if (pass !== true) {
    throw new Error(`Tree-shaking size rule failed (${rule}): ${raw}`);
  }
}

console.log('✅ check-physics-tree-shaking.test.mjs passed');

