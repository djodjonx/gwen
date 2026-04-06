# Plan VITE-01 — Migrer Babel → OXC + adopter `oxc-walker`

## Objectif
`optimizer/ast-walker.ts` utilise `@babel/parser` + `@babel/traverse` + `@babel/types` (3 deps lourdes, parse ~3× plus lent qu'OXC). `transform.ts` utilise déjà `oxc-parser`. Ce plan :
1. Ajoute `oxc-walker` (https://github.com/oxc-project/oxc-walker) comme walker partagé
2. Crée `src/oxc/helpers.ts` — fonctions utilitaires projet sur les nœuds OXC
3. Migre `AstWalker` de Babel vers `oxc-walker`
4. Migre le `walkNode` local de `transform.ts` vers `oxc-walker`
5. Supprime les 3 dépendances Babel

## Contexte : état actuel
- `transform.ts` : OXC déjà utilisé via `parseSync(id, code)`, walker manuel naïf (itère toutes les keys)
- `optimizer/ast-walker.ts` : Babel `parse()` + `traverse()` + type-guards `t.is*`
- `plugins/actor.ts`, `plugins/layout.ts`, `plugins/tween.ts`, `index.ts` : regex pures

## API de `oxc-walker`

```typescript
import { walk, parseAndWalk, ScopeTracker } from 'oxc-walker';

// Walk a pre-parsed AST
walk(ast.program, {
  enter(node, parent, ctx) { /* called when entering a node */ },
  leave(node, parent, ctx) { /* called when leaving a node */ },
});

// this.skip()    — dans enter : ne pas descendre dans les enfants
// this.remove()  — supprimer le nœud du parent
// this.replace() — remplacer le nœud par un autre

// Parse and walk in one call
parseAndWalk('const x = 1', 'example.js', {
  enter(node, parent, ctx) { ... },
});
```

Le type `Node` est fourni par `oxc-walker` via la réexportation des types ESTree d'OXC.
**Pas besoin de créer des types OXC manuellement** — utiliser `import type { Node } from 'oxc-walker'`.

## Impact sur les autres packages
Aucun — `@gwenjs/vite` est une dépendance build uniquement.

---

## Étape 1 — Ajouter `oxc-walker` aux dépendances

**Fichier :** `packages/vite/package.json`

```json
{
  "dependencies": {
    "oxc-parser": "^0.123.0",
    "oxc-walker": "^0.0.8",
    "magic-string": "^0.30.0"
  }
}
```

```bash
cd packages/vite
npm install oxc-walker
```

---

## Étape 2 — Créer `src/oxc/helpers.ts` : utilitaires projet sur les nœuds OXC

Ce fichier remplace `src/oxc/walker.ts` (custom walker supprimé — le walk vient de `oxc-walker`).
Il contient uniquement les **helpers** typés qui simplifient l'accès aux propriétés des nœuds OXC.

**Types importants issus de `@oxc-project/types` (via `oxc-parser`) :**

| Ce qu'on cherche | `node.type` réel | Interface TypeScript |
|---|---|---|
| String literal | `'Literal'` | `StringLiteral` (`.value: string`) |
| Number literal | `'Literal'` | `NumericLiteral` (`.value: number`) |
| Object property | `'Property'` | `ObjectProperty` |
| Function body | `'BlockStatement'` | `FunctionBody` (`.body: (Directive\|Statement)[]`) |
| Identifier | `'Identifier'` | `BindingIdentifier \| IdentifierReference \| IdentifierName` (`.name: string`) |

**Créer :** `packages/vite/src/oxc/helpers.ts`

```typescript
/**
 * @file Project-specific helpers for reading OXC AST nodes.
 *
 * The `walk` function comes from `oxc-walker` — do not re-implement it here.
 * All types are from `oxc-parser` (which re-exports `@oxc-project/types`).
 *
 * Node type discriminants follow the ESTree spec, not OXC's internal names:
 *   - StringLiteral  → type: 'Literal', value: string
 *   - NumericLiteral → type: 'Literal', value: number
 *   - ObjectProperty → type: 'Property'
 *   - FunctionBody   → type: 'BlockStatement'
 */

import type {
  Node,
  CallExpression,
  VariableDeclarator,
  ObjectExpression,
  ObjectProperty,
  ArrayExpression,
  StringLiteral,
  NumericLiteral,
  ArrowFunctionExpression,
  FunctionBody,
  Expression,
  Argument,
} from 'oxc-parser';

// ─── Call expression guards ────────────────────────────────────────────────────

/**
 * Type predicate: check if `node` is a `CallExpression` calling a bare identifier
 * with the given `name`.
 *
 * @example isCallTo(node, 'defineSystem') — true for `defineSystem(() => {})`
 */
export function isCallTo(node: Node, name: string): node is CallExpression {
  if (node.type !== 'CallExpression') return false;
  // node is CallExpression — callee: Expression
  const callee = node.callee;
  return callee.type === 'Identifier' && callee.name === name;
}

// ─── Identifier helpers ────────────────────────────────────────────────────────

/**
 * Get the `name` string of any Identifier node (BindingIdentifier, IdentifierReference,
 * IdentifierName — all have `type: 'Identifier'` and `name: string`).
 * Returns null for non-identifier nodes.
 */
export function getIdentifierName(node: Node | Expression | Argument | null | undefined): string | null {
  if (!node || node.type !== 'Identifier') return null;
  return node.name;
}

// ─── Literal helpers ──────────────────────────────────────────────────────────

/**
 * Get the string value from a StringLiteral node.
 * In OXC/ESTree, StringLiteral has `type: 'Literal'` and `value: string`.
 * Returns null for non-string or missing nodes.
 */
export function getStringValue(node: Node | Expression | Argument | null | undefined): string | null {
  if (!node || node.type !== 'Literal') return null;
  // StringLiteral and NumericLiteral both have type 'Literal' — narrow by value type
  const val = (node as StringLiteral | NumericLiteral).value;
  return typeof val === 'string' ? val : null;
}

/**
 * Get the numeric value from a NumericLiteral node.
 * In OXC/ESTree, NumericLiteral has `type: 'Literal'` and `value: number`.
 * Returns null for non-numeric or missing nodes.
 */
export function getNumericValue(node: Node | Expression | Argument | null | undefined): number | null {
  if (!node || node.type !== 'Literal') return null;
  const val = (node as StringLiteral | NumericLiteral).value;
  return typeof val === 'number' ? val : null;
}

// ─── Call expression helpers ──────────────────────────────────────────────────

/**
 * Get the arguments array of a CallExpression node, or `[]` if not a CallExpression.
 */
export function getCallArgs(node: Node | Expression): Argument[] {
  if (node.type !== 'CallExpression') return [];
  return (node as CallExpression).arguments;
}

// ─── Function body helpers ────────────────────────────────────────────────────

/**
 * Get the statement list from an ArrowFunctionExpression or Function body.
 *
 * In OXC, the function body is a `FunctionBody` node with `type: 'BlockStatement'`
 * and a `.body: (Directive | Statement)[]` array.
 * For arrow functions with expression bodies (`() => expr`), returns [].
 */
export function getFunctionBodyStatements(node: Node): Node[] {
  if (node.type !== 'ArrowFunctionExpression' && node.type !== 'FunctionExpression') return [];
  const body = (node as ArrowFunctionExpression).body;
  // FunctionBody has type: 'BlockStatement' in OXC ESTree output
  if (body.type === 'BlockStatement') {
    return (body as FunctionBody).body;
  }
  return [];
}

// ─── Variable declarator helpers ─────────────────────────────────────────────

/**
 * Get the `init` expression of a VariableDeclarator, or null.
 */
export function getDeclaratorInit(node: Node): Expression | null {
  if (node.type !== 'VariableDeclarator') return null;
  return (node as VariableDeclarator).init;
}

// ─── Array expression helpers ─────────────────────────────────────────────────

/**
 * Get the non-null elements of an ArrayExpression.
 */
export function getArrayElements(node: Node | Expression): Expression[] {
  if (node.type !== 'ArrayExpression') return [];
  return (node as ArrayExpression).elements.filter((e): e is Expression => e !== null && e.type !== 'SpreadElement');
}

// ─── Object expression helpers ────────────────────────────────────────────────

/**
 * Get the non-spread properties of an ObjectExpression.
 * In OXC/ESTree, ObjectProperty has `type: 'Property'`.
 */
export function getObjectProperties(node: Node | Expression): ObjectProperty[] {
  if (node.type !== 'ObjectExpression') return [];
  return (node as ObjectExpression).properties.filter(
    (p): p is ObjectProperty => p.type === 'Property',
  );
}

/**
 * Get the key name string of an ObjectProperty.
 * Handles Identifier keys (`{ foo: ... }`) and string Literal keys (`{ 'foo': ... }`).
 */
export function getPropertyKeyName(prop: ObjectProperty): string | null {
  return getIdentifierName(prop.key) ?? getStringValue(prop.key);
}
```

---

## Étape 3 — Créer `src/oxc/parse.ts` : wrapper parseur OXC

**Créer :** `packages/vite/src/oxc/parse.ts`

```typescript
/**
 * @file Thin wrapper around oxc-parser for @gwenjs/vite.
 * Handles error recovery and returns a fully typed Program node.
 */

import { parseSync } from 'oxc-parser';
import type { Program } from 'oxc-parser';

export interface ParseResult {
  /** The parsed Program node (strongly typed via @oxc-project/types). */
  program: Program;
  /** True if non-fatal diagnostics were emitted (parse continued). */
  hasErrors: boolean;
}

/**
 * Parse TypeScript/JavaScript source with oxc-parser.
 *
 * @param filename - File path (used for source type detection and error messages).
 * @param source   - Source code to parse.
 * @returns ParseResult, or null if a fatal error occurred.
 */
export function parseSource(filename: string, source: string): ParseResult | null {
  try {
    const result = parseSync(filename, source);
    const errors = result.errors ?? [];
    const hasFatal = errors.some((e) => e.severity === 'Error');
    if (hasFatal) return null;

    return {
      program: result.program,
      hasErrors: errors.length > 0,
    };
  } catch {
    return null;
  }
}
```

---

## Étape 4 — Créer `src/oxc/index.ts` : barrel export

**Créer :** `packages/vite/src/oxc/index.ts`

```typescript
// Re-export walk primitives from oxc-walker
export { walk, parseAndWalk, ScopeTracker } from 'oxc-walker';
export type { Node } from 'oxc-walker';

// Project-specific helpers
export * from './helpers.js';

// Parser wrapper
export * from './parse.js';
```

---

## Étape 5 — Réécrire `optimizer/ast-walker.ts` avec `oxc-walker`

**Remplacer intégralement** `packages/vite/src/optimizer/ast-walker.ts` :

```typescript
/**
 * @file AstWalker — oxc-walker-based replacement for the previous Babel implementation.
 *
 * Walks a TypeScript source file to detect `defineSystem(useQuery + onUpdate)`
 * patterns that the optimizer can replace with bulk WASM calls.
 *
 * ~3× faster than the Babel implementation on typical system files.
 */

import { walk } from 'oxc-walker';
import type {
  Node,
  CallExpression,
  VariableDeclaration,
  ExpressionStatement,
  ForOfStatement,
  BlockStatement,
} from 'oxc-parser';
import { parseSource } from '../oxc/parse.js';
import {
  isCallTo,
  getCallArgs,
  getIdentifierName,
  getArrayElements,
  getFunctionBodyStatements,
  getDeclaratorInit,
} from '../oxc/helpers.js';
import type { OptimizablePattern } from './types.js';

/**
 * Walks a TypeScript source file AST to find `useQuery + onUpdate` patterns
 * that the optimizer can replace with bulk WASM calls.
 */
export class AstWalker {
  constructor(private readonly filename: string) {}

  walk(source: string): OptimizablePattern[] {
    const parsed = parseSource(this.filename, source);
    if (!parsed) return [];

    const patterns: OptimizablePattern[] = [];

    walk(parsed.program, {
      enter(node) {
        if (!isCallTo(node, 'defineSystem')) return;
        // node is narrowed to CallExpression by the type predicate
        const args = getCallArgs(node as CallExpression);
        const callback = args[0];
        if (!callback) return;
        if (
          callback.type !== 'ArrowFunctionExpression' &&
          callback.type !== 'FunctionExpression'
        ) return;

        const queryComponents = extractQueryComponents(callback);
        if (queryComponents.length === 0) return;

        const { readComponents, writeComponents, loc } = extractUpdateUsage(
          callback,
          this.filename,  // NOTE: `this` here refers to WalkerThisContextEnter, not AstWalker.
                          // Move `filename` into a closure variable instead (see below).
        );
        patterns.push({ queryComponents, readComponents, writeComponents, loc });
      },
    });

    return patterns;
  }
}
```

> **Note :** Dans la méthode `walk`, `this` à l'intérieur du callback `enter` est le
> `WalkerThisContextEnter` de `oxc-walker`, pas l'instance `AstWalker`. Pour accéder à
> `this.filename`, capturer dans une variable locale avant le callback :
>
> ```typescript
> walk(source: string): OptimizablePattern[] {
>   const filename = this.filename;  // ← capturer ici
>   const parsed = parseSource(filename, source);
>   if (!parsed) return [];
>   const patterns: OptimizablePattern[] = [];
>   walk(parsed.program, {
>     enter(node) {
>       // utiliser `filename` (closure) plutôt que `this.filename`
>       ...
>     },
>   });
>   return patterns;
> }
> ```

```typescript
// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractQueryComponents(fn: Node): string[] {
  const names: string[] = [];
  for (const stmt of getFunctionBodyStatements(fn)) {
    if (stmt.type !== 'VariableDeclaration') continue;
    for (const decl of (stmt as VariableDeclaration).declarations) {
      const init = getDeclaratorInit(decl);
      if (!init || !isCallTo(init, 'useQuery')) continue;
      const arg = getCallArgs(init as CallExpression)[0];
      if (!arg || arg.type !== 'ArrayExpression') continue;
      for (const el of getArrayElements(arg)) {
        const name = getIdentifierName(el);
        if (name) names.push(name);
      }
    }
  }
  return names;
}

function extractUpdateUsage(
  fn: Node,
  filename: string,
): {
  readComponents: string[];
  writeComponents: string[];
  loc: { line: number; column: number; file: string };
} {
  const reads = new Set<string>();
  const writes = new Set<string>();
  let loc = { line: 1, column: 0, file: filename };

  for (const stmt of getFunctionBodyStatements(fn)) {
    if (stmt.type !== 'ExpressionStatement') continue;
    const { expression } = stmt as ExpressionStatement;
    if (!isCallTo(expression, 'onUpdate')) continue;

    loc = { line: (stmt as ExpressionStatement).start, column: 0, file: filename };

    const updateCallback = getCallArgs(expression as CallExpression)[0];
    if (!updateCallback) continue;
    if (
      updateCallback.type !== 'ArrowFunctionExpression' &&
      updateCallback.type !== 'FunctionExpression'
    ) continue;

    for (const inner of getFunctionBodyStatements(updateCallback)) {
      collectUseComponentCalls(inner, reads, writes);
    }
  }

  return { readComponents: [...reads], writeComponents: [...writes], loc };
}

function collectUseComponentCalls(node: Node, reads: Set<string>, writes: Set<string>): void {
  // ForOfStatement — recurse into body
  if (node.type === 'ForOfStatement') {
    const { body } = node as ForOfStatement;
    if (body.type === 'BlockStatement') {
      for (const s of (body as BlockStatement).body) collectUseComponentCalls(s, reads, writes);
    }
    return;
  }

  // const x = useComponent(e, Comp) → READ (2 args)
  if (node.type === 'VariableDeclaration') {
    for (const decl of (node as VariableDeclaration).declarations) {
      const init = getDeclaratorInit(decl);
      if (!init || !isCallTo(init, 'useComponent')) continue;
      const name = getIdentifierName(getCallArgs(init as CallExpression)[1]);
      if (name) reads.add(name);
    }
    return;
  }

  // useComponent(e, Comp, value) → WRITE (3 args)
  if (node.type === 'ExpressionStatement') {
    const { expression } = node as ExpressionStatement;
    if (!isCallTo(expression, 'useComponent')) return;
    const args = getCallArgs(expression as CallExpression);
    if (args.length >= 3) {
      const name = getIdentifierName(args[1]);
      if (name) writes.add(name);
    }
  }
}
```

---

## Étape 6 — Mettre à jour `transform.ts` pour utiliser `oxc-walker`

`transform.ts` a son propre `walkNode()` naïf (itère toutes les clés objet). Le remplacer.

**Dans `packages/vite/src/transform.ts`** :

1. Supprimer la fonction locale `walkNode` (lignes 272–288) et les types `OxcNode`, `OxcError` définis en haut du fichier.

2. Ajouter les imports typés :

```typescript
import { walk } from 'oxc-walker';
import { parseSync } from 'oxc-parser';
import type { Program, ObjectExpression, ObjectProperty } from 'oxc-parser';
```

3. Remplacer le `let program: OxcNode` par `let program: Program` et supprimer le cast `as unknown as OxcNode`.

4. Dans `applyAsConstTransforms`, remplacer `walkNode(program, ...)` par :

```typescript
function applyAsConstTransforms(program: Program, s: MagicString, opts: AsConstOptions): void {
  const insertPositions = new Set<number>();

  walk(program, {
    enter(node) {
      if (node.type !== 'ObjectExpression') return;
      // node est ObjectExpression — properties: Array<ObjectPropertyKind>
      for (const prop of (node as ObjectExpression).properties) {
        if (prop.type !== 'Property') continue;
        // prop est ObjectProperty — key: PropertyKey, value: Expression
        const { key, value } = prop as ObjectProperty;

        const keyName: string | null =
          key.type === 'Identifier'
            ? key.name
            : key.type === 'Literal' && typeof (key as any).value === 'string'
              ? String((key as any).value)
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
    },
  });

  const sorted = [...insertPositions].sort((a, b) => b - a);
  for (const pos of sorted) {
    s.appendLeft(pos, ' as const');
  }
}
```

> **Note :** Le seul `(key as any)` restant concerne l'accès à `.value` sur un `Literal` clé
> d'objet. Ceci est nécessaire car `PropertyKey = IdentifierName | PrivateIdentifier | Expression`
> et `StringLiteral` (qui a `type: 'Literal'`) n'est pas discriminable directement sans cast
> dans ce contexte. Alternative propre : importer `StringLiteral` et caster explicitement :
> `(key as StringLiteral).value`.

---

## Étape 7 — Supprimer Babel de `package.json`

**Fichier :** `packages/vite/package.json`

```diff
 "dependencies": {
-  "@babel/parser": "^7.29.2",
-  "@babel/traverse": "^7.29.0",
-  "@babel/types": "^7.29.0",
   "oxc-parser": "^0.123.0",
+  "oxc-walker": "^0.7.0",
   "magic-string": "^0.30.0"
 },
 "devDependencies": {
-  "@types/babel__parser": "^7.1.5",
-  "@types/babel__traverse": "^7.28.0",
 }
```

```bash
cd packages/vite
npm uninstall @babel/parser @babel/traverse @babel/types
npm uninstall -D @types/babel__parser @types/babel__traverse
npm install oxc-walker
```

---

## Étape 8 — Vérification

```bash
cd packages/vite

# TypeScript compile
npx tsc --noEmit

# Tests
npx vitest run

# Vérifier qu'aucun import Babel ne reste
grep -r "@babel" src/
# Attendu : 0 résultats

# Vérifier les imports oxc-walker
grep -r "from 'oxc-walker'" src/
# Attendu : src/oxc/index.ts, src/optimizer/ast-walker.ts, src/transform.ts
```

---

## Résumé des fichiers créés/modifiés

| Fichier | Modification |
|---------|-------------|
| `packages/vite/package.json` | Suppression Babel, ajout `oxc-walker` |
| `packages/vite/src/oxc/helpers.ts` | **Nouveau** — utilitaires nœuds OXC (pas de walker custom) |
| `packages/vite/src/oxc/parse.ts` | **Nouveau** — wrapper `parseSync` |
| `packages/vite/src/oxc/index.ts` | **Nouveau** — barrel (re-export `oxc-walker` + helpers + parse) |
| `packages/vite/src/optimizer/ast-walker.ts` | Réécriture complète → `oxc-walker` |
| `packages/vite/src/transform.ts` | Suppression `walkNode` local → `walk` depuis `oxc-walker` |
