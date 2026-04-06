# Vite Physics3D Query Optimizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `gwen:physics3d-optimizer` Vite sub-plugin that detects imperative spatial query calls (`physics.castRay`, `physics.castShape`, `physics.overlapShape`) inside `onUpdate` callbacks and either warns (Phase 1) or rewrites them to use the zero-copy SAB slot composables (Phase 2).

**Architecture:** New `PhysicsQueryWalker` parses TypeScript source with `oxc-parser`/`oxc-walker` to find imperative query calls inside `defineSystem` update callbacks. New `gwenPhysics3DOptimizerPlugin` Vite plugin applies detections as Vite warnings (Phase 1) or source rewrites with `MagicString` (Phase 2). Exported from `@gwenjs/vite`.

**Tech Stack:** oxc-parser, oxc-walker, MagicString, Vite `transform` hook, TypeScript.

---

## File Map

| File | Change |
|------|--------|
| `packages/vite/src/optimizer/physics-walker.ts` | NEW — AST walker detecting imperative physics calls in update callbacks |
| `packages/vite/src/optimizer/physics-transformer.ts` | NEW — MagicString rewriter (Phase 2) |
| `packages/vite/src/plugins/physics3d-optimizer.ts` | NEW — Vite plugin entry point |
| `packages/vite/src/index.ts` | Export `gwenPhysics3DOptimizerPlugin` |
| `packages/vite/tests/physics-walker.test.ts` | NEW — unit tests for walker |
| `packages/vite/tests/physics3d-optimizer.test.ts` | NEW — integration tests for Vite plugin |

---

## Task 1: `PhysicsQueryWalker` — detect anti-patterns

**Files:**
- Create: `packages/vite/src/optimizer/physics-walker.ts`
- Create: `packages/vite/tests/physics-walker.test.ts`

**Context:** The existing `AstWalker` detects `useQuery + onUpdate` patterns using `oxc-parser` and `oxc-walker`. The same tooling is used here. Review `packages/vite/src/optimizer/ast-walker.ts` before coding.

- [ ] **Step 1: Write the failing test**

Create `packages/vite/tests/physics-walker.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { PhysicsQueryWalker } from '../src/optimizer/physics-walker.js';

describe('PhysicsQueryWalker', () => {
  it('detects physics.castRay inside onUpdate', () => {
    const src = `
      import { defineSystem } from '@gwenjs/core';
      export const system = defineSystem(() => {
        onUpdate(() => {
          const hit = physics.castRay({ origin: pos, direction: dir });
        });
      });
    `;
    const walker = new PhysicsQueryWalker('system.ts');
    const patterns = walker.walk(src);
    expect(patterns).toHaveLength(1);
    expect(patterns[0]!.method).toBe('castRay');
    expect(patterns[0]!.callbackType).toBe('onUpdate');
  });

  it('does NOT flag physics.castRay at setup level', () => {
    const src = `
      export const system = defineSystem(() => {
        const hit = physics.castRay({ origin: pos, direction: dir });
        onUpdate(() => { /* nothing */ });
      });
    `;
    const walker = new PhysicsQueryWalker('system.ts');
    expect(walker.walk(src)).toHaveLength(0);
  });

  it('detects physics.castShape inside onAfterUpdate', () => {
    const src = `
      export const system = defineSystem(() => {
        onAfterUpdate(() => {
          physics.castShape({ ... });
        });
      });
    `;
    const walker = new PhysicsQueryWalker('system.ts');
    const patterns = walker.walk(src);
    expect(patterns).toHaveLength(1);
    expect(patterns[0]!.method).toBe('castShape');
    expect(patterns[0]!.callbackType).toBe('onAfterUpdate');
  });

  it('detects physics.overlapShape inside onUpdate', () => {
    const src = `
      export const system = defineSystem(() => {
        onUpdate(() => { physics.overlapShape({ ... }); });
      });
    `;
    const walker = new PhysicsQueryWalker('system.ts');
    expect(walker.walk(src)[0]!.method).toBe('overlapShape');
  });

  it('does NOT flag useRaycast composable (already optimized)', () => {
    const src = `
      export const system = defineSystem(() => {
        const ray = useRaycast({ direction: { x: 0, y: -1, z: 0 } });
        onUpdate(() => { if (ray.result.hit) { } });
      });
    `;
    const walker = new PhysicsQueryWalker('system.ts');
    expect(walker.walk(src)).toHaveLength(0);
  });

  it('returns empty array for non-physics source', () => {
    const src = `const x = 1 + 2;`;
    const walker = new PhysicsQueryWalker('util.ts');
    expect(walker.walk(src)).toHaveLength(0);
  });
});
```

