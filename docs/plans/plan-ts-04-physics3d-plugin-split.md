# Plan TS-04 — Fragmenter `physics3d/plugin/index.ts` (1709 LOC)

## Objectif
`packages/physics3d/src/plugin/index.ts` fait 1709 LOC avec 35 `!` non-null assertions, 6 `as unknown as`, et gère simultanément : l'état global du plugin, les helpers de conversion, la gestion des corps physiques, des colliders, des events, des senseurs, des BVH asynchrones, et la boucle de simulation locale (fallback mode).

**Stratégie :** extraire les parties qui n'ont pas besoin de la closure d'état vers des fichiers séparés. L'état (les `let` / `Map`) reste dans `index.ts` mais est organisé et documenté. Les utilitaires purs et les helpers de parsing migrent vers des modules dédiés.

## Contrainte principale
Le plugin est une **closure** `definePlugin((...) => { ... })`. Tout l'état est capturé lexicalement. On ne peut pas extraire les fonctions qui utilisent cet état sans passer tout l'état en paramètre — ce qui serait pire. La stratégie est donc :
1. Extraire les fonctions **pures** (pas de capture de closure)
2. Extraire les types d'état locaux
3. Organiser le code restant en sections commentées claires

## Impact sur les autres packages
- **Aucun.** L'API publique du plugin reste `Physics3DPlugin` + les exports de `index.ts`.
- Les composables qui importent depuis `./plugin` ne changent pas.

---

## Étape 1 — Extraire les helpers purs dans `plugin/physics3d-utils.ts`

Ces fonctions dans `index.ts` n'utilisent pas la closure (pas de `let` capturés) :

**Créer :** `packages/physics3d/src/plugin/physics3d-utils.ts`

```typescript
/**
 * @file Pure utility functions for the Physics3D plugin.
 * None of these functions capture plugin closure state — they can be
 * imported anywhere and tested in isolation.
 */

import type { Physics3DBodyKind, Physics3DBodyState, Physics3DQuat, Physics3DVec3 } from '../types';

// ─── Entity ID helpers ────────────────────────────────────────────────────────

import type { Physics3DEntityId } from '../types';

/**
 * Convert a Physics3DEntityId (string | number | bigint) to the u32 entity
 * slot index used by WASM and as Map key.
 */
export function toEntityIndex(entityId: Physics3DEntityId): number {
  if (typeof entityId === 'bigint') return Number(entityId & 0xffffffffn);
  if (typeof entityId === 'number') return entityId;
  return parseInt(entityId as string, 10);
}

// ─── Body kind encoding ───────────────────────────────────────────────────────

/** Map WASM kind u8 (0=Fixed, 1=Dynamic, 2=Kinematic, 255=sentinel) to TS string. */
export function kindFromU8(k: number): Physics3DBodyKind {
  if (k === 0) return 'fixed';
  if (k === 2) return 'kinematic';
  return 'dynamic';
}

/** Map TS kind string to WASM u8 (0=Fixed, 1=Dynamic, 2=Kinematic). */
export function kindToU8(k: Physics3DBodyKind): number {
  if (k === 'fixed') return 0;
  if (k === 'kinematic') return 2;
  return 1;
}

// ─── Body state parsing ───────────────────────────────────────────────────────

/**
 * Parse a 13-element Float32Array from `physics3d_get_body_state` into
 * a typed `Physics3DBodyState`.
 *
 * Layout: [px,py,pz, qx,qy,qz,qw, vx,vy,vz, ax,ay,az]
 */
export function parseBodyState(arr: Float32Array): Physics3DBodyState {
  return {
    position:        { x: arr[0] ?? 0,  y: arr[1] ?? 0,  z: arr[2] ?? 0 },
    rotation:        { x: arr[3] ?? 0,  y: arr[4] ?? 0,  z: arr[5] ?? 0, w: arr[6] ?? 1 },
    linearVelocity:  { x: arr[7] ?? 0,  y: arr[8] ?? 0,  z: arr[9] ?? 0 },
    angularVelocity: { x: arr[10] ?? 0, y: arr[11] ?? 0, z: arr[12] ?? 0 },
  };
}

/** Deep-clone a Physics3DBodyState so snapshots are not aliased. */
export function cloneBodyState(s: Physics3DBodyState): Physics3DBodyState {
  return {
    position:        { ...s.position },
    rotation:        { ...s.rotation },
    linearVelocity:  { ...s.linearVelocity },
    angularVelocity: { ...s.angularVelocity },
  };
}

// ─── Vec / Quat constructors ──────────────────────────────────────────────────

/** Construct a fully-initialized Physics3DVec3 from a partial override. */
export function vec3(v?: Partial<Physics3DVec3>): Physics3DVec3 {
  return { x: v?.x ?? 0, y: v?.y ?? 0, z: v?.z ?? 0 };
}

/** Construct a fully-initialized Physics3DQuat from a partial override. */
export function quat(v?: Partial<Physics3DQuat>): Physics3DQuat {
  return { x: v?.x ?? 0, y: v?.y ?? 0, z: v?.z ?? 0, w: v?.w ?? 1 };
}
```

---

## Étape 2 — Extraire l'état du plugin dans un type `Physics3DPluginState`

**Créer :** `packages/physics3d/src/plugin/physics3d-state.ts`

Ce fichier définit le type de l'état interne — utile pour la documentation et pour les futures extractions.

