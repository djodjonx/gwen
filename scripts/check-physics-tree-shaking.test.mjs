#!/usr/bin/env node
/**
 * Tree-shaking baseline check for @djodjonx/gwen-plugin-physics2d.
 *
 * Pass logic:
 * - Runs bench-physics2d-bundle-size with --json to get all dist entry sizes.
 * - For each size rule, the check passes only if the rule evaluates to `true`.
 * - If any rule fails (e.g. a helper subpath is larger than the full helpers bundle),
 *   the script throws and exits non-zero — failing CI.
 *
 * Domain isolation rules verified:
 * - helpers/queries, helpers/movement, helpers/contact, helpers/static-geometry
 *   must each be strictly <= helpers bundle (pure re-export + one domain).
 * - helpers/orchestration bundles tilemap logic so it is compared to index (not helpers).
 * - queries import must not include orchestration chunk code (size rule proxy).
 * - movement import must not include tilemap helpers (size rule proxy).
 * - aggregate helpers import may include all domains.
 */

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

