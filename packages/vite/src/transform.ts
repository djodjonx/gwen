import type { Plugin } from 'vite';
import MagicString from 'magic-string';
import { parseSync } from 'oxc-parser';

// ─── Minimal oxc-parser AST types ────────────────────────────────────────────
// oxc-parser has no shipped .d.ts for its AST yet; these minimal shapes cover
// exactly the AST properties accessed in this file.

/**
 * A single parse diagnostic emitted by oxc-parser.
 * Severity is `'Error'` for fatal problems, `'Warning'` for non-fatal ones.
 */
interface OxcError {
  severity: string;
  message: string;
}

/**
 * A minimal oxc-parser AST node.
 * Only the properties accessed in this transform plugin are declared here.
 */
interface OxcNode {
  type: string;
  start: number;
  end: number;
  // ImportDeclaration
  source?: { value: string };
  importKind?: string;
  specifiers?: OxcNode[];
  // ImportSpecifier
  imported?: { name: string };
  local?: { name: string };
  // ObjectExpression / Program body / generic children
  body?: OxcNode[];
  properties?: OxcNode[];
  // Property
  key?: OxcNode;
  value?: OxcNode;
  name?: string;
  // Identifier / StringLiteral
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- oxc literal values are mixed primitives
  [key: string]: any;
}

const CORE_IMPORT = '@gwenjs/core';

