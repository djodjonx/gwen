/**
 * Type definitions generation for GWEN projects.
 * Generates gwen.d.ts with global type interfaces from config.
 *
 * Phase 1.1 — Nuxt-like approach:
 * - Generates direct imports from plugin metadata (serviceTypes, hookTypes)
 * - Falls back to GwenConfigServices inference for legacy plugins
 * - Injects typed service/hook properties into GwenDefaultServices/GwenDefaultHooks
 */

import * as path from 'node:path';
import fs from 'node:fs/promises';
import type { CollectedPluginTypingMeta } from './plugin-resolver.js';

/**
 * Detect export style of config file (default vs named export)
 */
function detectConfigExportStyle(
  source: string,
): { type: 'default' } | { type: 'named'; name: string } {
  if (/export\s+default\s+defineConfig\s*\(/.test(source)) return { type: 'default' };
  const match = source.match(/export\s+const\s+(\w+)\s*=\s*defineConfig\s*\(/);
  if (match) return { type: 'named', name: match[1] };
  return { type: 'default' };
}

interface GeneratedImport {
  from: string;
  exportName: string;
  alias: string;
}

/**
 * Build stable type imports and unique aliases for generated declarations.
 */
function buildTypeImports(entries: Array<{ from: string; exportName: string }>): {
  imports: string[];
  aliases: Map<string, string>;
} {
  const byModule = new Map<string, GeneratedImport[]>();
  const usedAliases = new Set<string>();
  const aliases = new Map<string, string>();

  for (const entry of entries) {
    const key = `${entry.from}::${entry.exportName}`;
    if (aliases.has(key)) continue;

    let alias = entry.exportName;
    let i = 2;
    while (usedAliases.has(alias)) {
      alias = `${entry.exportName}_${i}`;
      i++;
    }

    usedAliases.add(alias);
    aliases.set(key, alias);

    const list = byModule.get(entry.from) ?? [];
    list.push({ from: entry.from, exportName: entry.exportName, alias });
    byModule.set(entry.from, list);
  }

  const imports = [...byModule.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([from, symbols]) => {
      const specifiers = symbols
        .sort((a, b) => a.exportName.localeCompare(b.exportName))
        .map((s) => (s.alias === s.exportName ? s.exportName : `${s.exportName} as ${s.alias}`))
        .join(', ');
      return `import type { ${specifiers} } from '${from}';`;
    });

  return { imports, aliases };
}

/**
 * Generate gwen.d.ts content with Phase 1.1 approach (Nuxt-like).
 *
 * Generates:
 * 1. Direct imports from serviceTypes/hookTypes metadata
 * 2. Fallback inference via GwenConfigServices<typeof _cfg>
 * 3. Interface augmentations with typed properties
 */
export async function generateDts(
  projectDir: string,
  configPath: string,
  pluginTypingMeta: CollectedPluginTypingMeta = {
    typeReferences: [],
    serviceTypes: {},
    hookTypes: {},
  },
): Promise<string> {
  const relConfig = path
    .relative(path.join(projectDir, '.gwen'), configPath)
    .replace(/\\/g, '/')
    .replace(/\.ts$/, '');

  const source = await fs.readFile(configPath, 'utf-8');
  const exportStyle = detectConfigExportStyle(source);

  const configImport =
    exportStyle.type === 'default'
      ? `import type _cfg from '${relConfig}';`
      : `import type { ${exportStyle.name} as _cfg } from '${relConfig}';`;

  // ════════════════════════════════════════════════════════════════════════════
  // Phase 1.1 — Direct imports from metadata (Nuxt-like approach)
  // ════════════════════════════════════════════════════════════════════════════

  const serviceEntries = Object.entries(pluginTypingMeta.serviceTypes).map(([name, ref]) => ({
    name,
    from: ref.from,
    exportName: ref.exportName,
  }));

  const hookEntries = Object.entries(pluginTypingMeta.hookTypes).map(([name, ref]) => ({
    name,
    from: ref.from,
    exportName: ref.exportName,
  }));

  const { imports, aliases } = buildTypeImports([
    ...serviceEntries.map((s) => ({ from: s.from, exportName: s.exportName })),
    ...hookEntries.map((h) => ({ from: h.from, exportName: h.exportName })),
  ]);

  // Build service property overrides (direct imports take priority)
  const serviceOverrides = serviceEntries
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const alias = aliases.get(`${entry.from}::${entry.exportName}`) ?? entry.exportName;
      return `    ${entry.name}: ${alias};`;
    })
    .join('\n');

  // Build hook property overrides (direct imports take priority)
  const hookOverrides = hookEntries
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const alias = aliases.get(`${entry.from}::${entry.exportName}`) ?? entry.exportName;
      return `    '${entry.name}': ${alias};`;
    })
    .join('\n');

  // ════════════════════════════════════════════════════════════════════════════
  // Type references (vite-env etc)
  // ════════════════════════════════════════════════════════════════════════════

  const refBlock =
    pluginTypingMeta.typeReferences.length > 0
      ? pluginTypingMeta.typeReferences.map((r) => `/// <reference types="${r}" />`).join('\n') +
        '\n\n'
      : '';

  const directImportBlock = imports.length > 0 ? `${imports.join('\n')}\n\n` : '';
  const serviceBody = serviceOverrides ? `\n${serviceOverrides}\n` : '';
  const hookBody = hookOverrides ? `\n${hookOverrides}\n` : '';

  // ════════════════════════════════════════════════════════════════════════════
  // Generate final gwen.d.ts with fallback + overrides
  // ════════════════════════════════════════════════════════════════════════════

  return `/**
 * GWEN - Global Auto-Generated Types
 * Generated by \`gwen prepare\` - DO NOT MODIFY
 * Source: gwen.config.ts
 *
 * Architecture (Phase 1.1 — Nuxt-like):
 * - Direct imports from plugin metadata when available
 * - Fallback inference via GwenConfigServices<typeof _cfg>
 * - Service/hook overrides take priority over fallback
 *
 * This makes all define* (defineSystem, defineUI, defineScene, definePrefab)
 * automatically typed - no explicit annotation required.
 */
${refBlock}${directImportBlock}import type { GwenConfigServices, GwenConfigHooks } from '@gwen/engine-core';
import type { EngineAPI } from '@gwen/schema';
${configImport}

type _FallbackServices = GwenConfigServices<typeof _cfg>;
type _FallbackHooks = GwenConfigHooks<typeof _cfg>;

declare global {
  /**
   * Enriches GwenDefaultServices with project services.
   * Uses direct imports when metadata is available and fallback inference otherwise.
   * Direct imports (bottom) override fallback (extends).
   */
  interface GwenDefaultServices extends _FallbackServices {${serviceBody}  }

  /**
   * Enriches GwenDefaultHooks with plugin hooks.
   * Uses direct imports when metadata is available and fallback inference otherwise.
   */
  interface GwenDefaultHooks extends _FallbackHooks {${hookBody}  }

  /**
   * Convenience alias for EngineAPI<GwenDefaultServices, GwenDefaultHooks>.
   */
  type GwenAPI = EngineAPI<GwenDefaultServices, GwenDefaultHooks>;

  /**
   * @deprecated Use GwenAPI or let TypeScript infer automatically.
   */
  type GwenServices = GwenDefaultServices;

  const __GWEN_VERSION__: string;
  const __GWEN_DEV__: boolean;
}

export {};
`;
}
