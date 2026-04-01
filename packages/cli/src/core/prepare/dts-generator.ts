/**
 * Type definitions generation for GWEN projects.
 * Generates gwen.d.ts with global type interfaces from config.
 *
 * Phase 1.1 — Nuxt-like approach:
 * - Generates direct imports from plugin metadata (serviceTypes, hookTypes)
 * - Falls back to GwenConfigServices inference for legacy plugins
 * - Injects typed service/hook properties into GwenDefaultServices/GwenDefaultHooks
 */

import type { CollectedPluginTypingMeta } from './plugin-resolver.js';

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
  _projectDir: string,
  _configPath: string,
  pluginTypingMeta: CollectedPluginTypingMeta = {
    typeReferences: [],
    serviceTypes: {},
    hookTypes: {},
    prefabExtensionTypes: {},
    sceneExtensionTypes: {},
    uiExtensionTypes: {},
  },
): Promise<string> {
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

  const prefabEntries = Object.entries(pluginTypingMeta.prefabExtensionTypes).map(
    ([name, ref]) => ({
      name,
      from: ref.from,
      exportName: ref.exportName,
    }),
  );

  const sceneEntries = Object.entries(pluginTypingMeta.sceneExtensionTypes).map(([name, ref]) => ({
    name,
    from: ref.from,
    exportName: ref.exportName,
  }));

  const uiEntries = Object.entries(pluginTypingMeta.uiExtensionTypes).map(([name, ref]) => ({
    name,
    from: ref.from,
    exportName: ref.exportName,
  }));

  const { imports, aliases } = buildTypeImports([
    ...serviceEntries.map((s) => ({ from: s.from, exportName: s.exportName })),
    ...hookEntries.map((h) => ({ from: h.from, exportName: h.exportName })),
    ...prefabEntries.map((e) => ({ from: e.from, exportName: e.exportName })),
    ...sceneEntries.map((e) => ({ from: e.from, exportName: e.exportName })),
    ...uiEntries.map((e) => ({ from: e.from, exportName: e.exportName })),
  ]);

  const serviceOverrides = serviceEntries
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const alias = aliases.get(`${entry.from}::${entry.exportName}`) ?? entry.exportName;
      return `    ${entry.name}: ${alias};`;
    })
    .join('\n');

  const hookExtendsAliases = hookEntries
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => aliases.get(`${entry.from}::${entry.exportName}`) ?? entry.exportName);

  const prefabOverrides = prefabEntries
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const alias = aliases.get(`${entry.from}::${entry.exportName}`) ?? entry.exportName;
      return `    ${entry.name}: ${alias};`;
    })
    .join('\n');

  const sceneOverrides = sceneEntries
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const alias = aliases.get(`${entry.from}::${entry.exportName}`) ?? entry.exportName;
      return `    ${entry.name}: ${alias};`;
    })
    .join('\n');

  const uiOverrides = uiEntries
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const alias = aliases.get(`${entry.from}::${entry.exportName}`) ?? entry.exportName;
      return `    ${entry.name}: ${alias};`;
    })
    .join('\n');

  const uniqueHookExtends = [...new Set(hookExtendsAliases)];

  const refBlock =
    pluginTypingMeta.typeReferences.length > 0
      ? pluginTypingMeta.typeReferences.map((r) => `/// <reference types="${r}" />`).join('\n') +
        '\n\n'
      : '';

  const directImportBlock = imports.length > 0 ? `${imports.join('\n')}\n\n` : '';
  const serviceBody = serviceOverrides ? `\n${serviceOverrides}\n` : '';
  const prefabBody = prefabOverrides ? `\n${prefabOverrides}\n` : '';
  const sceneBody = sceneOverrides ? `\n${sceneOverrides}\n` : '';
  const uiBody = uiOverrides ? `\n${uiOverrides}\n` : '';
  const hookExtendsClause =
    uniqueHookExtends.length > 0 ? ` extends ${uniqueHookExtends.join(', ')}` : '';

  return `/**
 * GWEN - Global Auto-Generated Types
 * Generated by \`gwen prepare\` - DO NOT MODIFY
 * Source: gwen.config.ts
 *
 * Generated from plugin metadata (services, hooks, extensions).
 * This avoids circular typing between gwen.config.ts and .gwen/gwen.d.ts.
 */
${refBlock}${directImportBlock}import type { EngineAPI } from '@gwenengine/schema';

declare global {
  interface GwenDefaultServices {${serviceBody}  }

  interface GwenDefaultHooks${hookExtendsClause} {  }

  interface GwenPrefabExtensions {${prefabBody}  }

  interface GwenSceneExtensions {${sceneBody}  }

  interface GwenUIExtensions {${uiBody}  }

  type GwenAPI = EngineAPI<GwenDefaultServices, GwenDefaultHooks>;
  type GwenServices = GwenDefaultServices;

  const __GWEN_VERSION__: string;
  const __GWEN_DEV__: boolean;
}

export {};
`;
}