export interface GwenTransformOptions {
  /** Enable compile-time transforms for defineComponent schemas. */
  compileComponents?: boolean;
  /** Enable compile-time transforms for defineSystem/query descriptors. */
  compileSystems?: boolean;
  /** Enable optional auto-import rewriting for core GWEN helpers. */
  autoImports?: boolean;
  /** Optional include filter. Defaults to JS/TS source files. */
  include?: (id: string) => boolean;
  /** Optional exclude filter. Defaults to node_modules and virtual modules. */
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
 * RFC-008 transform plugin — AST-based implementation using oxc-parser.
 *
 * Features:
 * - `autoImports`: inject missing `@gwenjs/core` named imports
 * - `compileSystems`: rewrite `query: [...]` → `query: [...] as const`
 * - `compileComponents`: rewrite `schema: {...}` → `schema: {...} as const`
 *
 * Uses oxc-parser for accurate AST (respects comments, strings, template literals).
 * Uses magic-string for position-based mutations with proper sourcemaps.
 */
export function gwenTransform(options: GwenTransformOptions = {}): Plugin {
  const include = options.include ?? defaultInclude;
  const exclude = options.exclude ?? defaultExclude;

  return {
    name: 'gwen-transform',
    enforce: 'pre',

    transform(code, id) {
      const normalized = normalizeId(id);
      if (exclude(normalized) || !include(normalized)) return null;

      const needsAutoImports =
        options.autoImports &&
        (/\bdefineComponent\s*\(/.test(code) ||
          /\bdefineSystem\s*\(/.test(code) ||
          /\bTypes\s*\./.test(code));

      const needsQueryTransform = options.compileSystems && /\bquery\s*:/.test(code);
      const needsSchemaTransform = options.compileComponents && /\bschema\s*:/.test(code);

      if (!needsAutoImports && !needsQueryTransform && !needsSchemaTransform) {
        return null;
      }

      let program: OxcNode;
      try {
        const result = parseSync(id, code);
        if (result.errors && result.errors.length > 0) {
          const fatal = (result.errors as OxcError[]).filter((e) => e.severity === 'Error');
          if (fatal.length > 0) return null;
          // Non-fatal diagnostics — proceed but warn the developer
          for (const e of result.errors as OxcError[]) {
            this.warn(`[gwen-transform] Parse diagnostic in ${id}: ${e.message}`);
          }
        }
        // Cast through unknown: the oxc-parser Program type is structurally
        // richer than our minimal OxcNode, but we only access the subset we typed.
        program = result.program as unknown as OxcNode;
      } catch {
        return null;
      }

      const s = new MagicString(code);

      if (needsAutoImports) {
        applyAutoImports(program, code, s);
      }

      if (needsQueryTransform || needsSchemaTransform) {
        applyAsConstTransforms(program, s, {
          query: !!needsQueryTransform,
          schema: !!needsSchemaTransform,
        });
      }

      if (!s.hasChanged()) return null;

      return {
        code: s.toString(),
        map: s.generateMap({ hires: true, source: id, includeContent: true }),
      };
    },
  };
}

// ─── Auto-imports ─────────────────────────────────────────────────────────────

/**
 * Inject missing `@gwenjs/core` named imports into the source via AST.
 *
 * @param program - Parsed oxc-parser AST program node.
 * @param code - Original source string (for regex pre-screening).
 * @param s - MagicString instance to mutate.
 */
function applyAutoImports(program: OxcNode, code: string, s: MagicString): void {
  const needed = {
    defineComponent: /\bdefineComponent\s*\(/.test(code),
    defineSystem: /\bdefineSystem\s*\(/.test(code),
    Types: /\bTypes\s*\./.test(code),
  };

  const specifiers = (Object.keys(needed) as (keyof typeof needed)[]).filter((k) => needed[k]);
  if (specifiers.length === 0) return;

  const coreImport = (program.body ?? []).find(
    (node: OxcNode) =>
      node.type === 'ImportDeclaration' &&
      node.source?.value === CORE_IMPORT &&
      node.importKind !== 'type',
  );

  if (coreImport) {
    const existing: string[] = (coreImport.specifiers ?? [])
      .filter((sp: OxcNode) => sp.type === 'ImportSpecifier')
      .map((sp: OxcNode) => sp.imported?.name ?? sp.local?.name)
      .filter((name): name is string => Boolean(name));

    const missing = specifiers.filter((name) => !existing.includes(name));
    if (missing.length === 0) return;

    const namedSpecs = (coreImport.specifiers ?? []).filter(
      (sp: OxcNode) => sp.type === 'ImportSpecifier',
    );

    if (namedSpecs.length > 0) {
      const lastSpec = namedSpecs[namedSpecs.length - 1];
      s.appendLeft(lastSpec.end, `, ${missing.join(', ')}`);
    } else {
      s.appendLeft(coreImport.end, `\nimport { ${missing.join(', ')} } from '${CORE_IMPORT}';`);
    }
    return;
  }

  const imports = (program.body ?? []).filter((node: OxcNode) => node.type === 'ImportDeclaration');
  const insertLine = `import { ${specifiers.join(', ')} } from '${CORE_IMPORT}';\n`;

  if (imports.length > 0) {
    const lastImport = imports[imports.length - 1];
    s.appendLeft(lastImport.end, '\n' + insertLine.trimEnd());
  } else {
    s.prepend(insertLine);
  }
}

// ─── as const transforms ──────────────────────────────────────────────────────

interface AsConstOptions {
  /** Whether to add `as const` to `query: [...]` array expressions. */
  query: boolean;
  /** Whether to add `as const` to `schema: {...}` object expressions. */
  schema: boolean;
}

/**
 * Walk the AST and append ` as const` after qualifying `query` and `schema` property values.
 *
 * @param program - Parsed oxc-parser AST program node.
 * @param s - MagicString instance to mutate.
 * @param opts - Which property keys to transform.
 */
function applyAsConstTransforms(program: OxcNode, s: MagicString, opts: AsConstOptions): void {
  const insertPositions = new Set<number>();

  walkNode(program, (node: OxcNode) => {
    if (node.type !== 'ObjectExpression') return;

    for (const prop of node.properties ?? []) {
      if (prop.type === 'SpreadElement') continue;

      const key = prop.key;
      const value = prop.value;
      if (!key || !value) continue;

      const keyName: string | null =
        key.type === 'Identifier'
          ? (key.name ?? null)
          : key.type === 'StringLiteral' || key.type === 'Literal'
            ? String(key.value)
            : null;

      if (!keyName) continue;
      if (value.type === 'TSAsExpression') continue;

      if (opts.query && keyName === 'query' && value.type === 'ArrayExpression') {
        insertPositions.add(value.end);
      }

      if (opts.schema && keyName === 'schema' && value.type === 'ObjectExpression') {
        insertPositions.add(value.end);
      }
    }
  });

  // Process in reverse order to avoid invalidating earlier positions.
  const sorted = [...insertPositions].sort((a, b) => b - a);
  for (const pos of sorted) {
    s.appendLeft(pos, ' as const');
  }
}

// ─── AST walker ──────────────────────────────────────────────────────────────

/**
 * Recursively walk an oxc-parser AST node, calling `visitor` on each node.
 *
 * @param node - The AST node to walk.
 * @param visitor - Called for every encountered AST node.
 */
function walkNode(node: OxcNode, visitor: (node: OxcNode) => void): void {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type !== 'string') return;

  visitor(node);

  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'span') continue;

    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) walkNode(item, visitor);
    } else if (child && typeof child === 'object' && typeof child.type === 'string') {
      walkNode(child, visitor);
    }
  }
}
