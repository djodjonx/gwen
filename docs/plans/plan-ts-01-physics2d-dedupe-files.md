# Plan TS-01 — Éliminer les fichiers dupliqués dans `@gwenjs/physics2d`

## Objectif
Supprimer les vrais doublons de code entre la racine de `src/` et le dossier `src/plugin/`. Deux fichiers sont identiques byte-pour-byte :
- `src/ring-buffer.ts` ≡ `src/plugin/ring-buffer.ts`
- `src/shape-component.ts` ≡ `src/plugin/shape-component.ts`

La racine est la source canonique (importée directement dans les tests et composables). Les versions dans `plugin/` doivent devenir de simples re-exports.

## Impact sur les autres packages
- **Aucun.** Ces fichiers ne sont pas exportés dans `index.ts` public du package.
- Les imports internes au package seront inchangés après la correction.

---

## Étape 1 — Vérifier qui importe quoi

Avant de modifier, confirmer les imports existants :

```bash
# Qui importe depuis plugin/ring-buffer ?
grep -r "plugin/ring-buffer" packages/physics2d/src/
# Qui importe depuis plugin/shape-component ?
grep -r "plugin/shape-component" packages/physics2d/src/
# Qui importe depuis la racine ring-buffer ?
grep -r "from.*ring-buffer" packages/physics2d/src/
# Qui importe depuis la racine shape-component ?
grep -r "from.*shape-component" packages/physics2d/src/
```

Noter les résultats — ils déterminent quel fichier est "source" et lequel devient re-export.

---

## Étape 2 — Décider la source canonique

**Règle :** le fichier importé par les tests et les composables publics est la source.
Basé sur l'audit :
- `src/ring-buffer.ts` — importé dans `src/systems.ts` et les tests → **source**
- `src/plugin/ring-buffer.ts` — importé dans `src/plugin/index.ts` → **devient re-export**
- `src/shape-component.ts` — importé dans les composables → **source**
- `src/plugin/shape-component.ts` — importé dans `src/plugin/index.ts` → **devient re-export**

---

## Étape 3 — Remplacer `src/plugin/ring-buffer.ts`

**Remplacer le contenu intégral** de `packages/physics2d/src/plugin/ring-buffer.ts` par :

```typescript
/**
 * @file Re-export from the canonical ring-buffer implementation.
 * The source of truth lives at `../ring-buffer`.
 */
export { ContactRingBuffer, CONTACT_EVENT_BYTES, RING_CAPACITY } from '../ring-buffer';
```

---

## Étape 4 — Remplacer `src/plugin/shape-component.ts`

**Remplacer le contenu intégral** de `packages/physics2d/src/plugin/shape-component.ts` par :

```typescript
/**
 * @file Re-export from the canonical shape-component definition.
 * The source of truth lives at `../shape-component`.
 */
export { ShapeComponent, type ShapeData } from '../shape-component';
```

---

## Étape 5 — Vérification

```bash
cd packages/physics2d

# TypeScript doit compiler sans erreur
npx tsc --noEmit

# Les tests doivent passer
npx vitest run

# Confirmer que les deux fichiers plugin/* ne contiennent plus de code dupliqué
wc -l src/plugin/ring-buffer.ts src/plugin/shape-component.ts
# Attendu : ~4 lignes chacun (commentaire + export)
```

---

## Résumé des fichiers modifiés
| Fichier | Modification |
|---------|-------------|
| `packages/physics2d/src/plugin/ring-buffer.ts` | Remplacé par re-export |
| `packages/physics2d/src/plugin/shape-component.ts` | Remplacé par re-export |
| Tous les autres fichiers | **Aucun changement** |
