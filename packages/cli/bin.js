#!/usr/bin/env node
/**
 * GWEN CLI — bin wrapper
 *
 * Uses jiti (like Nuxt) to run src/bin.ts directly
 * without a compilation step. In production, dist/bin.js is used.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire, register } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Register jiti as a Node module loader hook unconditionally so TypeScript
// workspace packages are transpilable in both dev and dist paths.
const __require = createRequire(import.meta.url);
const jitiDir = path.dirname(__require.resolve('jiti/package.json'));
const jitiHooksUrl = new URL(`file://${path.join(jitiDir, 'lib', 'jiti-register.mjs')}`);
register(jitiHooksUrl, import.meta.url);

// In the GWEN monorepo, workspace packages export TypeScript source directly
// (e.g. @gwenjs/app exports ./src/index.ts). The dist CLI cannot import these
// as native ESM because jiti hooks output CJS which breaks static ESM named
// imports. Always use jiti in monorepo context.
const isMonorepo = fs.existsSync(path.join(__dirname, '../../pnpm-workspace.yaml'));

// Production: compiled dist/ present AND not in monorepo → use dist directly
const distBin = path.join(__dirname, 'dist', 'packages', 'cli', 'src', 'bin.js');
if (!process.env.GWEN_CLI_FORCE_JITI && !isMonorepo && fs.existsSync(distBin)) {
  await import(distBin);
} else {
  // Dev monorepo (or GWEN_CLI_FORCE_JITI=1): run src/bin.ts via jiti
  const { createJiti } = await import('jiti');
  const jiti = createJiti(import.meta.url, { interopDefault: true });
  await jiti.import(path.join(__dirname, 'src', 'bin.ts'));
}
