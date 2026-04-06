# Plan VITE-04 — ComponentScanner : peupler le manifest au buildStart

## Objectif

Le `ComponentManifest` dans `gwen:optimizer` est créé et vidé à chaque `buildStart`
mais **n'est jamais peuplé** — `manifest.register()` n'est appelé nulle part.
Résultat : `PatternDetector.classify()` retourne toujours
`"Component 'X' not found in manifest"` et Phase 2 ne peut jamais s'activer.

Ce plan crée un `ComponentScanner` qui :
1. Scan tous les fichiers source du projet en `buildStart` via `oxc-walker`
2. Extrait chaque `defineComponent({ name, schema, _typeId })` call
3. Peuple le `ComponentManifest` avec les `ComponentEntry` dérivés

**Prérequis :** VITE-01 (`oxc-walker` installé + `src/oxc/helpers.ts` + `src/oxc/parse.ts`).

---

## Contexte : structure d'un `defineComponent`

```typescript
// src/components/position.ts
import { defineComponent, Types } from '@gwenjs/core';

export const Position = defineComponent({
  name: 'Position',
  _typeId: 1,  // stable ID — recommandé pour l'optimizer
  schema: {
    x: Types.f32,
    y: Types.f32,
  },
});
```

### Deux stratégies pour les typeIds

**Stratégie A (recommandée) :** `_typeId` déclaré explicitement par l'utilisateur → extrait directement.

**Stratégie B (fallback) :** Si `_typeId` absent → assigner par ordre alphabétique après le plus haut ID explicite.

---

## Étape 1 — Créer `src/optimizer/component-scanner.ts`

**Fichier :** `packages/vite/src/optimizer/component-scanner.ts` *(nouveau)*

