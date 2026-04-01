import type { Plugin } from 'vite';

const CORE_IMPORT = '@djodjonx/gwen-engine-core';

export interface GwenTransformOptions {
  /** Enable compile-time transforms for defineComponent schemas. */
  compileComponents?: boolean;
  /** Enable compile-time transforms for defineSystem/query descriptors. */
  compileSystems?: boolean;
  /** Enable optional auto-import rewriting for core GWEN helpers. */
  autoImports?: boolean;
  /**
   * Optional include filter. By default, JS/TS source files are considered.
   * The filter is applied on normalized posix-like module ids.
   */
  include?: (id: string) => boolean;
  /**
   * Optional exclude filter. By default, node_modules and virtual modules are excluded.
   */
  exclude?: (id: string) => boolean;
}

function normalizeId(id: string): string {
  return id.replace(/\\/g, '/');
}

function defaultInclude(id: string): boolean {
  return /\.[cm]?[jt]sx?$/.test(id);
}

function defaultExclude(id: string): boolean {
  return id.includes('/node_modules/') || id.startsWith('\0') || id.includes('/.vite/');
}

/**
 * RFC-008 transform plugin (safe incremental implementation).
 *
 * Implemented features:
 * - optional GWEN core auto-import injection (`autoImports`);
 * - optional `query: [...]` -> `query: [...] as const` rewrite (`compileSystems`).
 * - optional `schema: { ... }` -> `schema: { ... } as const` rewrite (`compileComponents`).
 */
export function gwenTransform(options: GwenTransformOptions = {}): Plugin {
  const include = options.include ?? defaultInclude;
  const exclude = options.exclude ?? defaultExclude;

  return {
    name: 'gwen-transform',
    enforce: 'pre',
    transform(code, id) {
      const normalized = normalizeId(id);
      if (exclude(normalized) || !include(normalized)) {
        return null;
      }

      let out = code;

      if (options.autoImports) {
        out = applyAutoImports(out);
      }

      if (options.compileSystems) {
        out = applyQueryAsConst(out);
      }

      if (options.compileComponents) {
        out = applySchemaAsConst(out);
      }

      if (out === code) return null;
      return { code: out, map: null };
    },
  };
}

function applyAutoImports(code: string): string {
  const needsDefineComponent = /\bdefineComponent\s*\(/.test(code);
  const needsDefineSystem = /\bdefineSystem\s*\(/.test(code);
  const needsTypes = /\bTypes\s*\./.test(code);

  if (!needsDefineComponent && !needsDefineSystem && !needsTypes) {
    return code;
  }

  const specifiers: string[] = [];
  if (needsDefineComponent) specifiers.push('defineComponent');
  if (needsDefineSystem) specifiers.push('defineSystem');
  if (needsTypes) specifiers.push('Types');
  if (specifiers.length === 0) return code;

  const merged = ensureCoreNamedImports(code, specifiers);
  if (merged !== null) {
    return merged;
  }

  const importLine = `import { ${specifiers.join(', ')} } from '${CORE_IMPORT}';\n`;

  // Insert after the last top-level import if present, otherwise at file start.
  const importRegex = /^(?:import[\s\S]*?;\s*)+/;
  const m = code.match(importRegex);
  if (!m) return importLine + code;

  const end = m[0].length;
  return code.slice(0, end) + importLine + code.slice(end);
}

/**
 * Ensure a core import contains all required named specifiers.
 * Returns:
 * - updated source if a core import exists,
 * - null if no core import is found (caller should inject a new one).
 */
function ensureCoreNamedImports(code: string, required: string[]): string | null {
  const coreImportRe = new RegExp(
    `^import\\s+([^;]+)\\s+from\\s+['"]${escapeRegExp(CORE_IMPORT)}['"]\\s*;?`,
    'm',
  );

  const m = code.match(coreImportRe);
  if (!m || m.index === undefined) return null;

  const full = m[0];
  const clause = m[1].trim();

  const namedRe = /\{([^}]*)\}/;
  const nm = clause.match(namedRe);

  if (nm) {
    const existing = nm[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => s.split(/\s+as\s+/i)[0]?.trim())
      .filter(Boolean) as string[];

    const missing = required.filter((r) => !existing.includes(r));
    if (missing.length === 0) return code;

    const mergedNamed = [...existing, ...missing].join(', ');
    const updatedClause = clause.replace(namedRe, `{ ${mergedNamed} }`);
    const updatedImport = full.replace(clause, updatedClause);

    return code.slice(0, m.index) + updatedImport + code.slice(m.index + full.length);
  }

  // Core import exists but without named imports (default or namespace import).
  const extra = `\nimport { ${required.join(', ')} } from '${CORE_IMPORT}';`;
  return code.slice(0, m.index + full.length) + extra + code.slice(m.index + full.length);
}

function applyQueryAsConst(code: string): string {
  // Robust rewrite using balanced bracket scanning — handles multiline arrays,
  // nested brackets, and string literals inside the query array.
  let out = code;
  let cursor = 0;

  while (cursor < out.length) {
    const scan = findQueryArrayStart(out, cursor);
    if (!scan) break;
    const { queryIdx, openBracketIdx } = scan;

    const end = findBalancedArrayEnd(out, openBracketIdx);
    if (end === -1) {
      cursor = queryIdx + 1;
      continue;
    }

    const after = out.slice(end + 1);
    const alreadyConst = /^\s+as\s+const\b/.test(after);
    if (!alreadyConst) {
      out = out.slice(0, end + 1) + ' as const' + out.slice(end + 1);
      cursor = end + 1 + ' as const'.length;
    } else {
      cursor = end + 1;
    }
  }

  return out;
}

/**
 * Locate the next `query\s*:\s*[` occurrence in `source` starting from `from`.
 */
function findQueryArrayStart(
  source: string,
  from: number,
): { queryIdx: number; openBracketIdx: number } | null {
  let cursor = from;

  while (cursor < source.length) {
    const queryIdx = source.indexOf('query', cursor);
    if (queryIdx === -1) return null;

    let i = skipWs(source, queryIdx + 'query'.length);
    if (source[i] !== ':') {
      cursor = queryIdx + 1;
      continue;
    }

    i = skipWs(source, i + 1);
    if (source[i] !== '[') {
      cursor = queryIdx + 1;
      continue;
    }

    return { queryIdx, openBracketIdx: i };
  }

  return null;
}

/**
 * Walk `source` from `openBracketIdx` (which must be `[`) and return the index
 * of the matching `]`, respecting nested brackets and string literals.
 * Returns -1 if the source ends without a matching bracket.
 */
function findBalancedArrayEnd(source: string, openBracketIdx: number): number {
  let depth = 0;
  let i = openBracketIdx;
  let quote: '"' | "'" | '`' | null = null;

  while (i < source.length) {
    const c = source[i];
    const prev = i > 0 ? source[i - 1] : '';

    if (quote) {
      if (c === quote && prev !== '\\') quote = null;
      i++;
      continue;
    }

    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      i++;
      continue;
    }

    if (c === '[') {
      depth++;
    } else if (c === ']') {
      depth--;
      if (depth === 0) return i;
    }

    i++;
  }

  return -1;
}

