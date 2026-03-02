/**
 * @gwen/cli — gwen lint
 *
 * Lance oxlint sur le répertoire src/ du projet utilisateur.
 * Lit `oxlint.json` si présent à la racine du projet.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export interface LintOptions {
  fix?: boolean;
  path?: string;
}

export function lint(opts: LintOptions = {}): void {
  const cwd = process.cwd();
  const target = opts.path ?? 'src';
  const hasConf = fs.existsSync(path.join(cwd, 'oxlint.json'));
  const confArgs = hasConf ? ['--config', 'oxlint.json'] : [];
  const fixArgs = opts.fix ? ['--fix'] : [];

  const args = [...confArgs, ...fixArgs, target];

  // Résoudre oxlint depuis les deps de @gwen/cli (toujours disponible)
  const result = spawnSync('oxlint', args, { cwd, stdio: 'inherit', shell: true });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
