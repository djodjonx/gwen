/**
 * Prepare operation orchestrator
 * Generates .gwen/ folder with TypeScript configuration and type definitions
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { loadGwenConfig } from '../config.js';
import { logger } from '../../utils/logger.js';
import { generateTsconfig } from './tsconfig-generator.js';
import { generateDts } from './dts-generator.js';
import { generateIndexHtml } from './html-generator.js';
import { collectPluginTypingMeta } from './plugin-resolver.js';
import { extractProjectMetadata } from './ast-extractor.js';
import { validateMetadata } from './validator.js';
import { runPluginSetups, GwenSetupError } from '../setup/setup-runner.js';
import type { GwenOptions } from '@gwenengine/schema';

/**
 * Options for the prepare command
 */
export interface PrepareOptions {
  /**
   * Project root directory. Defaults to current working directory.
   */
  projectDir?: string;
  /**
   * Enable detailed logging output
   */
  verbose?: boolean;
  /**
   * Fail on validation errors (useful for CI)
   */
  strict?: boolean;
}

/**
 * Result of prepare operation
 */
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

/**
 * Generate the .gwen/ folder from gwen.config.ts
 *
 * Generates TypeScript configuration and type definitions for the project.
 * Creates:
 * - .gwen/tsconfig.generated.json — Complete tsconfig with strict settings
 * - .gwen/gwen.d.ts — Global type definitions
 * - .gwen/index.html — Generated HTML entry
 *
 * @param options Configuration options
 * @returns Promise<PrepareResult> with success status and generated files
 */
export async function prepare(options: PrepareOptions = {}): Promise<PrepareResult> {
  const projectDir = path.resolve(options.projectDir ?? process.cwd());
  const gwenDir = path.join(projectDir, '.gwen');
  const result: PrepareResult = { success: false, gwenDir, files: [], errors: [] };

  // 1. Load config
  let config: GwenOptions;
  let configPath: string;
  try {
    const loaded = await loadGwenConfig(projectDir);
    config = loaded.config;
    configPath = loaded.configPath;
  } catch (error: any) {
    result.errors.push(`Config error: ${error.message}`);
    return result;
  }

  logger.debug(`Config: ${configPath}`);
  logger.debug(`Output: ${gwenDir}`);

  // 1.5. Run plugin setups
  try {
    await runPluginSetups(projectDir, config);
  } catch (err) {
    if (err instanceof GwenSetupError) {
      result.errors.push(`[setup:${err.pluginName}] ${err.message}`);
      return result;
    }
    throw err;
  }

  // 1.7. AST extraction and validation
  let extractedMeta;
  try {
    extractedMeta = extractProjectMetadata(projectDir);
    const validationErrors = validateMetadata(extractedMeta);

    for (const err of validationErrors) {
      const msg = `${err.severity === 'error' ? '❌' : '⚠️'} [AST] ${err.message} (${path.relative(projectDir, err.file)}:${err.line})`;
      if (err.severity === 'error') {
        result.errors.push(msg);
        if (err.suggestion) logger.info(`   ${err.suggestion}`);
      } else {
        logger.warn(msg);
      }
    }

    if (options.strict && validationErrors.some((e) => e.severity === 'error')) {
      return result;
    }
  } catch (error: any) {
    logger.warn(`AST extraction failed: ${error.message}. Falling back to default metadata.`);
  }

  // 2. Ensure .gwen/ directory exists
  await fs.mkdir(gwenDir, { recursive: true });

  // 3. Generate files
  try {
    await generateTsconfigFile(gwenDir, projectDir, result);
    await generateDtsFile(gwenDir, projectDir, config, configPath, extractedMeta, result);
    await generateHtmlFile(gwenDir, config.html ?? {}, result);
  } catch (error: any) {
    result.errors.push(error.message);
    return result;
  }

  // 4. Update project tsconfig
  try {
    await ensureProjectTsconfig(projectDir, gwenDir);
  } catch (error: any) {
    logger.warn(`Failed to update tsconfig: ${error.message}`);
  }

  // 5. Update .gitignore
  try {
    await ensureGitignore(projectDir);
  } catch (error: any) {
    logger.warn(`Failed to update .gitignore: ${error.message}`);
  }

  result.success = true;
  logger.success(`.gwen/ generated (${result.files.length} files)`);
  return result;
}

// ── File Generation Helpers ────────────────────────────────────────────────────

/**
 * Generate and write tsconfig.generated.json
 */
