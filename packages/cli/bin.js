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

// Register jiti as a Node module loader hook unconditionally — both in dev
// (src/bin.ts) and in production (dist/bin.js). This ensures TypeScript
// workspace packages (e.g. @gwenjs/app with "type":"module") are transpiled
// when the dist CLI imports them as native ESM.
const __require = createRequire(import.meta.url);
const jitiDir = path.dirname(__require.resolve('jiti/package.json'));
const jitiHooksUrl = new URL(`file://${path.join(jitiDir, 'lib', 'jiti-register.mjs')}`);
register(jitiHooksUrl, import.meta.url);

// Production: compiled dist/ present → use it directly (unless GWEN_CLI_FORCE_JITI=1)
const distBin = path.join(__dirname, 'dist', 'packages', 'cli', 'src', 'bin.js');
if (!process.env.GWEN_CLI_FORCE_JITI && fs.existsSync(distBin)) {
  await import(distBin);
} else {
  // Dev monorepo: run src/bin.ts via jiti
  const { createJiti } = await import('jiti');
  const jiti = createJiti(import.meta.url, { interopDefault: true });
  await jiti.import(path.join(__dirname, 'src', 'bin.ts'));
}
