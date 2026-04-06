# Plan VITE-03 — Migrer les transforms regex vers l'AST OXC

## Objectif

Remplacer les `String.replace()` / `RegExp.exec()` utilisés dans les plugins Vite
par des walks `oxc-walker` + `MagicString`. Bénéfices :

1. **Correction** : les regex ratent les patterns multi-lignes et faux-positivent sur les chaînes
2. **Performance** : OXC parse 3× plus vite que Babel, et les fichiers sont déjà parsés dans le pipeline Vite
3. **Maintenabilité** : logique exprimée sur l'AST, pas sur du texte

**Prérequis :** VITE-01 (`oxc-walker` installé + `src/oxc/helpers.ts` + `src/oxc/parse.ts`).

**Types importants à connaître (de `@oxc-project/types` via `oxc-parser`) :**
- `StringLiteral` → `node.type === 'Literal'`, `node.value: string`
- `ObjectProperty` → `node.type === 'Property'`, `.key: PropertyKey`, `.value: Expression`
- `VariableDeclarator` → `.id: BindingPattern`, `.init: Expression | null`
- `BindingIdentifier` → `node.type === 'Identifier'`, `.name: string`

---

## Contexte : état actuel des regex

| Fichier | Fonction | Regex / Pattern actuel | Problème |
|---------|----------|------------------------|----------|
| `plugins/actor.ts` | `transformActorNames` | `const Foo = defineActor(` → inject comment | Faux positif si dans string |
| `plugins/layout.ts` | `transformLayoutNames` | `const Foo = defineLayout(...)` → `Object.assign(...)` | Regex multi-niveaux de parens — **casse si callback imbriqué** |
| `plugins/layout.ts` | `extractLayoutNames` | `const Foo = defineLayout(` → nom | Faux positif si dans string |
| `plugins/layout.ts` | `load()` | `require('node:fs')` dynamique | **Smell** : `require` en ESM Vite plugin |
| `plugins/tween.ts` | `extractUsedEasings` | `easing: 'name'` | Faux positif si `easing:` dans un commentaire |
| `index.ts` | `scanScenes` | 4+ regex sur le contenu des fichiers scènes | Fragile, ordre-dépendant |
| `index.ts` | `extractModuleNamesFromConfig` | `modules: [...]` regex multi-ligne | Ne parse pas les imports dynamiques |

---

## Étape 1 — Migrer `transformActorNames` (actor.ts)

**Fichier :** `packages/vite/src/plugins/actor.ts`

### Situation actuelle

```typescript
export function transformActorNames(code: string): string {
  if (!code.includes('defineActor') && !code.includes('definePrefab')) return code;
  return code
    .replace(/\bconst\s+(\w+)\s*=\s*defineActor\s*\(/g, ...)
    .replace(/\bconst\s+(\w+)\s*=\s*definePrefab\s*\(/g, ...);
}
```

**Problème :** regex match dans les strings et commentaires.

### Remplacement OXC

```typescript
import { walk } from 'oxc-walker';
import type { VariableDeclarator, CallExpression } from 'oxc-parser';
import { parseSource, isCallTo, getIdentifierName, getCallArgs } from '../oxc/index.js';
import MagicString from 'magic-string';

export function transformActorNames(code: string, filename = 'actor.ts'): string {
  if (!code.includes('defineActor') && !code.includes('definePrefab')) return code;

  const parsed = parseSource(filename, code);
  if (!parsed) return code;

  const s = new MagicString(code);
  let changed = false;

  walk(parsed.program, {
    enter(node) {
      if (node.type !== 'VariableDeclarator') return;
      // node is VariableDeclarator — id: BindingPattern, init: Expression | null
      const { id, init } = node as VariableDeclarator;
      if (id.type !== 'Identifier') return;       // BindingIdentifier has .name: string
      if (!init || !isCallTo(init, 'defineActor') && !isCallTo(init, 'definePrefab')) return;

      const varName = id.name;
      const callee = getIdentifierName((init as CallExpression).callee);
      const metaKey = callee === 'defineActor' ? '__actorName__' : '__prefabName__';

      // Insert comment before the first argument (all Node/Span have .start and .end)
      const args = getCallArgs(init as CallExpression);
      if (args.length > 0) {
        s.prependLeft(args[0].start, `/* ${metaKey}: "${varName}" */ `);
      } else {
        s.prependLeft(init.end - 1, `/* ${metaKey}: "${varName}" */ `);
      }
      changed = true;
    },
  });

  return changed ? s.toString() : code;
}
```

