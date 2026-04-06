# Plan VITE-02 — Optimizer Phase 2 : génération de code bulk WASM

## Objectif

Activer la Phase 2 du plugin `gwen:optimizer` : transformer les patterns `useQuery + onUpdate`
détectés en Phase 1 en appels bulk WASM réels via `MagicString`.

Phase 1 (actuelle) : `transform()` retourne `null` après détection.
Phase 2 (ce plan) : `transform()` retourne le code réécrit avec source maps.

**Gain de performance cible :** 1 000 entités → de N crossings WASM/frame à 1–2 crossing/frame.

---

## Contexte : fichiers concernés

| Fichier | Rôle actuel | Modifications |
|---------|-------------|--------------|
| `packages/vite/src/optimizer/types.ts` | Types `OptimizablePattern`, `ComponentEntry` | Ajouter champs de position AST |
| `packages/vite/src/optimizer/ast-walker.ts` | Détecte patterns (Babel → OXC après VITE-01) | Ajouter extraction des positions source |
| `packages/vite/src/optimizer/bulk-transformer.ts` | N'existe pas | **Créer** : applique `MagicString` |
| `packages/vite/src/optimizer/code-generator.ts` | Génère snippets bulk | Aucun changement |
| `packages/vite/src/plugins/optimizer.ts` | Phase 1 : retourne `null` | Câbler Phase 2 |

**Prérequis :** VITE-01 (`oxc-walker` + helpers) et VITE-04 (ComponentScanner) doivent être
appliqués avant ce plan pour que le manifest soit peuplé et que `PatternDetector.classify()` fonctionne.

---

## Pattern d'entrée détecté par AstWalker

```typescript
// src/systems/movement.ts
defineSystem(() => {
  const entities = useQuery([Position, Velocity]);

  onUpdate(() => {
    for (const e of entities) {
      const pos = useComponent(e, Position);           // lecture
      const vel = useComponent(e, Velocity);           // lecture
      useComponent(e, Position, { x: pos.x + vel.x,  // écriture
                                  y: pos.y + vel.y });
    }
  });
});
```

## Code généré attendu (Phase 2)

```typescript
// src/systems/movement.ts  (transformé)
defineSystem(() => {
  const entities = useQuery([Position, Velocity]);

  onUpdate(() => {
    // --- gwen:optimizer bulk read ---
    const { entityCount: _count_position, data: _position, slots: _slots, gens: _gens } =
      __gwen_bridge__.queryReadBulk([1, 2], 1, 2);
    const { data: _velocity } =
      __gwen_bridge__.queryReadBulk([1, 2], 2, 2);
    // --- gwen:optimizer bulk loop ---
    for (let _i = 0; _i < _count_position; _i++) {
      _position[_i * 2 + 0] = _position[_i * 2 + 0] + _velocity[_i * 2 + 0];
      _position[_i * 2 + 1] = _position[_i * 2 + 1] + _velocity[_i * 2 + 1];
    }
    // --- gwen:optimizer bulk write ---
    __gwen_bridge__.queryWriteBulk(_slots, _gens, 1, _position);
  });
});
```

---

## Étape 1 — Étendre `OptimizablePattern` avec les positions source

**Fichier :** `packages/vite/src/optimizer/types.ts`

Ajouter l'interface `PatternPositions` et l'ajouter à `OptimizablePattern` :