Run: `pnpm --filter @gwenjs/vite test -- physics-walker`
Expected: FAIL (PhysicsQueryWalker not found)

- [ ] **Step 2: Implement `PhysicsQueryWalker`**

Create `packages/vite/src/optimizer/physics-walker.ts`:

```typescript
/**
 * @file PhysicsQueryWalker — detects imperative spatial query calls inside
 * `defineSystem` update-callback bodies.
 *
 * Anti-pattern: calling `physics.castRay / castShape / overlapShape` inside
 * `onUpdate` crosses the WASM boundary once per call per frame. The composable
 * equivalents (`useRaycast`, `useShapeCast`, `useOverlap`) use a pre-allocated
 * SAB slot that is filled by Rapier during `physics3d_step` — zero extra WASM
 * crossings per frame.
 *
 * @example
 * ```ts
 * const walker = new PhysicsQueryWalker('src/systems/combat.ts');
 * const patterns = walker.walk(sourceCode);
 * // patterns[0].method     → 'castRay'
 * // patterns[0].callbackType → 'onUpdate'
 * // patterns[0].start, .end → byte offsets for source rewriting
 * ```
 */

import { walk } from 'oxc-walker';
import type {
  CallExpression,
  ArrowFunctionExpression,
  Function as FunctionNode,
  StaticMemberExpression,
} from 'oxc-parser';
import { parseSource, isCallTo, getFunctionBodyStatements } from '../oxc/index.js';

/** Method names on the physics service that cross the WASM boundary. */
const IMPERATIVE_METHODS = ['castRay', 'castShape', 'overlapShape'] as const;
type ImperativeMethod = (typeof IMPERATIVE_METHODS)[number];

/** Update-phase callback names where imperative calls are disallowed. */
const UPDATE_CALLBACKS = ['onUpdate', 'onBeforeUpdate', 'onAfterUpdate'] as const;
type UpdateCallback = (typeof UPDATE_CALLBACKS)[number];

/** A detected anti-pattern instance. */
export interface PhysicsQueryPattern {
  /** Method called on the physics service (e.g. `'castRay'`). */
  readonly method: ImperativeMethod;
  /** The enclosing update callback (e.g. `'onUpdate'`). */
  readonly callbackType: UpdateCallback;
  /** Byte offset of the call expression start in the source. */
  readonly start: number;
  /** Byte offset of the call expression end in the source. */
  readonly end: number;
  /** Source file for diagnostic messages. */
  readonly filename: string;
}

/**
 * Walks a TypeScript source file to find imperative physics spatial-query calls
 * inside `defineSystem` update-callback bodies.
 */
export class PhysicsQueryWalker {
  constructor(private readonly filename: string) {}

  /**
   * Parse `source` and return all detected anti-pattern instances.
   * Returns an empty array if the source has no physics calls or cannot be parsed.
   *
   * @param source - TypeScript source code.
   */
  walk(source: string): PhysicsQueryPattern[] {
    // Fast pre-scan: if none of the imperative methods appear, skip parse
    if (!IMPERATIVE_METHODS.some((m) => source.includes(m))) return [];

    const parsed = parseSource(this.filename, source);
    if (!parsed) return [];

    const patterns: PhysicsQueryPattern[] = [];
    const filename = this.filename;

    walk(parsed.program, {
      enter(node) {
        // Find `defineSystem(() => { ... })` call expressions
        if (node.type !== 'CallExpression') return;
        const call = node as CallExpression;
        if (!isCallTo(call, 'defineSystem')) return;

        // Inspect the first argument — the setup function body
        const setupFn = call.arguments[0];
        if (!setupFn) return;
        const bodyStmts = getFunctionBodyStatements(
          setupFn as ArrowFunctionExpression | FunctionNode,
        );
        if (!bodyStmts) return;

        // For each statement in setup, look for onUpdate/onBeforeUpdate/onAfterUpdate calls
        for (const stmt of bodyStmts) {
          if (stmt.type !== 'ExpressionStatement') continue;
          const expr = stmt.expression;
          if (expr.type !== 'CallExpression') continue;
          const cbCall = expr as CallExpression;

          const cbType = UPDATE_CALLBACKS.find((cb) => isCallTo(cbCall, cb));
          if (!cbType) continue;

          // Found an update callback — scan its body for imperative physics calls
          const cbFn = cbCall.arguments[0];
          if (!cbFn) continue;
          const cbStmts = getFunctionBodyStatements(
            cbFn as ArrowFunctionExpression | FunctionNode,
          );
          if (!cbStmts) continue;

          walk({ type: 'Program', body: cbStmts, sourceType: 'module', hashbang: null } as never, {
            enter(inner) {
              if (inner.type !== 'CallExpression') return;
              const innerCall = inner as CallExpression;
              if (innerCall.callee.type !== 'StaticMemberExpression') return;
              const member = innerCall.callee as StaticMemberExpression;
              if (member.object.type !== 'Identifier') return;
              if (
                member.object.name !== 'physics' &&
                member.object.name !== 'physics3d'
              )
                return;
              const method = IMPERATIVE_METHODS.find(
                (m) => member.property.name === m,
              );
              if (!method) return;

              patterns.push({
                method,
                callbackType: cbType,
                start: innerCall.start,
                end: innerCall.end,
                filename,
              });
            },
          });
        }
      },
    });

    return patterns;
  }
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @gwenjs/vite test -- physics-walker
```
Expected: all 6 tests pass.

