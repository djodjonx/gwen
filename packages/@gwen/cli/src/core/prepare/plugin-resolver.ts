/**
 * Plugin type references resolver
 * Collects and resolves type references from plugins declared in config
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { logger } from '../../utils/logger.js';
import type { GwenConfig } from '../../utils/validation.js';

export interface GwenTypeRefMeta {
  from: string;
  exportName: string;
}

export interface CollectedPluginTypingMeta {
  typeReferences: string[];
  serviceTypes: Record<string, GwenTypeRefMeta>;
  hookTypes: Record<string, GwenTypeRefMeta>;
}

interface PluginGwenMeta {
  typeReferences?: string[];
  serviceTypes?: Record<string, GwenTypeRefMeta>;
  hookTypes?: Record<string, GwenTypeRefMeta>;
}

/**
 * Collect type metadata from all plugins in config.
 * Silently ignores plugins without metadata.
 */
export async function collectPluginTypingMeta(
  projectDir: string,
  config: GwenConfig,
): Promise<CollectedPluginTypingMeta> {
  const typeReferences = new Set<string>();
  const serviceTypes: Record<string, GwenTypeRefMeta> = {};
  const hookTypes: Record<string, GwenTypeRefMeta> = {};

  for (const plugin of config.plugins ?? []) {
    try {
      // Use meta from plugin instance if available, otherwise fallback to package.json
      let meta: PluginGwenMeta = {};

      if ('meta' in plugin && plugin.meta) {
        meta = plugin.meta as PluginGwenMeta;
      } else if ('packageName' in plugin && plugin.packageName) {
        meta = await readPluginGwenMeta(projectDir, plugin.packageName as string);
      } else {
        const pluginName = 'name' in plugin ? (plugin as any).name : 'unknown';
        logger.trace(`Plugin ${pluginName} has no meta and no packageName`);
        continue;
      }

      const pluginId =
        'packageName' in plugin ? (plugin.packageName as string) : (plugin.name as string);

      for (const ref of meta.typeReferences ?? []) {
        typeReferences.add(ref);
        logger.debug(`📦 ${pluginId} -> typeRef: ${ref}`);
      }

      for (const [serviceName, ref] of Object.entries(meta.serviceTypes ?? {})) {
        serviceTypes[serviceName] = ref;
        logger.debug(
          `📦 ${pluginId} -> serviceType: ${serviceName} => ${ref.from}#${ref.exportName}`,
        );
      }

      for (const [hookName, ref] of Object.entries(meta.hookTypes ?? {})) {
        hookTypes[hookName] = ref;
        logger.debug(`📦 ${pluginId} -> hookType: ${hookName} => ${ref.from}#${ref.exportName}`);
      }
    } catch {
      logger.trace(
        `Plugin ${'packageName' in plugin ? plugin.packageName : plugin.name} has no gwen metadata`,
      );
    }
  }

  return {
    typeReferences: Array.from(typeReferences),
    serviceTypes,
    hookTypes,
  };
}

/**
 * Read GWEN metadata from a plugin's package.json.
 */
async function readPluginGwenMeta(
  projectDir: string,
  packageName: string,
): Promise<PluginGwenMeta> {
  let dir = projectDir;

  // Search up to 5 levels for node_modules
  for (let i = 0; i < 5; i++) {
    const pkgJsonPath = path.join(dir, 'node_modules', packageName, 'package.json');
    if (existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(await fs.readFile(pkgJsonPath, 'utf-8')) as {
          gwen?: PluginGwenMeta;
        };
        return pkg.gwen ?? {};
      } catch (error) {
        logger.trace(`Failed to parse ${pkgJsonPath}`, error);
        return {};
      }
    }
    dir = path.dirname(dir);
  }

  return {};
}
