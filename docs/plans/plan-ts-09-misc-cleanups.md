# Plan TS-09 — Nettoyages divers (sévérité faible / organisation)

## Objectif
Regrouper les petits nettoyages qui ne méritent pas un plan individuel : incohérences de nommage, fichiers de tests dupliqués, dossier bench, TODO/FIXME.

## Impact sur les autres packages
Aucun pour tous ces items sauf mention contraire.

---

## Item 1 — Fusionner `core/bench/` et `core/benches/`

**Problème :** `packages/core/` contient deux dossiers : `bench/` et `benches/`. L'un est probablement hérité.

**Action :**

```bash
# 1. Lister le contenu des deux dossiers
ls packages/core/bench/
ls packages/core/benches/

# 2. Si les deux contiennent des fichiers différents, déplacer tous les fichiers de bench/ vers benches/
# (ou l'inverse — choisir le nom qui correspond à la convention du projet)

# 3. Mettre à jour vitest.config.ts si le pattern de bench y est référencé
grep -r "bench" packages/core/vitest.config.ts
grep -r "benches\|bench" packages/core/package.json

# 4. Supprimer le dossier vide
rmdir packages/core/bench/  # ou benches/ selon le choix
```

**Vérification :**
```bash
ls packages/core/benches/
# Tous les benchmarks dans un seul dossier
```

---

## Item 2 — Dédupliquer les fichiers de test input

**Problème :** `packages/input/src/__tests__/InputMapper.test.ts` et `packages/input/src/__tests__/input-mapper.test.ts` existent tous les deux.

**Action :**

```bash
# 1. Vérifier le contenu de chacun
wc -l packages/input/src/__tests__/InputMapper.test.ts packages/input/src/__tests__/input-mapper.test.ts
diff packages/input/src/__tests__/InputMapper.test.ts packages/input/src/__tests__/input-mapper.test.ts
```

- **Si identiques** : supprimer `InputMapper.test.ts` (gardez la version kebab-case `input-mapper.test.ts`, cohérent avec les conventions du repo).
- **Si différents** : fusionner les deux `describe` blocs dans `input-mapper.test.ts` et supprimer `InputMapper.test.ts`.

**Vérification :**
```bash
npx vitest run packages/input
# Tous les tests passent avec un seul fichier
```

---

## Item 3 — Résoudre les 4 TODO/FIXME

**Localisation :**
```bash
grep -rn "TODO\|FIXME\|HACK" packages/ --include="*.ts" | grep -v node_modules | grep -v ".d.ts"
```

**Actions par occurrence :**

### `packages/physics2d/src/composables/use-dynamic-body.ts`
```bash
grep -n "TODO\|FIXME" packages/physics2d/src/composables/use-dynamic-body.ts
```
Lire le contexte (2 lignes avant/après). Si le TODO porte sur un cas edge connu, soit l'implémenter, soit ajouter un commentaire `// Known limitation: <description>` avec un lien vers un issue GitHub.

### `packages/physics2d/src/types/bodies.ts`
Même traitement.

### `packages/cli/src/commands/scaffold/plugin.ts`
```bash
grep -n "FIXME" packages/cli/src/commands/scaffold/plugin.ts
```
Si le FIXME concerne du code de génération de template incomplet, implémenter ou documenter l'état attendu.

### `packages/cli/src/commands/scaffold/module.ts`
Même traitement.

**Règle générale :** si un TODO/FIXME ne peut pas être résolu maintenant, le convertir en commentaire `// Known limitation: <raison>` pour signaler que c'est intentionnel.

---

## Item 4 — Typer `actorDef: any` dans `place.ts`

**Note :** après l'application du Plan TS-03, `(engine as any)._bridge` est corrigé. Mais `actorDef: any` dans `placeActor` reste.

**Fichier :** `packages/core/src/scene/place.ts`

Chercher le type `ActorDefinition` dans le codebase :
```bash
grep -r "ActorDefinition" packages/core/src/ | head -10
```

Si `ActorDefinition<Props, API>` est exporté quelque part dans `@gwenjs/core`, remplacer :
```typescript
// Avant
export function placeActor<Props, API>(
  actorDef: any,
  options: PlaceOptions<Props> = {},
)

// Après
export function placeActor<Props, API>(
  actorDef: ActorDefinition<Props, API>,
  options: PlaceOptions<Props> = {},
)
```

Si `ActorDefinition` n'est pas exporté ou est difficile à importer sans cycle, utiliser un type structurel minimal :

```typescript
interface ActorLike<Props, API> {
  _plugin: {
    spawn(props?: Props): unknown;
    despawn(entityId: bigint): void;
  };
  _instances?: Map<bigint, { api: API }>;
}

export function placeActor<Props, API>(
  actorDef: ActorLike<Props, API>,
  options: PlaceOptions<Props> = {},
)
```

---

## Item 5 — Supprimer les commentaires `eslint-disable` orphelins dans `place.ts`

Après les corrections du Plan TS-03, certains commentaires `eslint-disable-next-line @typescript-eslint/no-explicit-any` ne protègent plus rien. Les supprimer :

```bash
grep -n "eslint-disable" packages/core/src/scene/place.ts
# Supprimer manuellement les lignes qui ne sont plus nécessaires
```

---

## Vérification globale

```bash
# Aucun TODO/FIXME restant
grep -rn "TODO\|FIXME" packages/ --include="*.ts" | grep -v node_modules

# Aucun bench/ dossier dupliqué
ls packages/core/bench/ 2>/dev/null || echo "OK — bench/ removed"

# Tests input passent avec 1 seul fichier InputMapper
cd packages/input && npx vitest run
```

---

## Résumé
| Item | Fichiers modifiés |
|------|------------------|
| Fusion bench/benches | `packages/core/bench/` ou `benches/` |
| Dédup test input | `packages/input/src/__tests__/InputMapper.test.ts` supprimé |
| TODO/FIXME × 4 | `physics2d/composables/use-dynamic-body.ts`, `physics2d/types/bodies.ts`, `cli/scaffold/plugin.ts`, `cli/scaffold/module.ts` |
| Typer `actorDef: any` | `packages/core/src/scene/place.ts` |
| Supprimer eslint-disable orphelins | `packages/core/src/scene/place.ts` |