### Tests à mettre à jour

**Fichier :** `packages/vite/src/plugins/actor.test.ts`

```typescript
it('ne transforme pas defineActor dans une string', () => {
  const code = `const s = "const Foo = defineActor(bar)";`;
  expect(transformActorNames(code)).toBe(code);
});

it('transforme const Foo = defineActor sans args', () => {
  const code = `const Foo = defineActor();`;
  expect(transformActorNames(code)).toContain('__actorName__: "Foo"');
});
```

---

## Étape 2 — Migrer `extractLayoutNames` (layout.ts)

**Fichier :** `packages/vite/src/plugins/layout.ts`

### Situation actuelle

```typescript
export function extractLayoutNames(code: string): Set<string> {
  const names = new Set<string>();
  const pattern = /\b(?:export\s+)?const\s+(\w+)\s*=\s*defineLayout\s*\(/g;
  let match;
  while ((match = pattern.exec(code)) !== null) names.add(match[1]);
  return names;
}
```

### Remplacement OXC

```typescript
import { walk } from 'oxc-walker';
import type { VariableDeclarator } from 'oxc-parser';
import { parseSource, isCallTo } from '../oxc/index.js';

export function extractLayoutNames(code: string, filename = 'layout.ts'): Set<string> {
  const names = new Set<string>();
  if (!code.includes('defineLayout')) return names;

  const parsed = parseSource(filename, code);
  if (!parsed) return names;

  walk(parsed.program, {
    enter(node) {
      if (node.type !== 'VariableDeclarator') return;
      const { id, init } = node as VariableDeclarator;
      if (id.type !== 'Identifier') return;
      if (!init || !isCallTo(init, 'defineLayout')) return;
      names.add(id.name);
    },
  });

  return names;
}
```

### Fix : supprimer `require('node:fs')` dans `load()`

Ajouter `readFileSync` à l'import statique existant (ligne 1 du fichier) :

```typescript
// avant
import { readdirSync, statSync, existsSync } from 'node:fs';
// après
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
```

Dans `load()`, remplacer le bloc `try { const fs = require(...) ... }` par :

```typescript
try {
  const code = readFileSync(file, 'utf-8');
  const names = extractLayoutNames(code, file);
  for (const name of names) layoutMap.set(name, file);
} catch {
  // Silently skip files that can't be read
}
```

---

## Étape 3 — Migrer `transformLayoutNames` (layout.ts)

**Fichier :** `packages/vite/src/plugins/layout.ts`

### Problème regex actuel

```typescript
const pattern = /(\bconst\s+(\w+)\s*=\s*)defineLayout(\s*\((?:[^()]*|\([^()]*\))*?\))/g;
```

Ce pattern **casse** avec des callbacks imbriqués (ex : `defineLayout(() => { spawn(prefab(x)) })`).

### Remplacement OXC + MagicString

