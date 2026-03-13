# Physics2D Enhancement - API et DX design

## Statut implementation Sprint 1

Le contrat de base est maintenant materialise par:

- `Physics2DConfig.qualityPreset`, `eventMode` et `compat`,
- `extensions.physics.colliders[]` comme forme recommandee,
- un adaptateur TS pour les props legacy mono-collider,
- `getCollisionEventsBatch()` comme voie principale,
- un handshake TS/WASM versionne via `PHYSICS2D_BRIDGE_SCHEMA_VERSION` <-> `bridge_schema_version()`.

Le hot path events reste sans JSON et lit le canal binaire via vues typees (`DataView` / `ArrayBuffer`).

## Objectif DX

API cible:

- facile pour debuter (extension prefab declarative),
- puissante pour runtime dynamique (API imperative),
- standardisee pour patterns repetitifs (helpers),
- performante par defaut (pas de pieges hot path).

## 1) Voie extension prefab (defaut)

### Contrat propose (retro-compatible)

```ts
interface Physics2DPrefabExtension {
  bodyType?: 'dynamic' | 'kinematic' | 'fixed';
  material?: 'default' | 'ice' | 'rubber' | {
    friction?: number;
    restitution?: number;
    density?: number;
  };
  layer?: string;
  mask?: string[];
  colliders?: PhysicsColliderDef[];

  // legacy mono-collider support (deprecate later)
  hw?: number;
  hh?: number;
  radius?: number;
  isSensor?: boolean;
  friction?: number;
  restitution?: number;
}

interface PhysicsColliderDef {
  id?: string; // ex: 'head' | 'body' | 'foot'
  shape: 'box' | 'ball' | 'capsule';
  hw?: number;
  hh?: number;
  radius?: number;
  offsetX?: number;
  offsetY?: number;
  isSensor?: boolean;
  layer?: string;
  mask?: string[];
  material?: Physics2DPrefabExtension['material'];
  groundedRole?: 'none' | 'foot';
}
```

### Exemple player multi-colliders

```ts
extensions: {
  physics: {
    bodyType: 'dynamic',
    colliders: [
      { id: 'body', shape: 'box', hw: 10, hh: 14, layer: 'playerBody', mask: ['world', 'enemy'] },
      { id: 'head', shape: 'box', hw: 8, hh: 4, offsetY: -14, isSensor: true, layer: 'playerHead', mask: ['questionBlock'] },
      { id: 'foot', shape: 'box', hw: 7, hh: 3, offsetY: 15, isSensor: true, groundedRole: 'foot', layer: 'playerFoot', mask: ['ground', 'oneWay'] },
    ],
  },
}
```

## 2) Voie API imperative runtime

### Contrat propose

```ts
interface Physics2DAPI {
  addRigidBody(entity: number, def?: RigidBodyDef): number;
  addCollider(entity: number, def: PhysicsColliderDef): number;
  removeCollider(colliderHandle: number): void;

  getCollisionEventsBatch(opts?: { max?: number; coalesced?: boolean }): CollisionBatch;
  getGroundState(entity: number): GroundState;
  getStats(): PhysicsStats;

  setQualityPreset(preset: 'low' | 'medium' | 'high' | 'esport'): void;
}
```

### Quand utiliser

- spawn dynamique (projectiles, objets temporaires),
- modifications runtime (changer mask/layer/material),
- debug/perf instrumentation.

## 3) Voie helpers officiels

### Helpers proposes

- `createPhysicsKinematicSyncSystem()` (existant, a garder).
- `createPhysicsGroundedSystem()` (state derive standardise).
- `createPhysicsCollisionBatchSystem()` (consommation events centralisee).
- `buildTilemapPhysicsChunks()` (precompute colliders).

### Regle DX

Les helpers n encapsulent pas la simulation, ils encapsulent le glue code.

## Hooks vs Pull API

## Position recommandee

- Hooks pour lifecycle et integration (`prefab:instantiate`, `entity:destroy`).
- Pull API pour contacts haute frequence (`getCollisionEventsBatch`).
- Hook batch optionnel pour convenience (`physics:collision:batch`).
- En implementation Sprint 1, le hook enrichi `physics:collision` n est declenche automatiquement qu en mode `hybrid` ou quand une extension `onCollision` est enregistree.

## Pourquoi

- Pull controle le timing de lecture et limite la pression GC.
- Hook batch garde une excellente DX pour cas simples.
- Eviter les hooks unitaires par contact pour ne pas saturer TS.

## Event contract propose

```ts
interface CollisionEvent {
  aEntity: number;
  bEntity: number;
  aColliderId?: string;
  bColliderId?: string;
  kind: 'collision-start' | 'collision-stay' | 'collision-end' | 'trigger-start' | 'trigger-end';
  normalX?: number;
  normalY?: number;
  impulse?: number;
}

interface CollisionBatch {
  frame: number;
  count: number;
  droppedSinceLastRead: number;
  events: CollisionEvent[]; // pooled/reused
}
```

## Performance guardrails DX

- event arrays pooled (no new array each frame in hot path).
- scalar-friendly access patterns pour minimiser deopt.
- default sensible (preset `medium`, event coalesced=true).
- warnings dev mode quand usage anti-perf detecte.

## Compat et deprecations

- si `hw/hh` top-level present -> auto adapt vers `colliders[0]` cote TS.
- warning deprecation non bloquant.
- suppression legacy apres cycle mineur defini.
- ne pas reintroduire de logique legacy cote Rust: l adaptation reste dans la glue TS.

## Politique obligatoire de tagging deprecations (Rust + TS)

Tout element deprecie doit etre tagge dans le code, pas seulement dans la doc.

### TypeScript/JSDoc

- Tag obligatoire `@deprecated` sur API, type, methode et propriete depreciee.
- Le message doit contenir:
  - la version cible (`since` dans le texte),
  - l alternative recommandee,
  - la date/version de suppression cible.

Exemple TS:

```ts
interface Physics2DPrefabExtension {
  /**
   * @deprecated Since 0.9.0. Use `colliders[0].hw` instead. Removal planned in 1.1.0.
   */
  hw?: number;
}

/**
 * @deprecated Since 0.9.0. Use `getCollisionEventsBatch()` instead. Removal planned in 1.1.0.
 */
function onCollisionLegacy() {
  // Keep compatibility path until removal window.
}
```

### Rust

- Tag obligatoire `#[deprecated(...)]` sur fonction/type/champ legacy expose.
- Toujours preciser `since` et `note`.
- Les wrappers legacy doivent deleguer vers le nouveau chemin (pas de duplication de logique hot path).

Exemple Rust:

```rust
#[deprecated(since = "0.9.0", note = "Use add_collider_v2 with colliders[] schema")]
pub fn add_collider_legacy(/* ... */) {
    add_collider_v2(/* ... */)
}
```

### Code associe aux deprecations

- Le code legacy reste teste tant qu il est supporte.
- Le code legacy est isole pour faciliter la suppression (module/fonction dediee).
- Chaque deprecation doit avoir:
  - test de compat positif,
  - test du nouveau chemin,
  - item de suppression dans la roadmap.

## Definition of Done API/DX

- [ ] chaque API publique a jsdoc complet.
- [ ] exemples docs pour les 3 voies d usage.
- [ ] player multi-collider documente.
- [ ] comportement hooks/pull clairement specifie.
- [ ] mode legacy valide par tests.
- [ ] toute API/propriete/type legacy est taggee `@deprecated` (TS/JSDoc).
- [ ] toute API legacy cote Rust est taggee `#[deprecated(since = "...", note = "...")]`.
- [ ] le code associe aux deprecations est couvert par tests de compat.
