#!/usr/bin/env node

import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');
const pkgRoot = path.resolve(repoRoot, 'packages/physics2d');
const distRoot = path.resolve(pkgRoot, 'dist');
const jsonMode = process.argv.includes('--json');

const entries = [
  'index.js',
  'core.js',
  'helpers.js',
  'helpers-queries.js',
  'helpers-movement.js',
  'helpers-contact.js',
  'helpers-static-geometry.js',
  'helpers-orchestration.js',
  'tilemap.js',
  'debug.js',
];

execFileSync('pnpm', ['--filter', '@gwenjs/physics2d', 'build'], {
  cwd: repoRoot,
  stdio: 'pipe',
});

const sizes = {};
for (const entry of entries) {
  const fullPath = path.join(distRoot, entry);
  const stat = await fs.stat(fullPath);
  sizes[entry] = stat.size;
}

const report = {
  scenario: 'bundle-size-tree-shaking',
  package: '@gwenjs/physics2d',
  entries: sizes,
  rules: {
    coreNotLargerThanIndex: sizes['core.js'] <= sizes['index.js'],
    helpersNotLargerThanIndex: sizes['helpers.js'] <= sizes['index.js'],
    tilemapNotLargerThanIndex: sizes['tilemap.js'] <= sizes['index.js'],
    debugNotLargerThanIndex: sizes['debug.js'] <= sizes['index.js'],
    // Per-domain helper subpaths must each be smaller than index.
    // Note: helpers-orchestration embeds tilemap logic so it is compared to index, not helpers.
    queriesNotLargerThanHelpers: sizes['helpers-queries.js'] <= sizes['helpers.js'],
    movementNotLargerThanHelpers: sizes['helpers-movement.js'] <= sizes['helpers.js'],
    contactNotLargerThanHelpers: sizes['helpers-contact.js'] <= sizes['helpers.js'],
    staticGeometryNotLargerThanHelpers: sizes['helpers-static-geometry.js'] <= sizes['helpers.js'],
    orchestrationNotLargerThanIndex: sizes['helpers-orchestration.js'] <= sizes['index.js'],
  },
};

if (jsonMode) {
  console.log(JSON.stringify(report));
} else {
  console.log('[bench:physics:bundle-size] result');
  console.log(JSON.stringify(report, null, 2));
}

