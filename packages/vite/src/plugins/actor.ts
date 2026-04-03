import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import type { GwenViteOptions } from '../types.js';

const ACTORS_VIRTUAL = 'virtual:gwen/actors';
const RESOLVED_ACTORS = '\0' + ACTORS_VIRTUAL;

/**
 * Generates the `virtual:gwen/actors` module source.
 * Each actor file becomes a lazy `() => import(path)` entry.
 *
 * @param actorFiles - Absolute paths to actor source files.
 * @returns ESM module source string.
 *
 * @internal Exported for unit tests.
 *
 * @example
 * ```ts
 * generateActorsModule(['/project/src/actors/enemy.ts']);
 * // => "export const actors = [\n  () => import('/project/src/actors/enemy.ts'),\n];\n"
 * ```
 */
export function generateActorsModule(actorFiles: string[]): string {
  if (actorFiles.length === 0) {
    return 'export const actors = [];\n';
  }
  const entries = actorFiles.map((f) => `  () => import('${f}')`).join(',\n');
  return `export const actors = [\n${entries},\n];\n`;
}

/**
 * Injects debug names into `defineActor(...)` and `definePrefab(...)` calls
 * using simple regex transforms.
 *
 * For each `const Foo = defineActor(...)` pattern, injects the variable name
 * as a comment arg so runtime tools can surface human-readable names.
 *
 * @param code - Source code to transform.
 * @returns Transformed source code (same reference if no patterns found).
 *
 * @internal Exported for unit tests.
 *
 * @example
 * ```ts
 * transformActorNames(`const EnemyActor = defineActor(EnemyPrefab, () => {});`);
 * // => `const EnemyActor = defineActor(/* __actorName__: "EnemyActor" * / EnemyPrefab, () => {});`
 * ```
 */
export function transformActorNames(code: string): string {
  if (!code.includes('defineActor') && !code.includes('definePrefab')) {
    return code;
  }
  return code
    .replace(
      /\bconst\s+(\w+)\s*=\s*defineActor\s*\(/g,
      (_match, name: string) => `const ${name} = defineActor(/* __actorName__: "${name}" */ `,
    )
    .replace(
      /\bconst\s+(\w+)\s*=\s*definePrefab\s*\(/g,
      (_match, name: string) => `const ${name} = definePrefab(/* __prefabName__: "${name}" */ `,
    );
}

/**
 * Recursively scans a directory for actor source files (`.ts`, excluding
 * `.test.ts` and `.d.ts`).
 *
 * @param dir - Absolute path to the directory to scan.
 * @returns Sorted list of absolute file paths.
 */
function scanActorDir(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const result: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      result.push(...scanActorDir(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.d.ts')) {
      result.push(full);
    }
  }
  return result;
}

/**
 * GWEN sub-plugin for actor auto-discovery, virtual module generation, and HMR.
 *
 * - Provides `virtual:gwen/actors` with lazy imports for all files in `src/actors/`
 * - Invalidates the virtual module on file changes in the actors directory
 * - Injects `__actorName__` and `__prefabName__` debug names via simple transforms
 *
 * Disabled (no-op) if `options.actors` is not set.
 *
 * @param options - Top-level GWEN Vite plugin options.
 * @returns Vite plugin instance.
 *
 * @example vite.config.ts
 * ```ts
 * import { defineConfig } from 'vite';
 * import { gwenVitePlugin } from '@gwenjs/vite';
 *
 * export default defineConfig({
 *   plugins: [gwenVitePlugin({ actors: { dir: 'src/actors', hmr: true } })],
 * });
 * ```
 */
export function gwenActorPlugin(options: GwenViteOptions): Plugin {
  if (!options.actors) {
    return { name: 'gwen:actor' };
  }

  const actorDir = options.actors.dir ?? 'src/actors';
  const hmrEnabled = options.actors.hmr !== false;
  let root = process.cwd();

  return {
    name: 'gwen:actor',

    configResolved(config) {
      root = config.root;
    },

    resolveId(id) {
      if (id === ACTORS_VIRTUAL) return RESOLVED_ACTORS;
    },

    load(id) {
      if (id !== RESOLVED_ACTORS) return;
      return generateActorsModule(scanActorDir(resolve(root, actorDir)));
    },

    handleHotUpdate({ file, server }: { file: string; server: ViteDevServer }) {
      if (!hmrEnabled) return;
      if (!file.startsWith(resolve(root, actorDir))) return;
      const mod = server.moduleGraph.getModuleById(RESOLVED_ACTORS);
      if (mod) {
        server.moduleGraph.invalidateModule(mod);
        server.hot.send({ type: 'full-reload' });
      }
    },

    transform(code, id) {
      if (!id.startsWith(resolve(root, actorDir))) return;
      const transformed = transformActorNames(code);
      if (transformed === code) return;
      return { code: transformed, map: null };
    },
  };
}
