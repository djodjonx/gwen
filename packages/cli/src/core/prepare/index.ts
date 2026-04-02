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
import { logger, setLogLevel } from '../../utils/logger.js';
import { GwenApp, resolveGwenConfig } from '@gwenjs/app';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface PrepareOptions {
  /** Project root directory. Defaults to current working directory. */
  projectDir?: string;
  /** Enable detailed logging output */
  verbose?: boolean;
  /** Fail on validation errors (useful for CI) */
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
  if (options.strict) {
    logger.warn(
      '--strict has no effect in the module-first pipeline and will be removed in a future release.',
    );
  }
  const result: PrepareResult = { success: false, gwenDir, files: [], errors: [] };

  // 1. Resolve config
  let config: Awaited<ReturnType<typeof resolveGwenConfig>>;
  try {
    const configFile = [
      'gwen.config.ts',
      'gwen.config.js',
      'gwen.config.mjs',
      'gwen.config.cjs',
    ].find((f) => existsSync(path.join(projectDir, f)));
    if (!configFile) {
      result.errors.push(
        `No config file found in ${projectDir} (expected gwen.config.ts/.js/.mjs/.cjs)`,
      );
      return result;
    }
    // resolveGwenConfig re-discovers the config via c12 using the same search
    // order. The configFile guard above ensures at least one candidate exists,
    // making the dual-discovery safe.
    config = await resolveGwenConfig(projectDir);
  } catch (error) {
    result.errors.push(`Config error: ${getErrorMessage(error)}`);
    return result;
  }

  logger.debug(`Output: ${gwenDir}`);

  // 2. Run module setup + write .gwen/
  try {
    const app = new GwenApp();
    await app.setupModules(config);
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