- [ ] **Step 4: Commit walker**

```bash
git add packages/vite/src/optimizer/physics-walker.ts packages/vite/tests/physics-walker.test.ts
git commit -m "feat(vite): PhysicsQueryWalker — detect imperative physics3d calls in update loops

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: `gwenPhysics3DOptimizerPlugin` — Phase 1 (warn mode)

**Files:**
- Create: `packages/vite/src/plugins/physics3d-optimizer.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/vite/tests/physics3d-optimizer.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { gwenPhysics3DOptimizerPlugin } from '../src/plugins/physics3d-optimizer.js';
import type { Plugin } from 'vite';

describe('gwenPhysics3DOptimizerPlugin', () => {
  it('exports a Vite plugin object', () => {
    const plugin = gwenPhysics3DOptimizerPlugin();
    expect(plugin.name).toBe('gwen:physics3d-optimizer');
    expect(typeof plugin.transform).toBe('function');
  });

  it('emits a warning for physics.castRay inside onUpdate in warn mode', async () => {
    const plugin = gwenPhysics3DOptimizerPlugin({ mode: 'warn' }) as Plugin & {
      transform: (code: string, id: string) => unknown;
    };

    const warnSpy = vi.fn();
    // Simulate Vite plugin context with warn
    const ctx = { warn: warnSpy } as Parameters<typeof plugin.transform>[2] as never;

    const src = `
      import { defineSystem } from '@gwenjs/core';
      export const sys = defineSystem(() => {
        onUpdate(() => { physics.castRay({ origin: { x:0,y:0,z:0 }, direction: { x:0,y:-1,z:0 } }); });
      });
    `;

    await (plugin.transform as (code: string, id: string, ctx?: unknown) => unknown)(
      src, 'src/systems/combat.ts', ctx,
    );

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('castRay');
    expect(warnSpy.mock.calls[0][0]).toContain('useRaycast');
  });

  it('does not warn for non-TS files', async () => {
    const plugin = gwenPhysics3DOptimizerPlugin({ mode: 'warn' }) as Plugin & {
      transform: (code: string, id: string) => unknown;
    };
    const warnSpy = vi.fn();
    const ctx = { warn: warnSpy };
    await (plugin.transform as Function)('physics.castRay()', 'style.css', ctx);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not warn when no physics calls present', async () => {
    const plugin = gwenPhysics3DOptimizerPlugin({ mode: 'warn' }) as Plugin & {
      transform: (code: string, id: string) => unknown;
    };
    const warnSpy = vi.fn();
    const ctx = { warn: warnSpy };
    await (plugin.transform as Function)('const x = 1;', 'src/util.ts', ctx);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('returns null (no source change) in warn mode', async () => {
    const plugin = gwenPhysics3DOptimizerPlugin({ mode: 'warn' }) as Plugin & {
      transform: (code: string, id: string) => unknown;
    };
    const src = `onUpdate(() => { physics.castRay({}); });`;
    const result = await (plugin.transform as Function)(src, 'src/s.ts', { warn: vi.fn() });
    expect(result).toBeNull();
  });
});
```

Run: `pnpm --filter @gwenjs/vite test -- physics3d-optimizer`
Expected: FAIL (plugin not found)

- [ ] **Step 2: Implement `gwenPhysics3DOptimizerPlugin`**

Create `packages/vite/src/plugins/physics3d-optimizer.ts`:

```typescript
/**
 * @file gwenPhysics3DOptimizerPlugin — Vite sub-plugin for physics3d query optimization.
 *
 * Phase 1 (`mode: 'warn'`): emits Vite warnings when imperative spatial-query
 * calls are detected inside update callbacks. Helps developers migrate to the
 * zero-copy composable API (`useRaycast`, `useShapeCast`, `useOverlap`).
 *
 * Phase 2 (`mode: 'transform'`): rewrites detected patterns to the composable
 * API at build time. (Not yet implemented — see TODO below.)
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { gwenVitePlugin, gwenPhysics3DOptimizerPlugin } from '@gwenjs/vite';
 * export default defineConfig({
 *   plugins: [gwenVitePlugin(), gwenPhysics3DOptimizerPlugin({ mode: 'warn' })],
 * });
 * ```
 */

import type { Plugin } from 'vite';
import { PhysicsQueryWalker } from '../optimizer/physics-walker.js';

/** Maps each detected imperative method to its composable replacement. */
const METHOD_TO_COMPOSABLE: Record<string, string> = {
  castRay: 'useRaycast',
  castShape: 'useShapeCast',
  overlapShape: 'useOverlap',
};

/** Docs link shown in Vite warning messages. */
const DOCS_URL = 'https://gwenjs.dev/guide/physics3d-spatial-queries#performance';

/** Options for `gwenPhysics3DOptimizerPlugin`. */
export interface GwenPhysics3DOptimizerOptions {
  /**
   * Optimization mode.
   * - `'warn'`: emit Vite warnings for detected anti-patterns (Phase 1).
   * - `'transform'`: rewrite source to use SAB composables (Phase 2, not yet implemented).
   * @default 'warn'
   */
  mode?: 'warn' | 'transform';
  /**
   * Enable verbose per-pattern logging.
   * @default false
   */
  debug?: boolean;
  /**
   * Glob patterns of files to analyse. Defaults to all `.ts` / `.tsx` files.
   * @default ['.ts', '.tsx']
   */
  extensions?: string[];
}

/**
 * `gwen:physics3d-optimizer` — opt-in Vite plugin that identifies and
 * optionally rewrites imperative physics3d spatial-query anti-patterns.
 *
 * @param options - Configuration options.
 * @returns A Vite plugin instance.
 */
export function gwenPhysics3DOptimizerPlugin(
  options: GwenPhysics3DOptimizerOptions = {},
): Plugin {
  const { mode = 'warn', debug = false, extensions = ['.ts', '.tsx'] } = options;

  return {
    name: 'gwen:physics3d-optimizer',
    enforce: 'pre',

    transform(code, id, ctx) {
      // Only process TypeScript files
      if (!extensions.some((ext) => id.endsWith(ext))) return null;
      // Fast bailout: skip files with no physics calls
      if (!code.includes('castRay') && !code.includes('castShape') && !code.includes('overlapShape')) {
        return null;
      }

      const walker = new PhysicsQueryWalker(id);
      const patterns = walker.walk(code);
      if (patterns.length === 0) return null;

      for (const pattern of patterns) {
        const composable = METHOD_TO_COMPOSABLE[pattern.method] ?? `use${pattern.method.charAt(0).toUpperCase()}${pattern.method.slice(1)}`;
        const message =
          `[gwen:physics3d-optimizer] Anti-pattern in ${id}: ` +
          `\`physics.${pattern.method}()\` called inside \`${pattern.callbackType}()\` ` +
          `crosses the WASM boundary every frame. ` +
          `Replace with \`${composable}()\` for zero-copy SAB reads. ` +
          `See: ${DOCS_URL}`;

        if (debug) {
          console.log(`[physics3d-optimizer] ${id}: ${pattern.method} @ offset ${pattern.start}`);
        }

        if (mode === 'warn') {
          // Emit Vite warning via plugin context (ctx may be undefined in tests)
          const warn = (ctx as { warn?: (msg: string) => void } | undefined)?.warn;
          warn?.(message);
        } else if (mode === 'transform') {
          // Phase 2: source rewriting not yet implemented.
          // For now fall back to warn.
          const warn = (ctx as { warn?: (msg: string) => void } | undefined)?.warn;
          warn?.(`${message} (transform mode coming soon)`);
        }
      }

      // Phase 1: never modify source
      return null;
    },
  };
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @gwenjs/vite test -- physics3d-optimizer
```
Expected: all 4 tests pass.

- [ ] **Step 4: Commit plugin**

```bash
git add packages/vite/src/plugins/physics3d-optimizer.ts packages/vite/tests/physics3d-optimizer.test.ts
git commit -m "feat(vite): gwenPhysics3DOptimizerPlugin Phase 1 — warn on imperative physics query anti-patterns

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Export from `@gwenjs/vite`

**Files:**
- Modify: `packages/vite/src/index.ts`

- [ ] **Step 1: Add export**

Find the line:
```typescript
export { gwenOptimizerPlugin } from './plugins/optimizer.js';
```

Add after it:
```typescript
export { gwenPhysics3DOptimizerPlugin } from './plugins/physics3d-optimizer.js';
export type { GwenPhysics3DOptimizerOptions } from './plugins/physics3d-optimizer.js';
```

- [ ] **Step 2: Run full vite package tests**

```bash
pnpm --filter @gwenjs/vite test
```
Expected: all tests pass.

- [ ] **Step 3: Run typecheck**

```bash
pnpm --filter '@gwenjs/vite' exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Build**

```bash
pnpm build:ts
```
Expected: no errors.

- [ ] **Step 5: Commit and push**

```bash
git add packages/vite/src/index.ts
git commit -m "feat(vite): export gwenPhysics3DOptimizerPlugin from @gwenjs/vite

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
git push
```

---

## Phase 2 Note (future work)

Phase 2 (source rewriting) is explicitly not implemented in this plan. When ready, it will:
1. Use `MagicString` to hoist the call's argument object to setup scope
2. Insert `const _ray_N = useRaycast(<extracted opts>)` before the `onUpdate` block
3. Replace the imperative call expression with `_ray_N.result`
4. Return `{ code: s.toString(), map: s.generateMap({ hires: true }) }`
