# Plan VITE-06 — Vite 8 + Rolldown : async `buildStart` + Full Bundle Mode

## Objectif

Vite 8 utilise Rolldown comme bundler unifié dev/prod. Deux impacts sur le code existant :

1. **`buildStart` est awaité au démarrage du dev server** — un scan synchrone (`readFileSync` en boucle)
   retarde l'accès au browser. Le `ComponentScanner` introduit par VITE-04 doit devenir async.

2. **Full Bundle Mode (expérimental)** — en dev, Rolldown bundle les modules comme en prod.
   Les hooks `transform` s'exécutent une fois sur le bundle entier, pas à la demande par fichier.
   Aucune modification requise, mais la documentation interne doit en tenir compte.

**Prérequis :** VITE-04 implémenté (`ComponentScanner` + câblage dans `optimizer.ts`).

---

## Contexte : pourquoi `buildStart` bloque

```
dev server start
  └── await configResolved()
  └── await buildStart()   ← bloquant jusqu'à résolution
  └── serveur prêt → browser peut charger
```

Avec `readFileSync` sur 50+ fichiers TypeScript, le blocage est mesurable (50–200 ms sur un
projet moyen). Vite 8 le documente explicitement : _"buildStart should not run long and extensive
operations"_.

---

## Étape 1 — Rendre `ComponentScanner.scanFiles` async

**Fichier :** `packages/vite/src/optimizer/component-scanner.ts`

### Avant

```typescript
scanFiles(files: string[]): void {
  for (const file of files) {
    try {
      const code = readFileSync(file, 'utf-8');
      this.scanSource(code, file);
    } catch {
      // skip
    }
  }
  this._assignFallbackIds();
}
```

### Après

```typescript
import { readFile } from 'node:fs/promises';

/**
 * Scan an array of absolute file paths and register all found `defineComponent` calls.
 * Reads files concurrently (Promise.allSettled) to avoid blocking the event loop.
 * After scanning, assigns fallback numeric IDs to components without `_typeId`.
 */
async scanFiles(files: string[]): Promise<void> {
  await Promise.allSettled(
    files.map(async (file) => {
      const code = await readFile(file, 'utf-8');
      this.scanSource(code, file);
    }),
  );
  this._assignFallbackIds();
}
```

> **Pourquoi `Promise.allSettled` et non `Promise.all` ?**
> `allSettled` ignore les fichiers illisibles (permissions, suppression en cours) sans rejeter
> l'ensemble — comportement identique au `try/catch` synchrone d'origine.

> **Concurrence :** `scanSource` est synchrone et non-partageable par état mutable entre appels
> concurrents — chaque appel écrit dans `this.manifest` via `register()`. Si `ComponentManifest`
> est thread-safe (Map JS), `Promise.allSettled` est safe car Node.js est single-threaded.

---

## Étape 2 — Mettre à jour `optimizer.ts`

**Fichier :** `packages/vite/src/plugins/optimizer.ts`

`buildStart` doit déjà être `async` pour awaiter les hooks existants. Ajouter le `await` :

```typescript
async buildStart() {
  manifest.clear();
  const compDir = `${_root}/${options.componentsDir ?? 'src'}`;
  const files = findComponentFiles(compDir);
  const scanner = new ComponentScanner(manifest);
  await scanner.scanFiles(files);   // ← await ajouté

  if (debug) {
    console.log(`[gwen:optimizer] ${manifest.size} component(s) registered`);
    for (const entry of manifest.entries()) {
      console.log(`  ${entry.name}: typeId=${entry.typeId}, stride=${entry.f32Stride}`);
    }
  }
},
```

---

## Étape 3 — Mettre à jour les tests

**Fichier :** `packages/vite/src/optimizer/component-scanner.test.ts`

`scanFiles` devient async — tous les appels `scanner.scanFiles([])` dans les tests doivent être
awaités. Les tests `scanSource` seuls sont inchangés.

### Avant (pattern dans les tests existants)

```typescript
scanner.scanSource(`...`, 'file.ts');
scanner.scanFiles([]);  // trigger _assignFallbackIds
```

### Après

```typescript
scanner.scanSource(`...`, 'file.ts');
await scanner.scanFiles([]);  // trigger _assignFallbackIds
```

Tous les `it(...)` concernés deviennent `it('...', async () => { ... })`.

---

## Étape 4 — Note sur le Full Bundle Mode

Aucune modification de code requise. Documenter dans `internals-docs/vite-compile-time-optimization.md` :

### Section à ajouter : "Vite 8 + Rolldown : Full Bundle Mode"

```markdown
## Vite 8 + Rolldown

### Full Bundle Mode (expérimental)

En mode dev standard, Vite sert les modules à la demande via ESM natif — le hook `transform`
est appelé à chaque requête browser. Avec le **Full Bundle Mode** de Rolldown (opt-in en Vite 8),
le dev server bundle les modules comme en production : `transform` s'exécute une fois sur le
bundle entier, exactement comme `vite build`.

Impact pour les plugins gwen :
- Les optimisations bulk (VITE-02) sont actives **en dev** avec Full Bundle Mode.
- Le `ComponentScanner` (VITE-04) ne voit aucune différence — `buildStart` fire dans les
  deux modes.
- Les temps de démarrage sont améliorés (3× selon VoidZero) mais `buildStart` reste bloquant.

### Raw AST Transfer (futur)

Vite 8 annonce un futur mécanisme de **Raw AST transfer** : les plugins JS pourront recevoir
l'AST Rust (OXC/Rolldown) directement, sans resérialiser en JSON. Conséquence :
`parseSource()` dans `src/oxc/parse.ts` deviendrait superflu — l'AST arriverait nativement.

Cette évolution est suivie dans le roadmap Rolldown. Lorsqu'elle sera disponible,
`src/oxc/parse.ts` pourra être retiré et les helpers adaptés pour consommer l'AST Vite
directement.
```

---

## Checklist d'implémentation

- [ ] Étape 1 : `ComponentScanner.scanFiles` → `async`, `readFile` (fs/promises), `Promise.allSettled`
- [ ] Étape 2 : `optimizer.ts` `buildStart` → `await scanner.scanFiles(files)`
- [ ] Étape 3 : Tests `component-scanner.test.ts` → `async it`, `await scanner.scanFiles([])`
- [ ] Étape 4 : Section "Vite 8 + Rolldown" dans `internals-docs/vite-compile-time-optimization.md`

## Impact

- **Breaking change :** non — signature publique identique du point de vue d'`optimizer.ts`
- **Perf dev startup :** lecture concurrente des fichiers, plus de blocage du event loop
- **Tests :** changement minimal (ajout `async`/`await`), logique inchangée
- **VITE-04 :** évolution non-breaking, peut être appliquée immédiatement après VITE-04
