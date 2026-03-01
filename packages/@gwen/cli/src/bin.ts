#!/usr/bin/env node
/**
 * @gwen/cli — Exécutable en ligne de commande
 *
 * Usage:
 *   gwen prepare            Génère .gwen/ (tsconfig + types)
 *   gwen dev                Démarre le serveur de dev (Vite offusqué)
 *   gwen build              Build production (WASM + bundle)
 *   gwen preview            Prévisualise le build production
 *
 * All configuration lives in gwen.config.ts — no vite.config.ts needed.
 */

import process from 'node:process';
import { prepare } from './prepare.js';
import { dev }     from './dev.js';
import { build }   from './builder.js';

const args    = process.argv.slice(2);
const command = args[0] ?? 'help';

function hasFlag(flag: string): boolean { return args.includes(flag); }
function getFlag(flag: string, fallback: string): string {
  const idx = args.indexOf(flag);
  return (idx !== -1 && args[idx + 1]) ? args[idx + 1] : fallback;
}

const verbose = hasFlag('--verbose') || hasFlag('-v');
const port    = parseInt(getFlag('--port', '3000'), 10);

async function main() {
  switch (command) {

    case 'prepare': {
      const result = await prepare({ verbose });
      if (!result.success) {
        for (const e of result.errors) console.error('[gwen]', e);
        process.exit(1);
      }
      break;
    }

    case 'dev': {
      await dev({ port, open: hasFlag('--open'), verbose });
      break;
    }

    case 'build': {
      await prepare({ verbose });
      const result = await build({
        mode:    hasFlag('--debug') ? 'debug' : 'release',
        outDir:  hasFlag('--out-dir') ? getFlag('--out-dir', 'dist') : undefined,
        verbose,
        dryRun:  hasFlag('--dry-run'),
      });
      if (!result.success) {
        for (const e of result.errors) console.error('[gwen]', e);
        process.exit(1);
      }
      break;
    }

    case 'preview': {
      const { preview } = await import('vite');
      await preview({ root: process.cwd(), configFile: false });
      break;
    }

    case 'info': {
      const { findConfigFile, parseConfigFile } = await import('./config-parser.js');
      const configPath = findConfigFile(process.cwd());
      if (!configPath) { console.error('gwen.config.ts not found'); process.exit(1); }
      const parsed = parseConfigFile(configPath);
      console.log(JSON.stringify(parsed, null, 2));
      break;
    }

    default: {
      console.log(`
╔═══════════════════════════════════╗
║  GWEN Game Engine CLI  v0.1.0     ║
╚═══════════════════════════════════╝

Usage: gwen <command> [options]

Commands:
  prepare       Generate .gwen/ (tsconfig + types)
  dev           Start dev server (Vite abstracted)
  build         Production build (WASM + bundle)
  preview       Preview production build
  info          Show parsed gwen.config.ts

Options:
  --port <n>    Dev server port (default: 3000)
  --open        Open browser on start
  --debug       Build in debug mode (faster, larger WASM)
  --out-dir     Output directory (default: dist/)
  --verbose     Show detailed logs
  --dry-run     Simulate without writing files

All config lives in gwen.config.ts — no vite.config.ts needed.
`);
      if (command !== 'help' && command !== '--help' && command !== '-h') {
        console.error(`Unknown command: ${command}`);
        process.exit(1);
      }
    }
  }
}

main().catch(err => {
  console.error('[gwen]', err instanceof Error ? err.message : err);
  process.exit(1);
});