```typescript
/**
 * Source positions needed by BulkTransformer to rewrite an optimizable pattern.
 * All positions are byte offsets into the original source string.
 */
export interface PatternPositions {
  /**
   * The for-of loop: `for (const e of entities) { ... }`
   * start = position of `for`, end = position after closing `}`
   */
  readonly forOfStart: number;
  readonly forOfEnd: number;
  /** The iteration variable name (e.g. `'e'` from `for (const e of entities)`) */
  readonly entityVar: string;
  /**
   * Each `const varName = useComponent(entity, ComponentName)` read declaration.
   * start/end cover the entire VariableDeclaration statement (including semicolon if present).
   */
  readonly readDecls: ReadonlyArray<{
    readonly varName: string;      // e.g. 'pos'
    readonly component: string;    // e.g. 'Position'
    readonly start: number;
    readonly end: number;
  }>;
  /**
   * Each `useComponent(entity, ComponentName, { field: value, ... })` write call.
   * start/end cover the entire ExpressionStatement.
   * fields: the key/value pairs from the object literal argument.
   */
  readonly writeCalls: ReadonlyArray<{
    readonly component: string;
    readonly fields: ReadonlyArray<{
      readonly name: string;
      /** start/end of the *value* expression (e.g. `pos.x + vel.x`) */
      readonly valueStart: number;
      readonly valueEnd: number;
    }>;
    readonly start: number;
    readonly end: number;
  }>;
  /**
   * Each `varName.fieldName` MemberExpression access inside the loop body.
   * Used to rewrite `pos.x` → `_position[_i * 2 + 0]`.
   */
  readonly propAccesses: ReadonlyArray<{
    readonly varName: string;       // e.g. 'pos'
    readonly fieldName: string;     // e.g. 'x'
    readonly start: number;
    readonly end: number;
  }>;
}
```

Modifier `OptimizablePattern` (ajouter le champ `positions` optionnel) :

```typescript
export interface OptimizablePattern {
  readonly queryComponents: string[];
  readonly readComponents: string[];
  readonly writeComponents: string[];
  readonly loc: { line: number; column: number; file: string };
  /** Populated in Phase 2 by OXC walker with exact source positions. */
  readonly positions?: PatternPositions;
}
```

---

## Étape 2 — Étendre `AstWalker.walk()` pour extraire `positions`

**Fichier :** `packages/vite/src/optimizer/ast-walker.ts`

Après avoir migré vers OXC (VITE-01), étendre la fonction d'extraction des patterns
pour capturer les positions source requises par `BulkTransformer`.

Ajouter une fonction `extractForOfPositions` après la migration OXC.
Elle est appelée en plus de `extractUpdateUsage` et retourne un `PatternPositions`.

### Logique de `extractForOfPositions`

Paramètres : `onUpdateCallback` (le nœud FunctionExpression/ArrowFunctionExpression passé à onUpdate),
`filename: string`, `readVarToComponent: Map<string, string>` (map `'pos' → 'Position'`).

```
Pour chaque statement du body de onUpdateCallback :
  Si c'est un ForOfStatement :
    1. entityVar = nom de la variable du VariableDeclarator gauche (e.g. 'e')
    2. forOfStart = node.start, forOfEnd = node.end
    3. Scanner le body du ForOf :
       a. readDecls : tous les VariableDeclaration où init est CallExpression 'useComponent'
          avec 2 arguments → { varName, component, start, end }
       b. writeCalls : tous les ExpressionStatement où expression est CallExpression 'useComponent'
          avec 3 arguments → { component, fields depuis ObjectExpression argument[2], start, end }
          Pour chaque Property dans l'objet :
            { name: clé, valueStart: prop.value.start, valueEnd: prop.value.end }
       c. propAccesses : tous les MemberExpression de la forme identifier.identifier
          où l'objet est dans readVarToComponent → { varName, fieldName, start, end }
          (walk récursif du body du ForOf, exclure les noeuds déjà dans writeCalls)
```

### Signature de la méthode `walk` étendue

```typescript
// Dans AstWalker
walk(source: string): OptimizablePattern[] {
  // ... parse avec OXC ...
  // Pour chaque defineSystem trouvé :
  //   - extractQueryComponents → queryComponents
  //   - extractUpdateUsage → { readComponents, writeComponents, loc }
  //   - buildReadVarMap → Map<varName, componentName> depuis les readDecls
  //   - extractForOfPositions → PatternPositions
  //   → push({ queryComponents, readComponents, writeComponents, loc, positions })
}
```