function applySchemaAsConst(code: string): string {
  // Rewrite balanced `schema: { ... }` literals, including nested object schemas.
  let out = code;
  let cursor = 0;

  while (cursor < out.length) {
    const scan = findSchemaObjectStart(out, cursor);
    if (!scan) break;
    const { schemaIdx, openBraceIdx } = scan;

    const end = findBalancedObjectEnd(out, openBraceIdx);
    if (end === -1) {
      cursor = schemaIdx + 1;
      continue;
    }

    const after = out.slice(end + 1);
    const alreadyConst = /^\s+as\s+const\b/.test(after);
    if (!alreadyConst) {
      out = out.slice(0, end + 1) + ' as const' + out.slice(end + 1);
      cursor = end + 1 + ' as const'.length;
    } else {
      cursor = end + 1;
    }
  }

  return out;
}

function findSchemaObjectStart(
  source: string,
  from: number,
): { schemaIdx: number; openBraceIdx: number } | null {
  let cursor = from;

  while (cursor < source.length) {
    const schemaIdx = source.indexOf('schema', cursor);
    if (schemaIdx === -1) return null;

    let i = skipWs(source, schemaIdx + 'schema'.length);
    if (source[i] !== ':') {
      cursor = schemaIdx + 1;
      continue;
    }

    i = skipWs(source, i + 1);
    if (source[i] !== '{') {
      cursor = schemaIdx + 1;
      continue;
    }

    return { schemaIdx, openBraceIdx: i };
  }

  return null;
}

function skipWs(source: string, i: number): number {
  let out = i;
  while (out < source.length && /\s/.test(source[out])) out++;
  return out;
}

function findBalancedObjectEnd(source: string, openBraceIdx: number): number {
  let depth = 0;
  let i = openBraceIdx;
  let quote: '"' | "'" | '`' | null = null;

  while (i < source.length) {
    const c = source[i];
    const prev = i > 0 ? source[i - 1] : '';

    if (quote) {
      if (c === quote && prev !== '\\') quote = null;
      i++;
      continue;
    }

    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      i++;
      continue;
    }

    if (c === '{') {
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }

    i++;
  }

  return -1;
}

function escapeRegExp(v: string): string {
  return v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