```typescript
import { walk } from 'oxc-walker';
import type { VariableDeclarator, CallExpression } from 'oxc-parser';
import { parseSource, isCallTo } from '../oxc/index.js';
import MagicString from 'magic-string';

export function transformLayoutNames(code: string, filename = 'layout.ts'): string {
  if (!code.includes('defineLayout')) return code;

  const parsed = parseSource(filename, code);
  if (!parsed) return code;

  const s = new MagicString(code);
  let changed = false;

  walk(parsed.program, {
    enter(node) {
      if (node.type !== 'VariableDeclarator') return;
      const { id, init } = node as VariableDeclarator;
      if (id.type !== 'Identifier') return;
      if (!init || !isCallTo(init, 'defineLayout')) return;

      const varName = id.name;
      // init is CallExpression — .start and .end are from Span (on every node)
      s.prependLeft(init.start, 'Object.assign(');
      s.appendRight(init.end, `, { __layoutName__: '${varName}' })`);
      changed = true;
    },
  });

  return changed ? s.toString() : code;
}
```

### Tests à mettre à jour

**Fichier :** `packages/vite/src/plugins/layout.test.ts`

```typescript
it('transforme defineLayout avec callback imbriqué (parens profondes)', () => {
  const code = `const Level1 = defineLayout(() => { if (f(x)) { spawn(p(opts)); } });`;
  const result = transformLayoutNames(code);
  expect(result).toContain('Object.assign(defineLayout(');
  expect(result).toContain("{ __layoutName__: 'Level1' })");
});

it('ne transforme pas defineLayout dans un commentaire', () => {
  const code = `// const Foo = defineLayout(() => {})`;
  expect(transformLayoutNames(code)).toBe(code);
});
```

---

## Étape 4 — Migrer `extractUsedEasings` (tween.ts)

**Fichier :** `packages/vite/src/plugins/tween.ts`

### Situation actuelle

```typescript
export function extractUsedEasings(code: string): Set<string> {
  const found = new Set<string>();
  const pattern = /easing\s*:\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = pattern.exec(code)) !== null) found.add(match[1]);
  return found;
}
```

### Remplacement OXC

```typescript
import { walk } from 'oxc-walker';
import type { ObjectExpression, ObjectProperty, StringLiteral } from 'oxc-parser';
import { parseSource, getPropertyKeyName, getObjectProperties } from '../oxc/index.js';

export function extractUsedEasings(code: string, filename = 'tween.ts'): Set<string> {
  const found = new Set<string>();
  if (!code.includes('easing')) return found;

  const parsed = parseSource(filename, code);
  if (!parsed) return found;

  walk(parsed.program, {
    enter(node) {
      if (node.type !== 'ObjectExpression') return;
      // getObjectProperties filters to ObjectProperty (type: 'Property')
      for (const prop of getObjectProperties(node as ObjectExpression)) {
        if (getPropertyKeyName(prop) !== 'easing') continue;
        // prop.value is Expression — check for StringLiteral (type: 'Literal', value: string)
        const { value } = prop as ObjectProperty;
        if (value.type === 'Literal' && typeof (value as StringLiteral).value === 'string') {
          found.add((value as StringLiteral).value);
        }
      }
    },
  });

  return found;
}
```

> **Note :** Le `(value as StringLiteral)` est nécessaire car `StringLiteral` et `NumericLiteral`
> ont tous les deux `type: 'Literal'` — TypeScript ne peut pas distinguer les deux via le seul
> discriminant `type`. Le `typeof value === 'string'` est le vrai guard runtime ;
> le cast est uniquement pour accéder au type du `.value`.

### Tests à mettre à jour

```typescript
it('n\'extrait pas easing: dans un commentaire', () => {
  expect([...extractUsedEasings(`// easing: 'easeInOut'`)]).toHaveLength(0);
});

it('n\'extrait pas easing dans une string', () => {
  expect([...extractUsedEasings(`const s = "easing: 'linear'";`)]).toHaveLength(0);
});