```typescript
/**
 * @file Type declaration for the internal state of the Physics3D plugin closure.
 * The actual state lives as `let` variables inside `index.ts`.
 * This file exists for documentation and future extraction.
 * @internal
 */

import type {
  Physics3DBodyHandle,
  Physics3DBodyState,
  Physics3DColliderOptions,
  Physics3DSensorState,
  Physics3DCollisionContact,
  Physics3DPrefabExtension,
} from '../types';
import type { Physics3DWasmBridge, Physics3DBridgeRuntime, InternalCollisionEvent3D } from './bridge';
import type { GwenEngine } from '@gwenjs/core';

/** Snapshot of all mutable state held by the Physics3D plugin closure. */
export interface Physics3DPluginState {
  // Lifecycle
  ready: boolean;
  backendMode: 'wasm' | 'local';
  wasmBridge: Physics3DWasmBridge | null;
  bridgeRuntime: Physics3DBridgeRuntime | null;
  engine: GwenEngine | null;
  stepFn: ((delta: number) => void) | null;
  offEntityDestroyed: (() => void) | null;

  // Registries
  bodyByEntity: Map<number, Physics3DBodyHandle>;
  stateByEntity: Map<number, Physics3DBodyState>;
  localColliders: Map<number, Physics3DColliderOptions[]>;
  localSensorStates: Map<number, Map<number, Physics3DSensorState>>;
  entityCollisionCallbacks: Map<
    number,
    NonNullable<Physics3DPrefabExtension['onCollision']>
  >;

  // Event processing
  eventsView: DataView | null;
  eventsBufferRef: ArrayBuffer | null;
  pooledEvents: InternalCollisionEvent3D[];
  currentFrameContacts: Physics3DCollisionContact[];
  lastFrameEventCount: number;
  previousLocalContactKeys: Set<string>;
}
```

---

## Étape 3 — Mettre à jour `plugin/index.ts` : importer depuis les nouveaux fichiers

**Dans `packages/physics3d/src/plugin/index.ts`**, remplacer les définitions locales de `vec3`, `quat`, `toEntityIndex`, `kindFromU8`, `kindToU8`, `parseBodyState`, `cloneState` par des imports :

```typescript
import {
  vec3,
  quat,
  toEntityIndex,
  kindFromU8,
  kindToU8,
  parseBodyState,
  cloneBodyState as cloneState,
} from './physics3d-utils';
```

Supprimer les définitions dupliquées dans `index.ts`.

---

## Étape 4 — Organiser `index.ts` en sections commentées

Le fichier `index.ts` restant (~1600 LOC) doit être structuré avec des sections claires via des commentaires de région. Ajouter des séparateurs :

```typescript
// ─── Plugin state ─────────────────────────────────────────────────────────────
// (les let/const d'état : ready, wasmBridge, bodyByEntity, etc.)

// ─── Material resolution ───────────────────────────────────────────────────────
// (resolveColliderMaterial, nextColliderIdForEntity)

// ─── WASM event buffer ────────────────────────────────────────────────────────
// (getOrRefreshEventsView, readWasmEvents)

// ─── Collider dispatch (WASM mode) ────────────────────────────────────────────
// (dispatchColliderToWasm, les switch/if sur les shapes)

// ─── Local simulation (fallback mode) ────────────────────────────────────────
// (AABB checks, localStep, etc.)

// ─── Physics3DAPI implementation ─────────────────────────────────────────────
// (addBody, removeBody, addCollider, removeCollider, etc.)

// ─── Plugin lifecycle ─────────────────────────────────────────────────────────
// (onSetup, onUpdate, onDestroy — les hooks definePlugin)
```

---

## Étape 5 — Remplacer les `!` par des guards explicites

Les 35 `!` non-null assertions dans `index.ts` sont principalement sur `wasmBridge` et `_engine`. Créer un helper de guard en tête du fichier :

```typescript
/** Assert that the WASM bridge is available. Throws in debug, silently fails in prod. */
function requireWasmBridge(bridge: Physics3DWasmBridge | null): asserts bridge is Physics3DWasmBridge {
  if (bridge === null) {
    throw new Error('[Physics3D] WASM bridge not initialized — call setup() before using physics.');
  }
}
```

Utiliser `requireWasmBridge(wasmBridge)` aux points d'entrée critiques au lieu de `wasmBridge!.someMethod()`.

Pour les `!` moins critiques (accès tableau optionnel `arr[0]!`), remplacer par `arr[0] ?? 0` déjà présent dans `parseBodyState`.

---

## Étape 6 — Vérification

```bash
cd packages/physics3d

# Vérifier que les nouvelles fonctions dans physics3d-utils.ts sont testables
npx vitest run src/plugin/physics3d-utils.test.ts  # à créer (voir Plan TS-05)

# TypeScript compile
npx tsc --noEmit

# Tests passent
npx vitest run

# Compter les ! restants dans index.ts
grep -c "!" src/plugin/index.ts
# Objectif : < 10 (vs 35 avant)

# Vérifier la taille
wc -l src/plugin/index.ts
# Objectif : < 1400 lignes (réduction par extraction des utils)
```

---

## Résumé des fichiers créés/modifiés
| Fichier | Modification |
|---------|-------------|
| `packages/physics3d/src/plugin/physics3d-utils.ts` | **Nouveau** — 7 fonctions pures extraites |
| `packages/physics3d/src/plugin/physics3d-state.ts` | **Nouveau** — type de documentation |
| `packages/physics3d/src/plugin/index.ts` | Import depuis utils, sections commentées, guards `!` |
| Packages externes | **Aucun changement** |