async function generateTsconfigFile(
  gwenDir: string,
  projectDir: string,
  result: PrepareResult,
): Promise<void> {
  const filePath = path.join(gwenDir, 'tsconfig.generated.json');
  const content = generateTsconfig(projectDir);
  await fs.writeFile(filePath, JSON.stringify(content, null, 2), 'utf-8');
  result.files.push(filePath);
  logger.debug(`✅ ${path.relative(projectDir, filePath)}`);
}

/**
 * Generate and write gwen.d.ts
 */
async function generateDtsFile(
  gwenDir: string,
  projectDir: string,
  config: GwenOptions,
  configPath: string,
  extractedMeta: any, // type from ast-extractor.js
  result: PrepareResult,
): Promise<void> {
  const pluginTypingMeta = await collectPluginTypingMeta(projectDir, config);

  // Merge services extracted from AST (for local plugins)
  if (extractedMeta && extractedMeta.pluginServices) {
    for (const [name, service] of extractedMeta.pluginServices.entries()) {
      if (!pluginTypingMeta.serviceTypes[name]) {
        pluginTypingMeta.serviceTypes[name] = {
          from: service.from,
          exportName: service.exportName,
        };
        logger.debug(`📦 (AST) -> serviceType: ${name} => ${service.from}#${service.exportName}`);
      }
    }
  }

  const filePath = path.join(gwenDir, 'gwen.d.ts');
  const content = await generateDts(projectDir, configPath, pluginTypingMeta);
  await fs.writeFile(filePath, content, 'utf-8');
  result.files.push(filePath);
  logger.debug(`✅ ${path.relative(projectDir, filePath)}`);
}

/**
 * Generate and write index.html
 */
async function generateHtmlFile(
  gwenDir: string,
  htmlConfig: Record<string, any>,
  result: PrepareResult,
): Promise<void> {
  const filePath = path.join(gwenDir, 'index.html');
  const content = generateIndexHtml(path.dirname(gwenDir), htmlConfig);
  await fs.writeFile(filePath, content, 'utf-8');
  result.files.push(filePath);
  logger.debug(`✅ ${path.relative(path.dirname(gwenDir), filePath)}`);
}

// ── Project File Updates ───────────────────────────────────────────────────────

/**
 * Ensure project tsconfig.json extends .gwen/tsconfig.generated.json
 */
async function ensureProjectTsconfig(projectDir: string, _gwenDir: string): Promise<void> {
  const tsconfigPath = path.join(projectDir, 'tsconfig.json');
  const relExtends = './.gwen/tsconfig.generated.json';

  if (!existsSync(tsconfigPath)) {
    // Create minimal tsconfig.json that extends generated
    const minimal = {
      extends: relExtends,
      compilerOptions: {},
      include: ['src', '*.ts'],
    };
    await fs.writeFile(tsconfigPath, JSON.stringify(minimal, null, 2), 'utf-8');
    logger.debug(`✅ tsconfig.json created (extends .gwen/)`);
    return;
  }

  // Read existing tsconfig and ensure it extends .gwen/
  const raw = await fs.readFile(tsconfigPath, 'utf-8');

  interface TsConfig {
    extends?: string;
    compilerOptions?: Record<string, any>;
    include?: string[];
    exclude?: string[];
    [key: string]: any;
  }

  let tsconfig: TsConfig;
  try {
    tsconfig = JSON.parse(raw) as TsConfig;
  } catch {
    logger.warn(`tsconfig.json is not valid JSON — skipping extends patch`);
    return;
  }

  if (tsconfig.extends !== relExtends) {
    tsconfig.extends = relExtends;

    // Remove redundant compiler options now covered by generated
    if (tsconfig.compilerOptions) {
      delete tsconfig.compilerOptions.paths;
      delete tsconfig.compilerOptions.baseUrl;
      delete tsconfig.compilerOptions.target;
      delete tsconfig.compilerOptions.module;
      delete tsconfig.compilerOptions.moduleResolution;

      // Remove empty compilerOptions
      if (Object.keys(tsconfig.compilerOptions).length === 0) {
        delete tsconfig.compilerOptions;
      }
    }

    await fs.writeFile(tsconfigPath, JSON.stringify(tsconfig, null, 2), 'utf-8');
    logger.debug(`✅ tsconfig.json patched to extend .gwen/tsconfig.generated.json`);
  }
}

/**
 * Ensure .gitignore includes .gwen/
 */
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