it('extrait easing: depuis un useTween() réel', () => {
  const code = `useTween({ duration: 1, easing: 'easeOutQuad' });`;
  expect([...extractUsedEasings(code)]).toEqual(['easeOutQuad']);
});
```

---

## Étape 5 — Migrer `scanScenes` (index.ts)

**Fichier :** `packages/vite/src/index.ts`

### Situation actuelle — 4 regex fragiles

```typescript
const defaultMatch = source.match(/export\s+default\s+class\s+(\w+)/);
const classMatch   = source.match(/export\s+class\s+(\w+)/);
// ...
```

### Remplacement OXC — fonction `scanSceneFile`

```typescript
import { walk } from 'oxc-walker';
import type {
  ExportDefaultDeclaration,
  ExportNamedDeclaration,
  ClassDeclaration,
  VariableDeclaration,
  VariableDeclarator,
  CallExpression,
  PropertyDefinition,
  StringLiteral,
} from 'oxc-parser';
import { parseSource, isCallTo, getCallArgs } from './oxc/index.js';

interface SceneFileInfo {
  className: string;
  sceneName: string;
  isDefault: boolean;
  isFactory: boolean;
  isConst: boolean;
}

function scanSceneFile(source: string, filename: string, fallbackName: string): SceneFileInfo {
  const parsed = parseSource(filename, source);
  if (!parsed) {
    return { className: fallbackName, sceneName: fallbackName.replace(/Scene$/, ''),
             isDefault: false, isConst: false, isFactory: false };
  }

  let className = fallbackName;
  let isDefault = false;
  let isConst = false;
  let isFactory = false;
  let sceneName: string | null = null;

  walk(parsed.program, {
    enter(node) {
      // Cas 1 : export default class Foo
      if (node.type === 'ExportDefaultDeclaration') {
        const { declaration } = node as ExportDefaultDeclaration;
        if (declaration.type === 'ClassDeclaration') {
          const cls = declaration as ClassDeclaration;
          if (cls.id?.type === 'Identifier') {
            className = cls.id.name;
            isDefault = true;
          }
        }
        return;
      }

      // Cas 2 : export class Foo / export const Foo = defineScene(...)
      if (node.type === 'ExportNamedDeclaration') {
        const { declaration } = node as ExportNamedDeclaration;
        if (!declaration) return;

        if (declaration.type === 'ClassDeclaration') {
          const cls = declaration as ClassDeclaration;
          if (cls.id?.type === 'Identifier') className = cls.id.name;
          return;
        }

        if (declaration.type === 'VariableDeclaration') {
          for (const declarator of (declaration as VariableDeclaration).declarations) {
            const { id, init } = declarator as VariableDeclarator;
            if (id.type !== 'Identifier') continue;
            if (!init || !isCallTo(init, 'defineScene')) continue;
            className = id.name;
            isConst = true;
            const args = getCallArgs(init as CallExpression);
            if (args.length >= 2 && args[0].type === 'Literal') {
              const val = (args[0] as StringLiteral).value;
              if (typeof val === 'string') { sceneName = val; isFactory = true; }
            }
          }
          return;
        }
      }

      // Cas 3 : defineScene('name', ...) hors export
      if (node.type === 'CallExpression' && isCallTo(node, 'defineScene')) {
        const args = getCallArgs(node as CallExpression);
        if (args.length >= 1 && args[0].type === 'Literal' && !sceneName) {
          const val = (args[0] as StringLiteral).value;
          if (typeof val === 'string') sceneName = val;
        }
        return;
      }

      // Cas 4 : readonly name = 'Foo' dans une classe
      if (node.type === 'PropertyDefinition') {
        const propDef = node as PropertyDefinition;
        if (propDef.key.type === 'Identifier' && propDef.key.name === 'name') {
          const val = propDef.value;
          if (val && val.type === 'Literal' && typeof (val as StringLiteral).value === 'string') {
            if (!sceneName) sceneName = (val as StringLiteral).value;
          }
        }
      }
    },
  });

  return {
    className,
    sceneName: sceneName ?? className.replace(/Scene$/, ''),
    isDefault,
    isConst,
    isFactory,
  };
}
```

### Remplacer dans `scanScenes`

```typescript
function scanScenes(projectRoot: string): SceneInfo[] {
  const scenesDir = path.join(projectRoot, 'src', 'scenes');
  if (!fs.existsSync(scenesDir)) return [];
  return fs
    .readdirSync(scenesDir)
    .filter((f) => f.endsWith('.ts') && !f.startsWith('_') && !f.startsWith('.'))
    .sort()
    .map((file) => {
      const base = file.replace(/\.ts$/, '');
      const fullPath = path.join(scenesDir, file);
      const source = fs.readFileSync(fullPath, 'utf-8');
      const info = scanSceneFile(source, fullPath, base);
      return { file, ...info, relPath: `/src/scenes/${base}.ts` };
    });
}
```

---

## Étape 6 — Migrer `extractModuleNamesFromConfig` (index.ts)

**Fichier :** `packages/vite/src/index.ts`

### Situation actuelle

```typescript
function extractModuleNamesFromConfig(configPath: string): string[] {
  const match = src.match(/modules\s*:\s*\[([^\]]*)\]/s);
  // ...
}
```

### Remplacement OXC

```typescript
import { walk } from 'oxc-walker';
import type { ObjectExpression, ObjectProperty, ArrayExpression, StringLiteral } from 'oxc-parser';
import { parseSource, getObjectProperties, getPropertyKeyName } from './oxc/index.js';

