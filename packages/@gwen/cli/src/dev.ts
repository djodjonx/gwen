/**
 * @gwen/cli — dev
 *
 * Lance le serveur de développement Vite depuis gwen.config.ts.
 * L'utilisateur n'a pas de vite.config.ts — GWEN le génère en mémoire.
 *
 * Usage : gwen dev [--port 3000] [--open]
 */

import path from 'node:path';
import { findConfigFile } from './config-parser.js';
import { prepare } from './prepare.js';
import { buildViteConfig } from './vite-config-builder.js';

export interface DevOptions {
  projectDir?: string;
  port?: number;
  open?: boolean;
  verbose?: boolean;
}

export async function dev(options: DevOptions = {}): Promise<void> {
  const projectDir = path.resolve(options.projectDir ?? process.cwd());
  const port = options.port ?? 3000;

  // 1. Vérifier la config
  const configPath = findConfigFile(projectDir);
  if (!configPath) {
    console.error('[gwen dev] ❌ gwen.config.ts not found');
    process.exit(1);
  }

  // 2. Prepare — génère .gwen/ (types, tsconfig)
  await prepare({ projectDir, verbose: options.verbose });

  // 3. Construire la config Vite en mémoire depuis gwen.config.ts
  const viteConfig = await buildViteConfig(projectDir, configPath, {
    mode: 'development',
    port,
    open: options.open ?? false,
  });

  // 4. Lancer Vite programmatiquement
  const { createServer } = await import('vite');
  const server = await createServer(viteConfig);
  await server.listen();
  server.printUrls();

  console.log(`\n[gwen dev] 🚀 GWEN dev server running on http://localhost:${port}`);
}
