/**
 * @gwen/cli — gwen format
 *
 * Lance oxfmt sur le répertoire src/ du projet utilisateur.
 * Lit `.oxfmtrc.json` si présent à la racine du projet.
 */

import { spawnSync } from 'node:child_process';

export interface FormatOptions {
  check?: boolean;
  path?: string;
}

export function format(opts: FormatOptions = {}): void {
  const cwd = process.cwd();
  const target = opts.path ?? 'src';
  const checkArgs = opts.check ? ['--check'] : [];

  const args = [...checkArgs, target];

  const result = spawnSync('oxfmt', args, { cwd, stdio: 'inherit', shell: true });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