```typescript
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { walk } from 'oxc-walker';
import type {
  VariableDeclarator,
  CallExpression,
  ObjectExpression,
  ObjectProperty,
  StringLiteral,
  NumericLiteral,
  StaticMemberExpression,
} from 'oxc-parser';
import {
  parseSource,
  isCallTo,
  getCallArgs,
  getObjectProperties,
  getPropertyKeyName,
} from '../oxc/index.js';
import type { ComponentManifest } from './component-manifest.js';
import type { ComponentEntry, ComponentFieldMeta } from './types.js';

/**
 * Scans source files for `defineComponent(...)` calls and populates the manifest.
 *
 * @example
 * ```ts
 * const scanner = new ComponentScanner(manifest)
 * scanner.scanFiles(['/project/src/components/position.ts'])
 * ```
 */
export class ComponentScanner {
  constructor(private readonly manifest: ComponentManifest) {}

  /**
   * Scan an array of absolute file paths and register all found `defineComponent` calls.
   * After scanning, assigns fallback numeric IDs to components without `_typeId`.
   */
  scanFiles(files: string[]): void {
    for (const file of files) {
      try {
        const code = readFileSync(file, 'utf-8');
        this.scanSource(code, file);
      } catch {
        // Silently skip unreadable files
      }
    }
    this._assignFallbackIds();
  }

  /**
   * Scan a single source string and register found `defineComponent` calls.
   *
   * @param source   - TypeScript source code.
   * @param filename - Absolute path (stored as `importPath` in ComponentEntry).
   */
  scanSource(source: string, filename: string): void {
    if (!source.includes('defineComponent')) return;

    const parsed = parseSource(filename, source);
    if (!parsed) return;

    walk(parsed.program, {
      enter: (node) => {
        if (node.type !== 'VariableDeclarator') return;
        // node is VariableDeclarator — id: BindingPattern, init: Expression | null
        const { id, init } = node as VariableDeclarator;
        if (id.type !== 'Identifier') return;
        if (!init || !isCallTo(init, 'defineComponent')) return;

        const exportName = id.name;
        const args = getCallArgs(init as CallExpression);
        if (args.length === 0) return;

        const configArg = args[0];
        if (configArg.type !== 'ObjectExpression') return;

        const entry = this._extractEntry(configArg as ObjectExpression, exportName, filename);
        if (entry) this.manifest.register(entry);
      },
    });
  }

  // ──────────────────────────────────────────────────────────────────────────

  private _extractEntry(
    configObj: ObjectExpression,
    exportName: string,
    importPath: string,
  ): ComponentEntry | null {
    let name: string | null = null;
    let typeId: number | null = null;
    let schema: Record<string, string> | null = null;

    for (const prop of getObjectProperties(configObj)) {
      const key = getPropertyKeyName(prop);
      if (!key) continue;
      // prop is ObjectProperty (type: 'Property') — .value: Expression
      const { value } = prop as ObjectProperty;

      switch (key) {
        case 'name':
          // StringLiteral has type: 'Literal', value: string
          if (value.type === 'Literal' && typeof (value as StringLiteral).value === 'string') {
            name = (value as StringLiteral).value;
          }
          break;
        case '_typeId':
          // NumericLiteral has type: 'Literal', value: number
          if (value.type === 'Literal' && typeof (value as NumericLiteral).value === 'number') {
            typeId = (value as NumericLiteral).value;
          }
          break;
        case 'schema':
          if (value.type === 'ObjectExpression') {
            schema = this._extractSchema(value as ObjectExpression);
          }
          break;
      }
    }

    if (!name || !schema) return null;

    const fields = this._buildFields(schema);
    return {
      name,
      typeId: typeId ?? -1, // -1 = needs fallback ID
      byteSize: fields.length * 4,
      f32Stride: fields.length,
      fields,
      importPath,
      exportName,
    };
  }

  /**
   * Extract schema fields from `{ x: Types.f32, y: Types.f32 }`.
   *
   * - `Types.f32` → StaticMemberExpression { object: 'Types', property: 'f32' }
   * - `'f32'`     → StringLiteral (type: 'Literal', value: 'f32')
   */
  private _extractSchema(schemaObj: ObjectExpression): Record<string, string> {
    const result: Record<string, string> = {};

    for (const prop of getObjectProperties(schemaObj)) {
      const key = getPropertyKeyName(prop);
      if (!key) continue;
      const { value } = prop as ObjectProperty;

      // Types.f32 → StaticMemberExpression — type: 'MemberExpression', computed: false
      if (value.type === 'MemberExpression') {
        const mem = value as StaticMemberExpression;
        if (mem.object.type === 'Identifier' && mem.object.name === 'Types') {
          // property is IdentifierName (type: 'Identifier', name: string)
          result[key] = mem.property.name;
        }
        continue;
      }

      // String fallback: { x: 'f32' }
      if (value.type === 'Literal' && typeof (value as StringLiteral).value === 'string') {
        result[key] = (value as StringLiteral).value;
      }
    }

    return result;
  }

  /** Build ordered fields array with cumulative byteOffsets (4 bytes per field). */
  private _buildFields(schema: Record<string, string>): ReadonlyArray<ComponentFieldMeta> {
    return Object.entries(schema).map(([fieldName, type], i) => ({
      name: fieldName,
      type,
      byteOffset: i * 4,
    }));
  }

  /**
   * Assign stable IDs to components with `typeId === -1`.
   * Sorted alphabetically, IDs start after the highest explicit ID.
   */
  private _assignFallbackIds(): void {
    const all = [...this.manifest.entries()];
    const explicit = all.filter((e) => e.typeId !== -1);
    const needsId = all.filter((e) => e.typeId === -1);
    if (needsId.length === 0) return;

    const maxExplicit = explicit.length > 0 ? Math.max(...explicit.map((e) => e.typeId)) : 0;
    const sorted = [...needsId].sort((a, b) => a.name.localeCompare(b.name));
    let nextId = maxExplicit + 1;
    for (const entry of sorted) {
      (entry as { typeId: number }).typeId = nextId++;
      this.manifest.register(entry);
    }
  }
}

/**
 * Recursively find all `.ts` / `.tsx` source files in a directory,
 * excluding test files and `.d.ts` declarations.
 */
export function findComponentFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const result: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      result.push(...findComponentFiles(full));
    } else if (
      (entry.endsWith('.ts') || entry.endsWith('.tsx')) &&
      !entry.endsWith('.test.ts') &&
      !entry.endsWith('.test.tsx') &&
      !entry.endsWith('.d.ts')
    ) {
      result.push(full);
    }
  }
  return result;
}
```

> **Note sur les casts `as StringLiteral` / `as NumericLiteral` :** Dans OXC/ESTree,
> `StringLiteral` et `NumericLiteral` ont tous les deux `type: 'Literal'`. TypeScript ne peut
> donc pas discriminer les deux avec le seul `node.type`. Après `value.type === 'Literal'`,
> on caste vers le type spécifique puis on vérifie `typeof .value` pour la sécurité runtime.
> C'est le seul endroit où des casts explicites sont nécessaires dans ces helpers.

---

## Étape 2 — Câbler dans `optimizer.ts`

**Fichier :** `packages/vite/src/plugins/optimizer.ts`

### Ajouter les imports

```typescript
import { ComponentScanner, findComponentFiles } from '../optimizer/component-scanner.js';
```

### Ajouter `configResolved` + modifier `buildStart`

