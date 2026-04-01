/**
 * package-manager — detect and invoke the project's package manager.
 *
 * Detects which package manager is in use by checking for lock files in the
 * current working directory (or an optional override), then runs install
 * commands through that package manager via `execa`.
 *
 * @example
 * ```typescript
 * const pm = detectPackageManager()          // 'pnpm'
 * await runInstall(['@gwenengine/physics'])   // pnpm add @gwenengine/physics
 * ```
 */

import fs from 'node:fs';
import path from 'node:path';
import { execa } from 'execa';

/** Supported package managers. */
export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun';

/**
 * Detects the package manager used in the current project by looking for
 * well-known lock files in `process.cwd()`.
 *
 * Detection order (first match wins):
 * 1. `pnpm-lock.yaml` → pnpm
 * 2. `yarn.lock`      → yarn
 * 3. `bun.lockb`      → bun
 * 4. fallback         → npm
 *
 * @param cwd - Directory to inspect. Defaults to `process.cwd()`.
 * @returns The detected {@link PackageManager} identifier.
 */
export function detectPackageManager(cwd?: string): PackageManager {
  const dir = cwd ?? process.cwd();

  if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(dir, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(dir, 'bun.lockb'))) return 'bun';
  return 'npm';
}

/**
 * Options for {@link runInstall}.
 */
export interface RunInstallOptions {
  /**
   * Install as a devDependency.
   * @default false
   */
  dev?: boolean;
  /**
   * Working directory in which to run the install command.
   * @default process.cwd()
   */
  cwd?: string;
}

/**
 * Runs an install command for the detected package manager.
 *
 * Maps to:
 * - pnpm: `pnpm add [--save-dev] <packages>`
 * - npm:  `npm install [--save-dev] <packages>`
 * - yarn: `yarn add [--dev] <packages>`
 * - bun:  `bun add [--dev] <packages>`
 *
 * @param packages - List of package names to install.
 * @param options  - Optional install flags and cwd override.
 */
export async function runInstall(
  packages: string[],
  options: RunInstallOptions = {},
): Promise<void> {
  const { dev = false, cwd = process.cwd() } = options;
  const pm = detectPackageManager(cwd);

  const devFlag: Record<PackageManager, string> = {
    pnpm: '--save-dev',
    npm: '--save-dev',
    yarn: '--dev',
    bun: '--dev',
  };

  const addSubCommand: Record<PackageManager, string> = {
    pnpm: 'add',
    npm: 'install',
    yarn: 'add',
    bun: 'add',
  };

  const args = [addSubCommand[pm], ...packages];
  if (dev) args.push(devFlag[pm]);

  await execa(pm, args, { cwd, stdio: 'inherit' });
}
