/**
 * Plugin type references resolver
 * Collects and resolves type references from plugins declared in config
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { logger } from '../../utils/logger.js';
import type { GwenConfig } from '../../utils/validation.js';

/**
 * Collect type references from all plugins in config
 * Silently ignores plugins without metadata
 */
export async function collectPluginTypeReferences(
  projectDir: string,
  config: GwenConfig,
): Promise<string[]> {
  const refs = new Set<string>();

  for (const plugin of config.plugins ?? []) {
    try {
      const typeRefs = await readPluginGwenMeta(projectDir, plugin.packageName);
      for (const ref of typeRefs) {
        refs.add(ref);
        logger.debug(`📦 ${plugin.packageName} → typeRef: ${ref}`);
      }
    } catch {
      // Plugin without metadata — silently ignore
      logger.trace(`Plugin ${plugin.packageName} has no gwen metadata`);
    }
  }

  return Array.from(refs);
}

/**
 * Read GWEN metadata from a plugin's package.json
 * Looks for gwen.typeReferences field
 */
async function readPluginGwenMeta(projectDir: string, packageName: string): Promise<string[]> {
  let dir = projectDir;

  // Search up to 5 levels for node_modules
  for (let i = 0; i < 5; i++) {
    const pkgJsonPath = path.join(dir, 'node_modules', packageName, 'package.json');
    if (existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(await fs.readFile(pkgJsonPath, 'utf-8')) as {
          gwen?: { typeReferences?: string[] };
        };
        return pkg.gwen?.typeReferences ?? [];
      } catch (error) {
        logger.trace(`Failed to parse ${pkgJsonPath}`, error);
        return [];
      }
    }
    dir = path.dirname(dir);
  }

  return [];
}