```typescript
let _root = process.cwd();

return {
  name: 'gwen:optimizer',

  configResolved(config) {
    _root = config.root;
  },

  async buildStart() {
    manifest.clear();
    const compDir = `${_root}/${options.componentsDir ?? 'src'}`;
    const files = findComponentFiles(compDir);
    const scanner = new ComponentScanner(manifest);
    scanner.scanFiles(files);

    if (debug) {
      console.log(`[gwen:optimizer] ${manifest.size} component(s) registered`);
      for (const entry of manifest.entries()) {
        console.log(`  ${entry.name}: typeId=${entry.typeId}, stride=${entry.f32Stride}`);
      }
    }
  },
  // ... reste inchangé
};
```

---

## Étape 3 — Ajouter `componentsDir` à `GwenOptimizerOptions`

```typescript
export interface GwenOptimizerOptions {
  debug?: boolean;
  tier?: WasmTier;
  /**
   * Directory (relative to project root) to scan for `defineComponent` calls.
   * @default 'src'
   */
  componentsDir?: string;
}
```

---

## Étape 4 — Tests unitaires

**Fichier :** `packages/vite/src/optimizer/component-scanner.test.ts` *(nouveau)*

```typescript
import { describe, it, expect } from 'vitest';
import { ComponentManifest } from './component-manifest.js';
import { ComponentScanner } from './component-scanner.js';

describe('ComponentScanner', () => {
  it('extrait un composant avec _typeId explicite et schema Types.*', () => {
    const manifest = new ComponentManifest();
    const scanner = new ComponentScanner(manifest);
    scanner.scanSource(`
      export const Position = defineComponent({
        name: 'Position', _typeId: 1,
        schema: { x: Types.f32, y: Types.f32 },
      });
    `, 'position.ts');
    scanner.scanFiles([]);

    const e = manifest.get('Position')!;
    expect(e.typeId).toBe(1);
    expect(e.f32Stride).toBe(2);
    expect(e.fields[0]).toEqual({ name: 'x', type: 'f32', byteOffset: 0 });
    expect(e.fields[1]).toEqual({ name: 'y', type: 'f32', byteOffset: 4 });
    expect(e.exportName).toBe('Position');
  });

  it('assigne des IDs fallback alphabétiques si _typeId absent', () => {
    const manifest = new ComponentManifest();
    const scanner = new ComponentScanner(manifest);
    scanner.scanSource(`
      export const Velocity = defineComponent({ name: 'Velocity', schema: { x: Types.f32 } });
      export const Position = defineComponent({ name: 'Position', schema: { x: Types.f32 } });
    `, 'components.ts');
    scanner.scanFiles([]);

    expect(manifest.get('Position')!.typeId).toBe(1); // alphabetically first
    expect(manifest.get('Velocity')!.typeId).toBe(2);
  });

  it('ignore les composants sans schema', () => {
    const manifest = new ComponentManifest();
    const scanner = new ComponentScanner(manifest);
    scanner.scanSource(`export const Tag = defineComponent({ name: 'Tag' });`, 'tag.ts');
    expect(manifest.size).toBe(0);
  });

  it('ignore defineComponent dans un commentaire', () => {
    const manifest = new ComponentManifest();
    const scanner = new ComponentScanner(manifest);
    scanner.scanSource(
      `// const F = defineComponent({ name: 'F', schema: { x: Types.f32 } });`, 'c.ts'
    );
    expect(manifest.size).toBe(0);
  });

  it('respecte les IDs explicites lors de l\'attribution des fallback IDs', () => {
    const manifest = new ComponentManifest();
    const scanner = new ComponentScanner(manifest);
    scanner.scanSource(`
      export const A = defineComponent({ name: 'A', _typeId: 5, schema: { v: Types.f32 } });
      export const B = defineComponent({ name: 'B', schema: { v: Types.f32 } });
    `, 'mixed.ts');
    scanner.scanFiles([]);

    expect(manifest.get('A')!.typeId).toBe(5);
    expect(manifest.get('B')!.typeId).toBe(6);
  });
});
```

---

## Checklist d'implémentation

- [ ] Étape 1 : Créer `component-scanner.ts` avec `ComponentScanner` + `findComponentFiles`
- [ ] Étape 2 : Câbler dans `optimizer.ts` (`configResolved` + `buildStart`)
- [ ] Étape 3 : Ajouter `componentsDir` à `GwenOptimizerOptions`
- [ ] Étape 4 : Tests `component-scanner.test.ts` (5 cas)

## Impact

- **Sans ce plan** : Phase 2 (VITE-02) ne peut jamais s'activer — manifest toujours vide
- **Avec ce plan** : les projets qui déclarent `_typeId` obtiennent l'optimisation bulk automatique
- **Aucun breaking change** : les projets sans `_typeId` fonctionnent normalement (IDs alphabétiques)
- **HMR** : manifest reconstruit à chaque `buildStart` (server restart inclus) — pas de stale state
