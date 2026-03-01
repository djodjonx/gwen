#!/usr/bin/env node
/**
 * @gwen/cli — Exécutable en ligne de commande
 *
 * Usage:
 *   gwen build              # Build le projet dans le dossier courant
 *   gwen build --release    # Build en mode release (défaut)
 *   gwen build --debug      # Build en mode debug
 *   gwen build --verbose    # Logs détaillés
 *   gwen build --dry-run    # Simule le build sans exécuter wasm-pack
 *   gwen info               # Affiche la config parsée sans builder
 */

import process from 'node:process';
import { findConfigFile, parseConfigFile } from './config-parser.js';
import { build } from './builder.js';

const [, , command = 'build', ...rawArgs] = process.argv;

const flags = {
  verbose: rawArgs.includes('--verbose') || rawArgs.includes('-v'),
  dryRun: rawArgs.includes('--dry-run'),
  debug: rawArgs.includes('--debug'),
  release: rawArgs.includes('--release'),
};

async function main() {
  switch (command) {
    case 'build': {
      const result = await build({
        projectDir: process.cwd(),
        mode: flags.debug ? 'debug' : 'release',
        verbose: flags.verbose,
        dryRun: flags.dryRun,
      });
      process.exit(result.success ? 0 : 1);
      break;
    }

    case 'info': {
      const configPath = findConfigFile(process.cwd());
      if (!configPath) {
        console.error('No engine.config.ts or gwen.config.ts found.');
        process.exit(1);
      }
      const parsed = parseConfigFile(configPath);
      console.log(JSON.stringify(parsed, null, 2));
      break;
    }

    default:
      console.log(`
GWEN Engine CLI v0.1.0

Usage:
  gwen build [options]   Build the project (parse config + compile WASM + generate manifest)
  gwen info              Print parsed engine.config.ts as JSON

Options:
  --release   Build in release mode (default, optimized)
  --debug     Build in debug mode (faster compile, larger output)
  --verbose   Show detailed build logs
  --dry-run   Parse and plan without running wasm-pack
      `.trim());
      break;
  }
}

main().catch(err => {
  console.error('[gwen] Unexpected error:', err);
  process.exit(1);
});

