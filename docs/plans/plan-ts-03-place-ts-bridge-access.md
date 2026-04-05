# Plan TS-03 — Corriger l'accès `(engine as any)._bridge` dans `core/scene/place.ts`

## Objectif
`packages/core/src/scene/place.ts` accède au bridge WASM via `(engine as any)._bridge` à trois endroits (lignes ~63, ~172, ~221). C'est une encapsulation cassée : le champ `_bridge` est privé/interne mais utilisé depuis l'extérieur de l'engine via un cast `any`.

La correction consiste à exposer un accesseur officiel sur `GwenEngine` qui retourne les méthodes de transform dont `place.ts` a besoin, **sans** exposer tout le bridge.

## Analyse du problème
`place.ts` utilise ces 3 méthodes du bridge :
1. `bridge.add_entity_transform(idx, x, y, rotation, sx, sy)` — dans `applyTransform`
2. `bridge.set_entity_parent(idx, parentIdx, false)` — dans `applyTransform`
3. `bridge?.set_entity_local_position?.(idx, x, y)` — dans les `moveTo` handlers

Ces méthodes WASM existent sur le bridge mais pas sur l'API publique de `GwenEngine`. Le plan est d'ajouter une interface interne `PlacementBridge` et un getter `engine._getPlacementBridge()` marqué `@internal`.

## Impact sur les autres packages
- **Aucun.** Ce changement est entièrement dans `@gwenjs/core`.
- Les packages qui utilisent `place.ts` (`placeActor`, `placeGroup`, `placePrefab`) ne changent pas leur API publique.

---

## Étape 1 — Définir l'interface `PlacementBridge`

**Fichier :** `packages/core/src/scene/place.ts`

Ajouter en haut du fichier, après les imports :

```typescript
/**
 * Minimal bridge interface for entity placement and transform operations.
 * Exposed by GwenEngine._getPlacementBridge() for use by placement composables.
 * @internal
 */
export interface PlacementBridge {
  /** Set the initial 2D transform for a newly created entity. */
  add_entity_transform?(
    entityIndex: number,
    x: number,
    y: number,
    rotation: number,
    scaleX: number,
    scaleY: number,
  ): void;
  /** Attach a child entity to a parent in the transform hierarchy. */
  set_entity_parent?(
    childIndex: number,
    parentIndex: number,
    keepWorldTransform: boolean,
  ): void;
  /** Update the local position of an existing entity. */
  set_entity_local_position?(entityIndex: number, x: number, y: number): void;
}
```

---

## Étape 2 — Ajouter `_getPlacementBridge()` sur `GwenEngine`

**Fichier :** `packages/core/src/engine/gwen-engine.ts`

Localiser la classe `GwenEngine`. Ajouter une méthode `@internal` qui retourne le bridge via `PlacementBridge` :

```typescript
import type { PlacementBridge } from '../scene/place.js';

// Dans la classe GwenEngine :

/**
 * Returns the WASM bridge narrowed to the placement methods needed by place.ts.
 * @internal Not part of the public API. Used exclusively by placeActor / placeGroup / placePrefab.
 */
_getPlacementBridge(): PlacementBridge {
  // this._bridge is the WasmBridge instance — cast to the narrow interface
  return this._bridge as unknown as PlacementBridge;
}
```

> Note : si `_bridge` est déjà typé fortement, utiliser `this._bridge as PlacementBridge` directement.

---

## Étape 3 — Mettre à jour `applyTransform` dans `place.ts`

**Avant :**
```typescript
function applyTransform(
  bridge: any,
  entityId: bigint,
  options: PlaceOptions<any>,
): void {
  if (!bridge?.add_entity_transform) return;
  // ...
  bridge.add_entity_transform(idx, x, y, rotation, sx, sy);
  if (options.parent) {
    bridge.set_entity_parent(idx, parentIdx, false);
  }
}
```

**Après :**
```typescript
function applyTransform(
  bridge: PlacementBridge,
  entityId: bigint,
  options: PlaceOptions<unknown>,
): void {
  if (!bridge.add_entity_transform) return;
  const [x = 0, y = 0] = options.at ?? [0, 0];
  const rotation = options.rotation ?? 0;
  const [sx, sy] = Array.isArray(options.scale)
    ? (options.scale as [number, number])
    : [options.scale ?? 1, options.scale ?? 1];
  const idx = Number(entityId) & 0xffffffff;
  bridge.add_entity_transform(idx, x, y, rotation, sx, sy);
  if (options.parent) {
    const parentIdx = Number(options.parent.entityId) & 0xffffffff;
    bridge.set_entity_parent?.(idx, parentIdx, false);
  }
}
```

---

## Étape 4 — Mettre à jour `placeGroup`

**Avant :**
```typescript
const bridge = (engine as any)._bridge;
const entityId = engine.createEntity();
applyTransform(bridge, entityId as unknown as bigint, options);
// ...
moveTo(pos) {
  const [x = 0, y = 0] = pos;
  bridge?.set_entity_local_position?.(Number(entityId) & 0xffffffff, x, y);
},
```

**Après :**
```typescript
const bridge = engine._getPlacementBridge();
const entityId = engine.createEntity();
applyTransform(bridge, entityId as unknown as bigint, options);
// ...
moveTo(pos) {
  const [x = 0, y = 0] = pos;
  bridge.set_entity_local_position?.(Number(entityId) & 0xffffffff, x, y);
},
```

---

## Étape 5 — Mettre à jour `placeActor`

**Avant :**
```typescript
export function placeActor<Props, API>(
  actorDef: any,
  options: PlaceOptions<Props> = {},
): PlaceHandle<API> {
  // ...
  const bridge = (useEngine() as any)._bridge;
  applyTransform(bridge, entityId, options);
```

**Après :**
```typescript
export function placeActor<Props, API>(
  actorDef: ActorDefinition<Props, API>,  // type précis si disponible, sinon garder any temporairement
  options: PlaceOptions<Props> = {},
): PlaceHandle<API> {
  // ...
  const bridge = useEngine()._getPlacementBridge();
  applyTransform(bridge, entityId, options);
```

---

## Étape 6 — Mettre à jour `placePrefab`

**Avant :**
```typescript
const bridge = (engine as any)._bridge;
const id = engine.createEntity();
// ...
applyTransform(bridge, entityId, options);
```

**Après :**
```typescript
const bridge = engine._getPlacementBridge();
const id = engine.createEntity();
// ...
applyTransform(bridge, entityId, options);
```

---

## Étape 7 — Supprimer les commentaires `eslint-disable` devenus inutiles

Dans `place.ts`, supprimer toutes les lignes :
```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
```
qui protégeaient les casts `any` remplacés.

---

## Étape 8 — Vérification

```bash
cd packages/core

# TypeScript compile sans erreur
npx tsc --noEmit

# Grep pour confirmer qu'aucun (engine as any) ne reste dans place.ts
grep "as any" src/scene/place.ts
# Attendu : 0 résultats (ou seulement pour actorDef si non typé)

# Tests passent
npx vitest run
```

---

## Résumé des fichiers modifiés
| Fichier | Modification |
|---------|-------------|
| `packages/core/src/scene/place.ts` | Ajout `PlacementBridge`, suppression 4 `(engine as any)._bridge` |
| `packages/core/src/engine/gwen-engine.ts` | Ajout méthode `_getPlacementBridge(): PlacementBridge` |
| Packages externes | **Aucun changement** |
