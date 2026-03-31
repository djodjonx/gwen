#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const manifestPath = path.resolve(repoRoot, 'crates/gwen-core/Cargo.toml');
const jsonMode = process.argv.includes('--json');

const args = [
  'run',
  '--quiet',
  '--manifest-path',
  manifestPath,
  '--bin',
  'bench_solver_presets',
  '--features',
  'physics2d',
  '--',
];

if (jsonMode) {
  args.push('--json');
}

const output = execFileSync('cargo', args, {
  cwd: repoRoot,
  encoding: 'utf8',
});

process.stdout.write(output);