### Fonction `buildReadVarMap`

Parcourir les statements du body de onUpdateCallback, collecter tous les
`const varName = useComponent(e, ComponentName)` et retourner `Map<varName, componentName>`.

---

## Étape 3 — Créer `src/optimizer/bulk-transformer.ts`

**Fichier :** `packages/vite/src/optimizer/bulk-transformer.ts` *(nouveau)*

Ce module prend un pattern optimizable avec ses positions et applique les transformations
via `MagicString`.

```typescript
import MagicString from 'magic-string';
import type { ComponentManifest } from './component-manifest.js';
import type { OptimizablePattern, PatternPositions } from './types.js';
import { CodeGenerator } from './code-generator.js';
import type { WasmTier } from './types.js';

/**
 * Applies the Phase 2 bulk WASM transformation to a single `OptimizablePattern`.
 *
 * Uses `MagicString` for position-based replacements so that source maps
 * remain accurate for the browser devtools / TypeScript error overlay.
 *
 * Algorithm:
 *  1. For each read component, generate a `queryReadBulk` call.
 *     The FIRST read component also extracts `slots` and `gens` (used for the write).
 *  2. Build variable name maps: component name → data variable (e.g. Position → _position)
 *  3. Replace prop accesses inside the loop body: `pos.x` → `_position[_i * 2 + 0]`
 *     Process in REVERSE source order to avoid invalidating offsets.
 *  4. Remove write call statements (replaced by bulk write after the loop).
 *  5. Remove read declaration statements (data is now in the typed array).
 *  6. Replace the for-of loop signature `for (const e of entities)` with
 *     `for (let _i = 0; _i < _count_<firstReadComponent>; _i++)`.
 *  7. After the for-of loop closing `}`, insert `queryWriteBulk` call for each
 *     write component.
 *  8. Before the for-of loop, insert all `queryReadBulk` declarations.
 *
 * @param s        - MagicString wrapping the original source.
 * @param pattern  - Detected optimizable pattern with positions.
 * @param manifest - Build-time component registry.
 * @param tier     - WASM tier for code generation.
 * @returns `true` if transformation was applied, `false` if positions are missing.
 */
export function applyBulkTransform(
  s: MagicString,
  pattern: OptimizablePattern,
  manifest: ComponentManifest,
  tier: WasmTier,
): boolean {
  const pos = pattern.positions;
  if (!pos) return false;

  const gen = new CodeGenerator(manifest, tier);

  // ── Build component variable name map ──────────────────────────────────────
  // Map: 'Position' → '_position', 'Velocity' → '_velocity'
  const compToDataVar = new Map<string, string>();
  for (const comp of [...pattern.readComponents, ...pattern.writeComponents]) {
    compToDataVar.set(comp, `_${comp.toLowerCase()}`);
  }
  // Map read variable names from source to component: 'pos' → 'Position'
  const varToComp = new Map<string, string>();
  for (const decl of pos.readDecls) {
    varToComp.set(decl.varName, decl.component);
  }

  // ── Step 3: Replace property accesses (reverse order) ─────────────────────
  // Sort descending by start to process last-first (safe for MagicString)
  const sortedAccesses = [...pos.propAccesses].sort((a, b) => b.start - a.start);
  for (const acc of sortedAccesses) {
    const comp = varToComp.get(acc.varName);
    if (!comp) continue;
    const entry = manifest.get(comp);
    if (!entry) continue;
    const fieldMeta = entry.fields.find((f) => f.name === acc.fieldName);
    if (!fieldMeta) continue;

    const fieldIndex = fieldMeta.byteOffset / 4;
    const dataVar = compToDataVar.get(comp)!;
    // Replace `pos.x` (start..end) with `_position[_i * 2 + 0]`
    s.overwrite(acc.start, acc.end, `${dataVar}[_i * ${entry.f32Stride} + ${fieldIndex}]`);
  }

  // ── Step 4 & 5: Remove write calls and read decls (reverse order) ──────────
  const toRemove = [
    ...pos.writeCalls.map((w) => ({ start: w.start, end: w.end })),
    ...pos.readDecls.map((d) => ({ start: d.start, end: d.end })),
  ].sort((a, b) => b.start - a.start);

  for (const range of toRemove) {
    s.remove(range.start, range.end);
  }

  // ── Step 6: Replace for-of loop signature ──────────────────────────────────
  // Find the `for (const e of entities)` part (from forOfStart up to the first `{`)
  // We overwrite the for-of loop signature with a numeric for loop.
  // The closing `}` and loop body content stay — MagicString only replaces the header.
  //
  // Strategy: replace from forOfStart to the start of the loop body `{`.
  // We need to find the `{` after `for (...)` — use string search from forOfStart.
  // NOTE: The loop body start is pos.forOfStart + `for (const ${entityVar} of entities)`.length
  // but exact position is unknown here. The Walker must capture `forBodyStart` too.
  //
  // **The walker (Step 2) must also capture `forBodyStart`** (the position of `{`).
  // For now this field is assumed to be part of PatternPositions (add to Step 1 if missing).
  //
  // Replace `for (const e of entities) {` with `for (let _i = 0; _i < _count_position; _i++) {`
  const firstReadComp = pattern.readComponents[0] ?? pattern.writeComponents[0];
  const countVar = `_count_${firstReadComp.toLowerCase()}`;
  // forLoopHeaderEnd = start of `{` (the loop body opening brace) — captured by walker
  // s.overwrite(pos.forOfStart, pos.forBodyStart, `for (let _i = 0; _i < ${countVar}; _i++) `);

  // ── Step 7: Insert queryWriteBulk after loop closing `}` ──────────────────
  const writeLines: string[] = [];
  for (const comp of pattern.writeComponents) {
    const dataVar = compToDataVar.get(comp)!;
    writeLines.push('\n    ' + gen.generateBulkWrite(comp, '_slots', '_gens', dataVar) + ';');
  }
  if (writeLines.length > 0) {
    s.appendLeft(pos.forOfEnd, writeLines.join(''));
  }

  // ── Step 8: Insert queryReadBulk declarations before the for loop ──────────
  const readLines: string[] = [];
  let firstRead = true;
  for (const comp of pattern.readComponents) {
    const entry = manifest.get(comp);
    if (!entry) continue;
    const dataVar = compToDataVar.get(comp)!;

    if (firstRead) {
      // First component: extract slots + gens for the write
      readLines.push(gen.generateBulkRead(pattern.queryComponents, comp) + ';');
      firstRead = false;
    } else {
      // Subsequent read components: only extract data
      const typeIds = pattern.queryComponents.map((n) => manifest.get(n)!.typeId);
      readLines.push(
        `const { data: ${dataVar} } = __gwen_bridge__.queryReadBulk([${typeIds.join(', ')}], ${entry.typeId}, ${entry.f32Stride});`,
      );
    }
  }
  // Also handle write-only components (not in readComponents)
  for (const comp of pattern.writeComponents) {
    if (pattern.readComponents.includes(comp)) continue;
    const entry = manifest.get(comp);
    if (!entry) continue;
    const dataVar = compToDataVar.get(comp)!;
    const typeIds = pattern.queryComponents.map((n) => manifest.get(n)!.typeId);
    if (firstRead) {
      readLines.push(
        `const { entityCount: ${countVar}, data: ${dataVar}, slots: _slots, gens: _gens } = __gwen_bridge__.queryReadBulk([${typeIds.join(', ')}], ${entry.typeId}, ${entry.f32Stride});`,
      );
      firstRead = false;
    } else {
      readLines.push(
        `const { data: ${dataVar} } = __gwen_bridge__.queryReadBulk([${typeIds.join(', ')}], ${entry.typeId}, ${entry.f32Stride});`,
      );
    }
  }

  if (readLines.length > 0) {
    s.prependLeft(pos.forOfStart, readLines.map((l) => '    ' + l).join('\n') + '\n    ');
  }

  return true;
}
```

> **Note :** Le commentaire sur `forBodyStart` dans Step 6 indique que le walker (Step 2)
> doit capturer la position du `{` d'ouverture du corps du for-of pour que l'overwrite
> fonctionne correctement. Ajouter `forBodyStart: number` à `PatternPositions`.

---

## Étape 4 — Mettre à jour `PatternPositions` avec `forBodyStart`

**Fichier :** `packages/vite/src/optimizer/types.ts`

Ajouter le champ `forBodyStart` à l'interface `PatternPositions` :

```typescript
export interface PatternPositions {
  readonly forOfStart: number;
  readonly forBodyStart: number;  // ← AJOUTER : position du `{` du corps du for-of
  readonly forOfEnd: number;
  readonly entityVar: string;
  // ... (reste inchangé)
}
```

Le walker OXC (Step 2) doit extraire `forBodyStart` depuis le nœud ForOfStatement :
- OXC : `forOfNode.body.start` (le nœud BlockStatement a `.start` qui pointe sur `{`)

Et modifier le code dans `bulk-transformer.ts` Step 6 pour utiliser `pos.forBodyStart` :

```typescript
// Step 6 dans applyBulkTransform :
s.overwrite(
  pos.forOfStart,
  pos.forBodyStart,
  `for (let _i = 0; _i < ${countVar}; _i++) `
);
```

---

## Étape 5 — Câbler Phase 2 dans `optimizer.ts`

**Fichier :** `packages/vite/src/plugins/optimizer.ts`

Importer `applyBulkTransform` et remplacer le `return null` final.

### Changements dans les imports

```typescript
import MagicString from 'magic-string';                         // ← ajouter
import { applyBulkTransform } from '../optimizer/bulk-transformer.js'; // ← ajouter
```

### Réécrire la partie `transform`

```typescript
transform(code: string, id: string) {
  if (!id.endsWith('.ts') && !id.endsWith('.tsx')) return null;
  if (!code.includes('useQuery') || !code.includes('onUpdate')) return null;

  const walker = new AstWalker(id);
  const patterns = walker.walk(code);
  if (patterns.length === 0) return null;

  const detector = new PatternDetector(manifest);
  const s = new MagicString(code);
  let transformed = false;

  for (const pattern of patterns) {
    const result = detector.classify(pattern);
    if (!result.optimizable) {
      if (debug) {
        console.log(`[gwen:optimizer] Skipping in ${id}: ${result.reason}`);
      }
      continue;
    }

    if (debug) {
      console.log(
        `[gwen:optimizer] Transforming pattern in ${id}:`,
        pattern.queryComponents.join(', '),
      );
    }

    const applied = applyBulkTransform(s, pattern, manifest, _tier);
    if (applied) transformed = true;
  }

  if (!transformed) return null;

  return {
    code: s.toString(),
    map: s.generateMap({ hires: true, source: id, includeContent: true }),
  };
},
```

---

## Étape 6 — Tests unitaires pour `BulkTransformer`

**Fichier :** `packages/vite/src/optimizer/bulk-transformer.test.ts` *(nouveau)*

### Test 1 : transformation complète (1 composant lu + écrit)

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import MagicString from 'magic-string';
import { ComponentManifest } from './component-manifest.js';
import { applyBulkTransform } from './bulk-transformer.js';

const INPUT = `
defineSystem(() => {
  const entities = useQuery([Position]);
  onUpdate(() => {
    for (const e of entities) {
      const pos = useComponent(e, Position);
      useComponent(e, Position, { x: pos.x + 1, y: pos.y });
    }
  });
});
`.trim();

describe('applyBulkTransform', () => {
  let manifest: ComponentManifest;

  beforeEach(() => {
    manifest = new ComponentManifest();
    manifest.register({
      name: 'Position',
      typeId: 1,
      byteSize: 8,
      f32Stride: 2,
      fields: [
        { name: 'x', type: 'f32', byteOffset: 0 },
        { name: 'y', type: 'f32', byteOffset: 4 },
      ],
      importPath: 'src/components/position.ts',
      exportName: 'Position',
    });
  });

  it('retourne false si positions absentes', () => {
    const s = new MagicString(INPUT);
    const pattern = {
      queryComponents: ['Position'],
      readComponents: ['Position'],
      writeComponents: ['Position'],
      loc: { line: 1, column: 0, file: 'test.ts' },
      // pas de positions
    };
    expect(applyBulkTransform(s, pattern, manifest, 'core')).toBe(false);
  });

  it('génère queryReadBulk avant le for loop', () => {
    // Ce test nécessite un pattern avec positions correctes.
    // Utiliser AstWalker sur INPUT pour extraire le pattern.
    // Vérifier que le code transformé contient '__gwen_bridge__.queryReadBulk'.
    // Vérifier que la boucle for-of est remplacée par for (let _i = 0; ...).
    // Vérifier que '__gwen_bridge__.queryWriteBulk' est présent après la boucle.
    // Note : test d'intégration — requiert VITE-01 pour le walker OXC.
  });
});
```

### Test 2 : 2 composants (1 read-only + 1 read-write)

```typescript
it('génère 2 queryReadBulk pour Position + Velocity', () => {
  // Enregistrer Velocity avec typeId: 2, f32Stride: 2
  // Créer un pattern avec readComponents: ['Position', 'Velocity'],
  //   writeComponents: ['Position']
  // Vérifier : 2 queryReadBulk, 1 queryWriteBulk
  // Vérifier : seul le 1er queryReadBulk extrait _slots et _gens
});
```

### Test 3 : positions manquantes = no-op

```typescript
it('ne modifie pas le code si le pattern n\'a pas de positions', () => {
  const s = new MagicString(INPUT);
  const result = applyBulkTransform(s, patternWithoutPositions, manifest, 'core');
  expect(result).toBe(false);
  expect(s.hasChanged()).toBe(false);
});
```

---

## Étape 7 — Mettre à jour `package.json` pour importer `magic-string`

**Fichier :** `packages/vite/package.json`

Vérifier que `magic-string` est dans `dependencies` (pas seulement `devDependencies`).
Si absent, l'ajouter :

```json
{
  "dependencies": {
    "magic-string": "^0.30.0"
  }
}
```

---

## Checklist d'implémentation

- [ ] Étape 1 : Ajouter `PatternPositions` à `types.ts` (avec `forBodyStart`)
- [ ] Étape 2 : Étendre `AstWalker` avec `extractForOfPositions` + `buildReadVarMap`
- [ ] Étape 3 : Créer `bulk-transformer.ts` avec `applyBulkTransform`
- [ ] Étape 4 : Câbler dans `optimizer.ts` : remplacer `return null` final
- [ ] Étape 5 : Tests `bulk-transformer.test.ts`
- [ ] Étape 6 : Vérifier que `magic-string` est dans les deps

## Impact WASM/TypeScript

- Les noms de méthodes `queryReadBulk` / `queryWriteBulk` doivent exister sur `WasmBridge`
  (vérifier dans `packages/core/src/engine/wasm-bridge.ts` — si absent, cette implémentation
  sera no-op tant que les méthodes ne sont pas ajoutées côté Rust).
- Le nom `__gwen_bridge__` est une variable globale injectée par `gwen:virtual` —
  vérifier qu'elle est disponible dans les fichiers de systèmes utilisateurs.
- Aucun impact sur `packages/physics2d` ou `packages/physics3d`.
