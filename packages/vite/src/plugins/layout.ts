import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import type { GwenViteOptions } from '../types.js';

const LAYOUTS_VIRTUAL = 'virtual:gwen/layouts';
const RESOLVED_LAYOUTS = '\0' + LAYOUTS_VIRTUAL;

/**
 * Options for the `gwen:layout` sub-plugin.
 */
export interface GwenLayoutOptions {
  /**
   * Glob patterns for layout source files.
   * @default ['src/layouts/**\/*.ts', 'src/**\/*.layout.ts']
   */
  include?: string[];

  /**
   * Disable debug name injection (default: false).
   * When `false`, `defineLayout(...)` calls are wrapped with `Object.assign(..., { __layoutName__: 'Name' })`.
   * @default false
   */
  disableNameInjection?: boolean;
}

/**
 * Generates the `virtual:gwen/layouts` module source.
 * Each layout file with `defineLayout(...)` becomes a lazy `() => import(path)` entry.
 *
 * @param layoutMap - Map of layout names to absolute file paths.
 * @returns ESM module source string.
 *
 * @internal Exported for unit tests.
 *
 * @example
 * ```ts
 * generateLayoutsModule(new Map([['Level1', '/project/src/layouts/level-1.ts']]));
 * // => "export const layouts = {\n  'Level1': () => import('/project/src/layouts/level-1.ts'),\n};\n"
 * ```
 */
export function generateLayoutsModule(layoutMap: Map<string, string>): string {
  if (layoutMap.size === 0) {
    return 'export const layouts = {};\n';
  }

  const entries = Array.from(layoutMap.entries())
    .map(([name, path]) => `  '${name}': () => import('${path}')`)
    .join(',\n');

  return `export const layouts = {\n${entries},\n};\n`;
}

/**
 * Injects debug names into `defineLayout(...)` calls using `Object.assign()`.
 *
 * For each `const Foo = defineLayout(...)` pattern, wraps the call with:
 * `Object.assign(defineLayout(...), { __layoutName__: 'Foo' })`
 *
 * This allows runtime tools to surface human-readable layout names for debugging.
 *
 * @param code - Source code to transform.
 * @returns Transformed source code (same reference if no patterns found).
 *
 * @internal Exported for unit tests.
 *
 * @example
 * ```ts
 * transformLayoutNames(`const Level1 = defineLayout(() => { ... })`);
 * // => `const Level1 = Object.assign(defineLayout(() => { ... }), { __layoutName__: 'Level1' })`
 * ```
 */
export function transformLayoutNames(code: string): string {
  if (!code.includes('defineLayout')) {
    return code;
  }

  // Strategy: Find `const Name = defineLayout` and wrap the entire expression
  // For single-line simple cases:
  // const Level1 = defineLayout(() => {...})
  // becomes:
  // const Level1 = Object.assign(defineLayout(() => {...}), { __layoutName__: 'Level1' })

  let result = code;

  // Pattern for single-line or simple multi-line defineLayout
  // This handles: const Name = defineLayout(... potentially spanning lines)
  const pattern = /(\bconst\s+(\w+)\s*=\s*)defineLayout(\s*\((?:[^()]*|\([^()]*\))*?\))/g;

  result = result.replace(pattern, (match, prefix, name, defCall) => {
    return `${prefix}Object.assign(defineLayout${defCall}, { __layoutName__: '${name}' })`;
  });

  return result;
}

/**
 * Extracts layout names from source code by finding `defineLayout(...)` patterns.
 *
 * Looks for:
 * - `const Name = defineLayout(...)`
 * - `export const Name = defineLayout(...)`
 *
 * @param code - Source code to scan.
 * @returns Set of found layout names.
 *
 * @internal Exported for unit tests.
 */
export function extractLayoutNames(code: string): Set<string> {
  const names = new Set<string>();
  const pattern = /\b(?:export\s+)?const\s+(\w+)\s*=\s*defineLayout\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(code)) !== null) {
    names.add(match[1]);
  }

  return names;
}

/**
 * Recursively scans directories for layout source files (`.ts`, excluding
 * `.test.ts` and `.d.ts`).
 *
 * @param dir - Absolute path to the directory to scan.
 * @returns Array of absolute file paths.
 */
function scanLayoutDir(dir: string): string[] {
  if (!existsSync(dir)) return [];

  const result: string[] = [];

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);

    if (statSync(full).isDirectory()) {
      result.push(...scanLayoutDir(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.d.ts')) {
      result.push(full);
    }
  }

  return result;
}

/**
 * GWEN sub-plugin for layout virtual module generation and debug name injection.
 *
 * **Phase 1 (current):**
 * - Provides `virtual:gwen/layouts` with a registry of layouts found in layout files
 * - Injects `__layoutName__` debug names via `Object.assign()` wrapping
 * - Optionally invalidates the virtual module on file changes
 *
 * **Phase 2 (future):**
 * - bulkSpawn transform optimization for efficient batch spawning
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
 *   plugins: [gwenVitePlugin()],
 * });
 * ```
 */
export function gwenLayoutPlugin(options: GwenViteOptions): Plugin {
  if (!options.layout) {
    return { name: 'gwen:layout' };
  }

  const include = options.layout.include ?? ['src/layouts/**/*.ts', 'src/**/*.layout.ts'];
  const disableNameInjection = options.layout.disableNameInjection ?? false;
  let root = process.cwd();

  // Build a set of layout directories from include patterns
  const layoutDirs = new Set<string>();
  for (const pattern of include) {
    // Extract the base directory from the pattern (before any wildcards)
    const basePath = pattern.split('**')[0].replace(/\/$/, '');
    if (basePath) {
      layoutDirs.add(resolve(root, basePath));
    }
  }

  return {
    name: 'gwen:layout',

    configResolved(config) {
      root = config.root;
    },

    resolveId(id) {
      if (id === LAYOUTS_VIRTUAL) return RESOLVED_LAYOUTS;
    },

    load(id) {
      if (id !== RESOLVED_LAYOUTS) return;

      const layoutMap = new Map<string, string>();

      // Scan layout directories for files
      for (const dir of layoutDirs) {
        const files = scanLayoutDir(dir);

        for (const file of files) {
          // Read the file to extract layout names
          try {
            // Dynamic import to read file content
            const fs = require('node:fs');
            const code = fs.readFileSync(file, 'utf-8');
            const names = extractLayoutNames(code);

            for (const name of names) {
              layoutMap.set(name, file);
            }
          } catch {
            // Silently skip files that can't be read
          }
        }
      }

      return generateLayoutsModule(layoutMap);
    },

    handleHotUpdate({ file, server }: { file: string; server: ViteDevServer }) {
      // Check if the file is in one of our layout directories
      for (const dir of layoutDirs) {
        if (!file.startsWith(dir)) continue;

        const mod = server.moduleGraph.getModuleById(RESOLVED_LAYOUTS);
        if (mod) {
          server.moduleGraph.invalidateModule(mod);
          server.hot.send({ type: 'full-reload' });
        }
        break;
      }
    },

    transform(code, id) {
      if (disableNameInjection) return;

      // Check if the file is in one of our layout directories
      let inLayoutDir = false;
      for (const dir of layoutDirs) {
        if (id.startsWith(dir)) {
          inLayoutDir = true;
          break;
        }
      }

      if (!inLayoutDir) return;

      const transformed = transformLayoutNames(code);
      if (transformed === code) return;

      return { code: transformed, map: null };
    },
  };
}
