/**
 * @gwenjs/create — thin shim that delegates to `gwen init`.
 *
 * Running `npx @gwenjs/create [project-name] [...args]` is equivalent
 * to running `gwen init [project-name] [...args]`.  This package exists so
 * users can scaffold a new GWEN project without a global CLI installation:
 *
 * ```bash
 * pnpm create @gwenjs/create my-game
 * npm  create @gwenjs/create my-game
 * ```
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** Resolve the `gwen` CLI binary from the bundled `@gwenjs/cli` dependency. */
function resolveGwenBin(): string {
  const cliPkg = require.resolve('@gwenjs/cli/package.json');
  const cliDir = resolve(cliPkg, '..');
  const cliJson = require('@gwenjs/cli/package.json') as { bin?: Record<string, string> };
  const relBin = cliJson?.bin?.gwen ?? 'bin.js';
  return resolve(cliDir, relBin);
}

/**
 * Forward all CLI arguments to `gwen init`.
 *
 * @param args - Process arguments starting after `node <bin>` (i.e. `process.argv.slice(2)`).
 */
function main(args: string[]): void {
  const gwenBin = resolveGwenBin();
  const result = spawnSync(process.execPath, [gwenBin, 'init', ...args], {
    stdio: 'inherit',
    shell: false,
  });

  process.exit(result.status ?? 0);
}

main(process.argv.slice(2));
