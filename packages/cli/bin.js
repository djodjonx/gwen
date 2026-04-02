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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Production: compiled dist/ present → use it directly (unless GWEN_CLI_FORCE_JITI=1)
const distBin = path.join(__dirname, 'dist', 'packages', 'cli', 'src', 'bin.js');
if (!process.env.GWEN_CLI_FORCE_JITI && fs.existsSync(distBin)) {
  await import(distBin);
} else {
  // Dev monorepo: run src/bin.ts via jiti (like Nuxt)
  const { createJiti } = await import('jiti');
  const jiti = createJiti(import.meta.url, { interopDefault: true });
  await jiti.import(path.join(__dirname, 'src', 'bin.ts'));
}
