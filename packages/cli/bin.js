#!/usr/bin/env node
/**
 * GWEN CLI — wrapper bin
 *
 * Utilise jiti (comme Nuxt) pour exécuter src/bin.ts directement
 * sans étape de compilation. En production, dist/bin.js est utilisé.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Production : dist/ compilé présent → l'utiliser directement (sauf si GWEN_CLI_FORCE_JITI=1)
const distBin = path.join(__dirname, 'dist', 'packages', 'cli', 'src', 'bin.js');
if (!process.env.GWEN_CLI_FORCE_JITI && fs.existsSync(distBin)) {
  await import(distBin);
} else {
  // Dev monorepo : exécuter src/bin.ts via jiti (comme Nuxt)
  const { createJiti } = await import('jiti');
  const jiti = createJiti(import.meta.url, { interopDefault: true });
  await jiti.import(path.join(__dirname, 'src', 'bin.ts'));
}