function extractModuleNamesFromConfig(configPath: string): string[] {
  if (!fs.existsSync(configPath)) return [];
  const src = fs.readFileSync(configPath, 'utf-8');

  const parsed = parseSource(configPath, src);
  if (!parsed) return [];

  const names: string[] = [];

  walk(parsed.program, {
    enter(node) {
      if (node.type !== 'ObjectExpression') return;

      for (const prop of getObjectProperties(node as ObjectExpression)) {
        if (getPropertyKeyName(prop) !== 'modules') continue;

        const { value } = prop as ObjectProperty;
        if (value.type !== 'ArrayExpression') continue;

        for (const el of (value as ArrayExpression).elements) {
          if (!el || el.type === 'SpreadElement') continue;

          // Forme 1 : '@scope/pkg' — StringLiteral directe
          if (el.type === 'Literal' && typeof (el as StringLiteral).value === 'string') {
            const s = (el as StringLiteral).value;
            if (s.includes('/') || s.startsWith('@')) names.push(s);
            continue;
          }
          // Forme 2 : ['@scope/pkg', opts] — tuple ArrayExpression
          if (el.type === 'ArrayExpression') {
            const first = (el as ArrayExpression).elements[0];
            if (first && first.type === 'Literal' &&
                typeof (first as StringLiteral).value === 'string') {
              const s = (first as StringLiteral).value;
              if (s.includes('/') || s.startsWith('@')) names.push(s);
            }
          }
        }
        // Found modules — stop descending
        this.skip();
      }
    },
  });

  return names;
}
```

---

## Checklist d'implémentation

- [ ] Étape 1 : Migrer `transformActorNames` (actor.ts)
- [ ] Étape 1b : Mettre à jour `actor.test.ts`
- [ ] Étape 2 : Migrer `extractLayoutNames` (layout.ts)
- [ ] Étape 2b : Fixer `require('node:fs')` → import statique dans `load()`
- [ ] Étape 3 : Migrer `transformLayoutNames` (layout.ts)
- [ ] Étape 3b : Mettre à jour `layout.test.ts`
- [ ] Étape 4 : Migrer `extractUsedEasings` (tween.ts)
- [ ] Étape 4b : Mettre à jour `tween.test.ts`
- [ ] Étape 5 : Créer `scanSceneFile` + refactorer `scanScenes` (index.ts)
- [ ] Étape 6 : Migrer `extractModuleNamesFromConfig` (index.ts)

## Impact

- **DX préservée** : comportement visible identique
- **Fix réel** : `transformLayoutNames` avec callbacks imbriqués ne cassera plus les builds
- **Fix réel** : `require('node:fs')` dans un ESM Vite plugin peut causer des erreurs en SSR
