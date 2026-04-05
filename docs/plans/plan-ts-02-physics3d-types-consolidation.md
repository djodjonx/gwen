# Plan TS-02 — Consolider `types.ts` → `types/*.ts` dans `@gwenjs/physics3d`

## Objectif
Le package `@gwenjs/physics3d` a deux systèmes de types coexistants :
- `src/types.ts` — 1303 LOC, source historique contenant TOUS les types
- `src/types/*.ts` — système modulaire récent (`config.ts`, `bodies.ts`, `colliders.ts`, `bulk.ts`, `events.ts`, `api.ts`)
- `src/types/index.ts` — barrel qui re-exporte les fichiers `types/*.ts`

**But :** faire de `src/types.ts` un simple re-export de `src/types/index.ts`, en déplaçant les types encore manquants dans les bons fichiers `types/*.ts`. Aucun type ne doit disparaître.

## Contrainte
Certains types dans `types.ts` sont peut-être déjà présents dans `types/*.ts` (doublons) et certains sont peut-être encore absents. Il faut d'abord faire l'inventaire.

## Impact sur les autres packages
- **Aucun changement public.** Le barrel `src/index.ts` du package continuera à tout exporter.
- Les imports internes `from '../types'` dans le package resteront valides car `types.ts` restera (comme barrel).
- Les imports `from '../types/api'` etc. resteront valides tels quels.

---

## Étape 1 — Inventaire comparatif

```bash
# Lister tous les exports de types.ts
grep "^export" packages/physics3d/src/types.ts

# Lister tous les exports de types/*.ts (via index)
grep "^export" packages/physics3d/src/types/index.ts
# Puis pour chaque fichier types/*.ts
grep "^export" packages/physics3d/src/types/*.ts
```

Créer mentalement deux listes :
- **Liste A** : exports dans `types.ts`
- **Liste B** : exports dans `types/index.ts` (cumul de tous les `types/*.ts`)

**Différence A − B** = types encore seulement dans `types.ts`, à migrer vers le bon fichier `types/*.ts`.

---

## Étape 2 — Migrer les types manquants

Pour chaque type dans **A − B**, déterminer le bon fichier cible :

| Type | Fichier cible |
|------|--------------|
| `Physics3DVec3`, `Physics3DQuat` | `types/config.ts` — sont probablement déjà dans `types.ts` mais à vérifier s'ils existent dans `types/config.ts` |
| `Physics3DQualityPreset`, `QUALITY_PRESETS`, `Physics3DConfig`, `ResolvedPhysics3DConfig` | `types/config.ts` |
| `Physics3DEntityId`, `Physics3DBodyKind`, `Physics3DBodyOptions`, `Physics3DBodyHandle`, `Physics3DBodyState`, `Physics3DBodySnapshot` | `types/bodies.ts` |
| `Physics3DColliderShape`, `Physics3DMaterialPreset`, `Physics3DMaterialValues`, `PHYSICS3D_MATERIAL_PRESETS`, `Physics3DColliderOptions` | `types/colliders.ts` |
| `BulkStaticBoxesOptions`, `BulkStaticBoxesResult` | `types/bulk.ts` |
| `Physics3DSensorState`, events types | `types/events.ts` |
| `Physics3DAPI`, `Physics3DPrefabExtension` | `types/api.ts` |

**Règle :** si le type existe déjà dans `types/*.ts` avec le même nom et même définition → ne pas dupliquer.
Si il n'existe pas → le couper de `types.ts` et le coller dans le bon fichier `types/*.ts`.

---

## Étape 3 — Transformer `types.ts` en barrel

Une fois tous les types migrés, **remplacer le contenu de `src/types.ts`** par :

```typescript
/**
 * @file @gwenjs/physics3d — Public type definitions.
 *
 * This file is a compatibility re-export barrel.
 * All type declarations live in the `types/` subdirectory.
 * Import directly from `types/` submodules for better tree-shaking:
 *   import type { Physics3DAPI } from './types/api'
 *
 * @deprecated Direct imports from `./types/*` are preferred.
 */
export * from './types/index';
```

---

## Étape 4 — Vérifier que les imports internes fonctionnent

```bash
# Tous les fichiers qui importent depuis '../types' (ou './types')
grep -r "from.*['\"]\.\.\/types['\"]" packages/physics3d/src/
grep -r "from.*['\"]\.\/types['\"]" packages/physics3d/src/
```

Ces imports continueront de fonctionner car `types.ts` re-exporte tout.

---

## Étape 5 — S'assurer que `types/index.ts` exporte tout ce que `types.ts` exportait

Après la migration, vérifier que l'union `types/index.ts` (tous les `*.ts` du dossier) couvre bien tous les exports de l'ancienne `types.ts` :

```bash
# Comparer les deux listes d'exports
diff <(grep "^export" packages/physics3d/src/types.ts | sort) \
     <(grep -r "^export" packages/physics3d/src/types/*.ts | sed 's/.*://' | sort)
```

Résultat attendu : aucune différence (ou uniquement des différences liées au format).

---

## Étape 6 — Vérification

```bash
cd packages/physics3d

# TypeScript compile
npx tsc --noEmit

# Tests passent
npx vitest run

# Vérifier que types.ts ne contient plus que le barrel
wc -l src/types.ts
# Attendu : ~12 lignes (commentaire + exports)
```

---

## Résumé des fichiers modifiés
| Fichier | Modification |
|---------|-------------|
| `packages/physics3d/src/types.ts` | Transformé en barrel re-export |
| `packages/physics3d/src/types/config.ts` | Ajout des types manquants depuis `types.ts` |
| `packages/physics3d/src/types/bodies.ts` | Idem |
| `packages/physics3d/src/types/colliders.ts` | Idem |
| `packages/physics3d/src/types/bulk.ts` | Idem |
| `packages/physics3d/src/types/events.ts` | Idem |
| `packages/physics3d/src/types/api.ts` | Idem |
| Packages externes | **Aucun changement** |
