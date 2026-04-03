import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import * as t from '@babel/types';
import type { OptimizablePattern } from './types';

// Handle both CJS and ESM builds of @babel/traverse
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const traverse = (_traverse as any).default ?? _traverse;

/**
 * Walks a TypeScript source file AST to find `useQuery + onUpdate` patterns
 * that the optimizer can replace with bulk WASM calls.
 *
 * Detection strategy:
 * 1. Find `useQuery([ComponentA, ComponentB])` calls — extract component names
 * 2. Find `onUpdate(() => { ... })` blocks — scan body for `useComponent` calls
 * 3. Classify each `useComponent(e, Comp)` as a read, and
 *    `useComponent(e, Comp, newValue)` as a write
 *
 * @example
 * ```ts
 * const walker = new AstWalker('src/systems/movement.ts')
 * const patterns = walker.walk(sourceCode)
 * // patterns[0].queryComponents → ['Position', 'Velocity']
 * ```
 */
export class AstWalker {
  constructor(private readonly filename: string) {}

  /**
   * Parse and walk `source`, returning all detected `OptimizablePattern` candidates.
   * Returns an empty array if the source has no `useQuery` calls.
   *
   * @param source - TypeScript source code to analyze.
   * @returns Array of detected optimizable patterns (may be empty).
   */
  walk(source: string): OptimizablePattern[] {
    let ast: t.File;
    try {
      ast = parse(source, {
        sourceType: 'module',
        plugins: ['typescript'],
        errorRecovery: true,
      });
    } catch {
      return [];
    }

    const patterns: OptimizablePattern[] = [];

    traverse(ast, {
      CallExpression: (path: { node: t.CallExpression }) => {
        if (!isCallTo(path.node, 'defineSystem')) return;

        const callback = path.node.arguments[0];
        if (!t.isArrowFunctionExpression(callback) && !t.isFunctionExpression(callback)) return;

        const queryComponents = extractQueryComponents(callback);
        if (queryComponents.length === 0) return;

        const { readComponents, writeComponents, loc } = extractUpdateUsage(
          callback,
          this.filename,
        );

        patterns.push({ queryComponents, readComponents, writeComponents, loc });
      },
    });

    return patterns;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if a CallExpression calls a function with the given name.
 *
 * @param node - The CallExpression node to check.
 * @param name - The expected callee identifier name.
 */
function isCallTo(node: t.CallExpression, name: string): boolean {
  return t.isIdentifier(node.callee) && node.callee.name === name;
}

/**
 * Extract component names from `useQuery([ComponentA, ComponentB])` calls
 * inside the function body.
 *
 * @param fn - The function expression/arrow containing the useQuery call.
 * @returns Array of component identifier names.
 */
function extractQueryComponents(fn: t.ArrowFunctionExpression | t.FunctionExpression): string[] {
  const names: string[] = [];
  const body = t.isBlockStatement(fn.body) ? fn.body.body : [];

  for (const stmt of body) {
    if (!t.isVariableDeclaration(stmt)) continue;
    for (const decl of stmt.declarations) {
      if (!t.isCallExpression(decl.init)) continue;
      if (!isCallTo(decl.init, 'useQuery')) continue;
      const arg = decl.init.arguments[0];
      if (!t.isArrayExpression(arg)) continue;
      for (const el of arg.elements) {
        if (t.isIdentifier(el)) names.push(el.name);
      }
    }
  }

  return names;
}

/**
 * Extract read and write component usage from `onUpdate` callback bodies.
 *
 * @param fn - The defineSystem function containing onUpdate calls.
 * @param filename - Source filename for location metadata.
 * @returns Sets of read/write component names and source location.
 */
function extractUpdateUsage(
  fn: t.ArrowFunctionExpression | t.FunctionExpression,
  filename: string,
): {
  readComponents: string[];
  writeComponents: string[];
  loc: { line: number; column: number; file: string };
} {
  const reads = new Set<string>();
  const writes = new Set<string>();
  let loc = { line: 1, column: 0, file: filename };

  const body = t.isBlockStatement(fn.body) ? fn.body.body : [];

  for (const stmt of body) {
    if (!t.isExpressionStatement(stmt)) continue;
    if (!t.isCallExpression(stmt.expression)) continue;
    if (!isCallTo(stmt.expression, 'onUpdate')) continue;

    loc = {
      line: stmt.loc?.start.line ?? 1,
      column: stmt.loc?.start.column ?? 0,
      file: filename,
    };

    const updateCallback = stmt.expression.arguments[0];
    if (!t.isArrowFunctionExpression(updateCallback) && !t.isFunctionExpression(updateCallback))
      continue;
    if (!t.isBlockStatement(updateCallback.body)) continue;

    for (const innerStmt of updateCallback.body.body) {
      collectUseComponentCalls(innerStmt, reads, writes);
    }
  }

  return {
    readComponents: [...reads],
    writeComponents: [...writes],
    loc,
  };
}

/**
 * Recursively collect `useComponent` read and write calls from a statement.
 * Handles for-of loops that wrap the component access calls.
 *
 * @param node   - AST statement node to inspect.
 * @param reads  - Accumulator set for read component names.
 * @param writes - Accumulator set for write component names.
 */
function collectUseComponentCalls(
  node: t.Statement,
  reads: Set<string>,
  writes: Set<string>,
): void {
  if (t.isForOfStatement(node) && t.isBlockStatement(node.body)) {
    for (const s of node.body.body) {
      collectUseComponentCalls(s, reads, writes);
    }
    return;
  }

  if (t.isVariableDeclaration(node)) {
    for (const decl of node.declarations) {
      if (!t.isCallExpression(decl.init)) continue;
      if (!isCallTo(decl.init, 'useComponent')) continue;
      const comp = decl.init.arguments[1];
      if (t.isIdentifier(comp)) reads.add(comp.name);
    }
  }

  if (t.isExpressionStatement(node) && t.isCallExpression(node.expression)) {
    if (isCallTo(node.expression, 'useComponent') && node.expression.arguments.length >= 3) {
      const comp = node.expression.arguments[1];
      if (t.isIdentifier(comp)) writes.add(comp.name);
    }
  }
}
