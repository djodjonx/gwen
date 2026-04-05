/**
 * Prepare operation — module-first pipeline (RFC-004 / RFC-010).
 *
 * Delegates type generation to GwenApp.prepare() which writes:
 *   .gwen/types/auto-imports.d.ts
 *   .gwen/types/env.d.ts
 *   .gwen/types/module-augments.d.ts
 *   .gwen/types/<module>.d.ts  (per addTypeTemplate call)
 *   .gwen/tsconfig.json
 */

import fs from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { logger, setLogLevel } from '../../utils/logger.js';
import { GwenApp, resolveGwenConfig } from '@gwenjs/app/resolve';
import type { GwenModule } from '@gwenjs/kit';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface PrepareOptions {
  /** Project root directory. Defaults to current working directory. */
  projectDir?: string;
  /** Enable detailed logging output */
  verbose?: boolean;
  /** @deprecated No-op — hard-fail on module errors is now always the default. */
  strict?: boolean;
}

export interface PrepareResult {
  /** True if all files were generated successfully */
  success: boolean;
  /** Path to generated .gwen/ directory */
  gwenDir: string;
  /** List of generated file paths */
  files: string[];
  /** List of error messages if generation failed */
  errors: string[];
}

export async function prepare(options: PrepareOptions = {}): Promise<PrepareResult> {
  const projectDir = path.resolve(options.projectDir ?? process.cwd());
  const gwenDir = path.join(projectDir, '.gwen');

  if (options.verbose) {
    setLogLevel({ verbose: true });
  }

  const result: PrepareResult = { success: false, gwenDir, files: [], errors: [] };

  // 1. Resolve config
  let config: Awaited<ReturnType<typeof resolveGwenConfig>>;
  try {
    config = await resolveGwenConfig(projectDir);
  } catch (error) {
    result.errors.push(`Config error: ${getErrorMessage(error)}`);
    return result;
  }

  logger.debug(`Output: ${gwenDir}`);

  // 2. Run module setup + write .gwen/
  // Use jiti to load modules from the project directory. This avoids two problems:
  //   a) jiti (in the CLI's bin.js monorepo mode) transpiles import() to require(),
  //      which fails for packages that only have "import" in their exports conditions.
  //   b) Without an explicit base, Node.js resolves specifiers from @gwenjs/app's
  //      location, not the project's node_modules.
  try {
    const { createJiti } = await import('jiti');
    const jiti = createJiti(pathToFileURL(path.join(projectDir, '__placeholder__')).href, {
      interopDefault: true,
    });
    const moduleLoader = async (name: string): Promise<GwenModule> => {
      const raw = (await jiti.import(name)) as { default?: unknown } & Record<string, unknown>;
      const mod = (raw?.default ?? raw) as GwenModule;
      return mod;
    };

    const app = new GwenApp();
    await app.setupModules(config, moduleLoader);
    await app.prepare(projectDir);
  } catch (error) {
    result.errors.push(`Module setup error: ${getErrorMessage(error)}`);
    return result;
  }

  // 3. Collect generated files
  const typesDir = path.join(gwenDir, 'types');
  if (existsSync(typesDir)) {
    for (const f of readdirSync(typesDir, { recursive: true }) as string[]) {
      result.files.push(path.join(typesDir, f));
    }
  }
  const gwenTsconfig = path.join(gwenDir, 'tsconfig.json');
  if (existsSync(gwenTsconfig)) result.files.push(gwenTsconfig);

  // 4. Patch project tsconfig.json
  try {
    await ensureProjectTsconfig(projectDir);
  } catch (error) {
    logger.warn(`Failed to update tsconfig: ${getErrorMessage(error)}`);
  }

  // 5. Patch .gitignore
  try {
    await ensureGitignore(projectDir);
  } catch (error) {
    logger.warn(`Failed to update .gitignore: ${getErrorMessage(error)}`);
  }

  result.success = true;
  logger.success(`.gwen/ generated (${result.files.length} files)`);
  return result;
}

async function ensureProjectTsconfig(projectDir: string): Promise<void> {
  const tsconfigPath = path.join(projectDir, 'tsconfig.json');
  const relExtends = './.gwen/tsconfig.json';

  if (!existsSync(tsconfigPath)) {
    await fs.writeFile(
      tsconfigPath,
      JSON.stringify({ extends: relExtends, include: ['src', '*.ts'] }, null, 2) + '\n',
      'utf-8',
    );
    logger.debug('✅ tsconfig.json created');
    return;
  }

  const raw = await fs.readFile(tsconfigPath, 'utf-8');
  let tsconfig: Record<string, unknown>;
  try {
    tsconfig = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    logger.warn('tsconfig.json is not valid JSON — skipping patch');
    return;
  }

  if (tsconfig['extends'] !== relExtends) {
    tsconfig['extends'] = relExtends;
    await fs.writeFile(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n', 'utf-8');
    logger.debug('✅ tsconfig.json patched to extend .gwen/tsconfig.json');
  }
}

async function ensureGitignore(projectDir: string): Promise<void> {
  const gitignorePath = path.join(projectDir, '.gitignore');
  const entry = '.gwen/';

  if (!existsSync(gitignorePath)) {
    await fs.writeFile(gitignorePath, `${entry}\nnode_modules/\ndist/\n`, 'utf-8');
    return;
  }

  const content = await fs.readFile(gitignorePath, 'utf-8');
  if (!content.includes(entry)) {
    await fs.appendFile(gitignorePath, `\n# GWEN generated\n${entry}\n`);
  }
}
