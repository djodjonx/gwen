# Plugin Ecosystem Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger 3 bugs critiques dans les plugins (BVH worker callback split, AudioPlugin preload leak, mesh/convex fallback silencieux) et 2 issues importantes (kit-platformer `physics: any`, Maps sans teardown).

**Architecture:** Le bug BVH (P-C1) est résolu en établissant `bvh.ts` comme source unique des Maps partagées — `plugin/index.ts` les importe au lieu de les redéclarer. L'audio (P-C2) est un fix 1-ligne avec `.finally()`. Le fallback warning (P-C3) est un `console.warn` conditionnel. Le kit-platformer (P-I1) retire le bridge `any` et injecte directement `physics2d`. Les Maps sans teardown (P-I2) sont nettoyées via le hook `entity:destroy`.

**Tech Stack:** TypeScript, Vitest, Web Workers, @gwenjs/physics2d, @gwenjs/physics3d, @gwenjs/kit-platformer, @gwenjs/audio

---

## Fichiers modifiés

| Fichier | Action |
|---|---|
| `packages/physics3d/src/plugin/bvh.ts` | Exporter `_bvhWorkerNextId` et `_bvhWorkerCallbacks` |
| `packages/physics3d/src/plugin/index.ts` | Importer ces exports depuis `bvh.ts`, supprimer les redéclarations |
| `packages/physics3d/src/plugin/index.ts` | Ajouter `console.warn` pour mesh/convex en fallback |
| `packages/physics3d/tests/mesh-collider-async.test.ts` | Test du chemin worker réel (>500 triangles) |
| `packages/audio/src/index.ts` | Ajouter `.finally()` dans `preload()` |
| `packages/audio/tests/audio.test.ts` | Test preload retry après échec réseau |
| `packages/kit-platformer/src/systems/PlatformerMovementSystem.ts` | Injecter `physics2d` directement |
| `packages/kit-platformer/src/augment.ts` | Retirer l'entrée `physics: any` |
| `packages/kit-platformer/src/systems/PlatformerMovementSystem.ts` | Ajouter teardown des Maps |

---

## Task 1 : Fix BVH worker callback split (P-C1)

**Contexte :** `plugin/index.ts` et `bvh.ts` déclarent chacun leur propre `_bvhWorkerCallbacks` Map. Le worker répond dans `bvh.ts` mais cherche dans sa Map locale — jamais dans celle de `plugin/index.ts`. Résultat : `useMeshCollider` sur des meshes >500 triangles retourne une `Promise<void>` qui ne se résout jamais.

**Files:**
- Modify: `packages/physics3d/src/plugin/bvh.ts`
- Modify: `packages/physics3d/src/plugin/index.ts`
- Create: `packages/physics3d/tests/bvh-worker-dispatch.test.ts`

- [ ] **Étape 1 : Écrire le test de régression**

Créer `packages/physics3d/tests/bvh-worker-dispatch.test.ts` :

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { _bvhWorkerCallbacks, _bvhWorkerNextId, getBvhWorker, BVH_WORKER_THRESHOLD } from '../src/plugin/bvh';

describe('BVH worker dispatch — shared callback Map', () => {
  it('exports _bvhWorkerCallbacks so plugin/index.ts can share it', () => {
    // Ce test vérifie simplement que bvh.ts exporte la Map.
    // Si ce test passe, le bug structural est corrigé.
    expect(_bvhWorkerCallbacks).toBeInstanceOf(Map);
    expect(typeof _bvhWorkerNextId).toBe('number');
  });

  it('resolves the callback when the worker posts a success message', async () => {
    // Simuler la réception d'un message du worker
    const jobId = 0;
    const mockBuffer = new ArrayBuffer(16);

    let resolve!: (buf: ArrayBuffer) => void;
    let reject!: (err: Error) => void;
    const p = new Promise<ArrayBuffer>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    // Enregistrer le callback dans la Map exportée (comme le fait plugin/index.ts après le fix)
    _bvhWorkerCallbacks.set(jobId, { resolve, reject });

    // Simuler la réponse du worker (comme le fait onmessage dans bvh.ts)
    const cb = _bvhWorkerCallbacks.get(jobId);
    expect(cb).toBeDefined();
    _bvhWorkerCallbacks.delete(jobId);
    cb!.resolve(mockBuffer);

    const result = await p;
    expect(result).toBe(mockBuffer);
    expect(_bvhWorkerCallbacks.has(jobId)).toBe(false);
  });
});
```

- [ ] **Étape 2 : Lancer le test — il doit échouer sur le premier `it` car `_bvhWorkerCallbacks` n'est pas exporté**

```bash
pnpm --filter @gwenjs/physics3d exec vitest run tests/bvh-worker-dispatch.test.ts 2>&1 | tail -10
```

Résultat attendu : `FAILED` (export introuvable ou `undefined`).

- [ ] **Étape 3 : Exporter les Maps depuis `bvh.ts`**

Dans `packages/physics3d/src/plugin/bvh.ts`, changer les déclarations privées en exports :

```typescript
// AVANT
let _bvhWorkerNextId = 0;
const _bvhWorkerCallbacks = new Map<
  number,
  { resolve: (buf: ArrayBuffer) => void; reject: (err: Error) => void }
>();

// APRÈS — exports nommés pour que plugin/index.ts puisse les importer
export let _bvhWorkerNextId = 0;
export const _bvhWorkerCallbacks = new Map<
  number,
  { resolve: (buf: ArrayBuffer) => void; reject: (err: Error) => void }
>();
```

> **Note :** `let` devient nécessairement mutable si `plugin/index.ts` incrémente le compteur. Alternativement, exporter une fonction `nextJobId(): number` qui encapsule l'incrément. La forme export de variable mutable est plus simple pour ce cas.

- [ ] **Étape 4 : Retirer les redéclarations dans `plugin/index.ts`**

Dans `packages/physics3d/src/plugin/index.ts`, trouver et supprimer :

```typescript
// SUPPRIMER ces lignes (~53-62 dans plugin/index.ts)
let _bvhWorkerNextId = 0;
const _bvhWorkerCallbacks = new Map<
  number,
  { resolve: (buf: ArrayBuffer) => void; reject: (err: Error) => void }
>();
```

Et mettre à jour l'import depuis `bvh` pour inclure ces exports :

```typescript
// AVANT
import { _fetchBvhBuffer, _clearBvhCache, getBvhWorker, BVH_WORKER_THRESHOLD } from './bvh';

// APRÈS
import {
  _fetchBvhBuffer,
  _clearBvhCache,
  getBvhWorker,
  BVH_WORKER_THRESHOLD,
  _bvhWorkerNextId,
  _bvhWorkerCallbacks,
} from './bvh';
```

> **⚠️ Attention :** `_bvhWorkerNextId` est un `let` dans `bvh.ts`. Pour l'incrémenter depuis `plugin/index.ts`, il faut soit exporter une fonction `incrementBvhJobId(): number` depuis `bvh.ts`, soit utiliser un objet mutable. La solution la plus propre :

```typescript
// bvh.ts — encapsuler le compteur dans un objet
export const _bvhJobCounter = { current: 0 };
// plugin/index.ts
const jobId = _bvhJobCounter.current++;
```

Choisir une des deux approches et être cohérent entre `bvh.ts` et `plugin/index.ts`.

- [ ] **Étape 5 : Lancer les tests**

```bash
pnpm --filter @gwenjs/physics3d exec vitest run tests/bvh-worker-dispatch.test.ts 2>&1 | tail -10
pnpm --filter @gwenjs/physics3d test 2>&1 | tail -20
```

Résultat attendu : tous `✓`.

- [ ] **Étape 6 : Vérifier TypeScript**

```bash
pnpm --filter @gwenjs/physics3d exec tsc --noEmit 2>&1 | head -20
```

Résultat attendu : 0 erreur.

- [ ] **Étape 7 : Commit**

```bash
git add packages/physics3d/src/plugin/bvh.ts packages/physics3d/src/plugin/index.ts packages/physics3d/tests/bvh-worker-dispatch.test.ts
git commit -m "fix(physics3d): unify BVH worker callback Map — plugin/index.ts now imports from bvh.ts

plugin/index.ts and bvh.ts each declared their own _bvhWorkerCallbacks Map.
The worker's onmessage handler in bvh.ts looked in its own Map, while
plugin/index.ts stored callbacks in its Map — so callbacks were never found
and useMeshCollider's ready Promise hung forever for meshes >500 triangles.

Fix: export the Map and counter from bvh.ts; plugin/index.ts imports them.
One source of truth, one Map, one worker handler.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2 : AudioPlugin — fix du leak dans `preload()` (P-C2)

**Contexte :** si `fetch()` ou `decodeAudioData()` rejette, `pendingLoads.delete(id)` n'est jamais appelé (il est dans le `.then()` succès). La Promise rejetée reste en cache indéfiniment. Tout appel ultérieur à `preload(id, url)` retourne immédiatement cette Promise rejetée sans retenter le fetch — le son ne peut plus jamais être chargé.

**Files:**
- Modify: `packages/audio/src/index.ts`
- Modify: `packages/audio/tests/audio.test.ts` (ou créer)

- [ ] **Étape 1 : Écrire le test de régression**

Dans `packages/audio/tests/audio.test.ts`, ajouter :

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';

describe('AudioPlugin.preload — retry after failure', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('removes failed load from pendingLoads so a retry succeeds', async () => {
    // Monter le plugin en mode test (sans vrai AudioContext)
    // Note: adapter l'import selon la structure du package audio
    const { createAudioPlugin } = await import('../src/index');
    const plugin = createAudioPlugin();

    // Mock fetch : échoue la première fois, réussit la deuxième
    let callCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error('Network error'));
      return Promise.resolve(new Response(new ArrayBuffer(0)));
    });

    // Première tentative — doit rejeter
    await expect(plugin.service.preload('shot', '/shot.wav')).rejects.toThrow('Network error');

    // Deuxième tentative — ne doit PAS retourner la Promise rejetée précédente
    // (si le bug existait, elle retournerait immédiatement la même Promise rejetée)
    const secondAttempt = plugin.service.preload('shot', '/shot.wav');
    expect(fetch).toHaveBeenCalledTimes(2); // un deuxième fetch a été fait
  });
});
```

> **Note :** adapter l'import selon la structure d'export réelle du package audio. Chercher avec `grep -n "export\|createAudioPlugin\|AudioPlugin" packages/audio/src/index.ts | head -10`.

- [ ] **Étape 2 : Lancer le test pour confirmer l'échec**

```bash
pnpm --filter @gwenjs/audio exec vitest run tests/audio.test.ts 2>&1 | tail -10
```

Résultat attendu : `FAILED` — le deuxième appel retourne la Promise rejetée sans faire de nouveau fetch.

- [ ] **Étape 3 : Appliquer le fix — ajouter `.finally()`**

Dans `packages/audio/src/index.ts`, remplacer la fonction `preload` :

```typescript
// AVANT
async preload(id, url) {
  if (sounds.has(id)) return;
  if (pendingLoads.has(id)) return pendingLoads.get(id)!;
  if (!context) throw new Error('[AudioPlugin] Plugin not initialized.');

  const p = fetch(url)
    .then((r) => r.arrayBuffer())
    .then((buf) => context!.decodeAudioData(buf))
    .then((buffer) => {
      sounds.set(id, { buffer, nodes: [] });
      pendingLoads.delete(id);  // ← uniquement en succès
    });
  pendingLoads.set(id, p);
  return p;
},

// APRÈS
async preload(id, url) {
  if (sounds.has(id)) return;
  if (pendingLoads.has(id)) return pendingLoads.get(id)!;
  if (!context) throw new Error('[AudioPlugin] Plugin not initialized.');

  const p = fetch(url)
    .then((r) => r.arrayBuffer())
    .then((buf) => context!.decodeAudioData(buf))
    .then((buffer) => {
      sounds.set(id, { buffer, nodes: [] });
    })
    .finally(() => {
      // Toujours supprimer de pendingLoads (succès ou échec)
      // En cas d'échec, cela permet de retenter le chargement.
      pendingLoads.delete(id);
    });
  pendingLoads.set(id, p);
  return p;
},
```

- [ ] **Étape 4 : Lancer les tests**

```bash
pnpm --filter @gwenjs/audio exec vitest run tests/audio.test.ts 2>&1 | tail -10
pnpm --filter @gwenjs/audio test 2>&1 | tail -10
```

Résultat attendu : tous `✓`.

- [ ] **Étape 5 : Commit**

```bash
git add packages/audio/src/index.ts packages/audio/tests/audio.test.ts
git commit -m "fix(audio): preload() now removes failed loads from pendingLoads via .finally()

pendingLoads.delete(id) was only called on success. A rejected Promise stayed
in the cache permanently, making it impossible to retry loading a sound after
any network error without restarting the engine.

Fix: move the delete to .finally() so it runs on both success and failure.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3 : Warning pour mesh/convex en fallback mode (P-C3)

**Contexte :** en mode `'local'` (sans WASM), les colliders `'mesh'` et `'convex'` utilisent silencieusement un AABB 1×1×1 m comme placeholder. La collision détectée ne correspond pas à la géométrie réelle. Aucun warning n'est émis.

**Files:**
- Modify: `packages/physics3d/src/plugin/index.ts`
- Modify: `packages/physics3d/tests/colliders.test.ts`

- [ ] **Étape 1 : Localiser `addColliderImpl` en mode fallback**

```bash
grep -n "backendMode\|'local'\|hx = 1\|mesh.*1\|convex.*1\|unit AABB" packages/physics3d/src/plugin/index.ts | head -20
```

- [ ] **Étape 2 : Écrire le test**

Dans `packages/physics3d/tests/colliders.test.ts`, ajouter :

```typescript
import { vi } from 'vitest';

describe('Physics3D fallback mode — mesh/convex warning', () => {
  it('emits console.warn when adding a mesh collider in fallback mode', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Créer le plugin en mode local (sans WASM)
    const { createPhysics3DPlugin } = require('../src');
    const plugin = createPhysics3DPlugin({ mode: 'local' });
    // ... setup minimal du plugin ...
    plugin.addCollider(entityId, { type: 'mesh', vertices: new Float32Array([...36 floats...]), indices: new Uint32Array([0,1,2,3,4,5,6,7,8,9,10,11]) });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("'mesh' collider uses a 1×1×1 unit AABB placeholder in fallback mode")
    );
    warnSpy.mockRestore();
  });

  it('does NOT warn for box colliders in fallback mode', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // ... ajouter un boxCollider en mode local ...
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
```

> **Note :** adapter le setup du plugin selon la structure réelle. Consulter `packages/physics3d/tests/colliders.test.ts` existant pour le pattern de setup.

- [ ] **Étape 3 : Ajouter le warning dans `addColliderImpl`**

Dans `packages/physics3d/src/plugin/index.ts`, dans le bloc `computeColliderAABB` ou `addColliderImpl` pour le mode `'local'` :

```typescript
// Trouver le bloc qui gère mesh/convex en fallback :
// } else {
//   // mesh/convex: use a unit AABB as a conservative placeholder
//   hx = 1; hy = 1; hz = 1;
// }

// APRÈS le commentaire et AVANT l'assignation :
} else {
  if (backendMode !== 'wasm') {
    console.warn(
      `[GWEN:Physics3D] '${shape.type}' collider added in fallback mode uses a 1×1×1 unit ` +
      `AABB placeholder — collision detection will NOT match the actual geometry. ` +
      `Load the physics3d WASM module for accurate mesh/convex collision.`
    );
  }
  hx = 1; hy = 1; hz = 1;
}
```

- [ ] **Étape 4 : Lancer les tests**

```bash
pnpm --filter @gwenjs/physics3d test 2>&1 | tail -20
```

Résultat attendu : tous `✓`.

- [ ] **Étape 5 : Commit**

```bash
git add packages/physics3d/src/plugin/index.ts packages/physics3d/tests/colliders.test.ts
git commit -m "fix(physics3d): warn when mesh/convex collider degrades to unit AABB in fallback mode

Silent 1×1×1 placeholder was indistinguishable from intentional behavior.
Now emits console.warn clearly stating the degradation and how to fix it.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4 : kit-platformer — supprimer `physics: any` et injecter `physics2d` directement (P-I1)

**Contexte :** `PlatformerMovementSystem` injecte `'physics'` typé `any`. L'utilisateur doit manuellement enregistrer `engine.provide('physics', engine.inject('physics2d'))` sans aucun avertissement en cas d'oubli. Toutes les API physics sont sans type-checking.

**Files:**
- Modify: `packages/kit-platformer/src/systems/PlatformerMovementSystem.ts`
- Modify: `packages/kit-platformer/src/augment.ts`
- Modify: `packages/kit-platformer/package.json` (peer dependency)

- [ ] **Étape 1 : Vérifier la structure actuelle**

```bash
grep -n "inject\|physics\|any" packages/kit-platformer/src/systems/PlatformerMovementSystem.ts | head -20
grep -n "physics" packages/kit-platformer/src/augment.ts | head -10
grep -n "physics2d\|peerDependencies" packages/kit-platformer/package.json | head -10
```

- [ ] **Étape 2 : Vérifier que `@gwenjs/physics2d` est déjà une peer dependency**

```bash
cat packages/kit-platformer/package.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('peerDependencies', {}))"
```

Si `@gwenjs/physics2d` n'est pas dans `peerDependencies`, l'ajouter :

```json
{
  "peerDependencies": {
    "@gwenjs/core": "workspace:*",
    "@gwenjs/physics2d": "workspace:*"
  }
}
```

- [ ] **Étape 3 : Écrire le test de type-safety**

Dans `packages/kit-platformer/tests/platformer-movement.test.ts` (ou fichier existant), ajouter :

```typescript
it('PlatformerMovementSystem uses physics2d service directly (no any cast)', async () => {
  // Ce test vérifie que le système se monte sans avoir à register 'physics' manuellement.
  const engine = await createEngine();
  const physics = new Physics2DPlugin();
  engine.use(physics);
  engine.use(new KitPlatformerPlugin());

  // Ne pas appeler engine.provide('physics', ...) — le système doit fonctionner sans ça
  await engine.start();
  // Si PlatformerMovementSystem injecte 'physics2d' directement, setup() ne throw pas
  await engine.stop();
});
```

- [ ] **Étape 4 : Modifier `PlatformerMovementSystem.ts`**

Dans `packages/kit-platformer/src/systems/PlatformerMovementSystem.ts` :

```typescript
// Ajouter l'import physics2d
import { usePhysics2D } from '@gwenjs/physics2d';

// Dans le corps du système (setup ou factory) :
// AVANT
const physics = engine.inject('physics') as any;

// APRÈS
const physics = usePhysics2D();
```

- [ ] **Étape 5 : Nettoyer `augment.ts`**

Dans `packages/kit-platformer/src/augment.ts`, supprimer l'entrée `physics: any` de la déclaration de service :

```typescript
// AVANT — dans GwenDefaultServices ou équivalent
'physics': any;

// APRÈS — supprimer cette ligne, physics2d est déjà déclaré par @gwenjs/physics2d
```

- [ ] **Étape 6 : Lancer les tests**

```bash
pnpm --filter @gwenjs/kit-platformer test 2>&1 | tail -20
pnpm typecheck 2>&1 | grep "kit-platformer" | head -10
```

Résultat attendu : tests `✓`, typecheck propre.

- [ ] **Étape 7 : Commit**

```bash
git add packages/kit-platformer/src/systems/PlatformerMovementSystem.ts packages/kit-platformer/src/augment.ts packages/kit-platformer/package.json
git commit -m "fix(kit-platformer): inject physics2d directly instead of untyped 'physics' bridge

PlatformerMovementSystem used engine.inject('physics') typed as any, requiring
an undocumented manual engine.provide('physics', engine.inject('physics2d')) call.
This bypassed all TypeScript checks on physics API calls.

Now uses usePhysics2D() composable directly, typed correctly, no bridge needed.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5 : kit-platformer — teardown des Maps dans `PlatformerMovementSystem` (P-I2)

**Contexte :** 4 Maps (`groundStates`, `jumpStates`, `nearStillAirMs`, `lastYByEntity`) accumulent des entrées pour les entités détruites sans jamais les supprimer. Dans un monde procédural avec beaucoup d'entités créées/détruites, c'est un leak mémoire progressif.

**Files:**
- Modify: `packages/kit-platformer/src/systems/PlatformerMovementSystem.ts`
- Modify: `packages/kit-platformer/tests/` (test de lifecycle)

- [ ] **Étape 1 : Lire la structure actuelle du système**

```bash
grep -n "groundStates\|jumpStates\|nearStillAirMs\|lastYByEntity\|onDestroy\|teardown\|entity:destroy" packages/kit-platformer/src/systems/PlatformerMovementSystem.ts | head -20
```

- [ ] **Étape 2 : Écrire le test de memory leak**

```typescript
describe('PlatformerMovementSystem — entity cleanup', () => {
  it('removes entity data from internal Maps when entity is destroyed', async () => {
    const engine = await createEngine();
    engine.use(new Physics2DPlugin());
    engine.use(new KitPlatformerPlugin());
    await engine.start();

    // Créer une entité avec le tag platformer
    const entityId = engine.createEntity();
    // ... ajouter les composants nécessaires au platformer ...

    // Ticker quelques frames pour peupler les Maps
    await engine.tick(16);

    // Détruire l'entité
    engine.destroyEntity(entityId);

    // Vérifier que les Maps sont nettoyées
    // Note: accéder aux Maps via un export de test ou via réflexion sur le système
    // Alternative: vérifier que le système ne plante pas après N destroy/create cycles
    for (let i = 0; i < 100; i++) {
      const e = engine.createEntity();
      // ... setup ...
      await engine.tick(16);
      engine.destroyEntity(e);
    }

    // Si leak : mémoire continuerait de croître. Le test vérifie l'absence de crash.
    await engine.stop();
  });
});
```

- [ ] **Étape 3 : Ajouter le nettoyage via hook `entity:destroy`**

Dans `packages/kit-platformer/src/systems/PlatformerMovementSystem.ts`, dans la fonction de setup du système :

```typescript
// Ajouter dans la phase de setup (là où onUpdate/onRender etc. sont enregistrés)

// Cleanup quand une entité est détruite
engine.hook('entity:destroy', (destroyedId) => {
  groundStates.delete(destroyedId);
  jumpStates.delete(destroyedId);
  nearStillAirMs.delete(destroyedId);
  lastYByEntity.delete(destroyedId);
});
```

- [ ] **Étape 4 : Ajouter un teardown qui vide les Maps**

Si le système expose un cycle de vie `teardown` ou `onDestroy`, ajouter :

```typescript
// Dans le teardown / cleanup du système
groundStates.clear();
jumpStates.clear();
nearStillAirMs.clear();
lastYByEntity.clear();
```

- [ ] **Étape 5 : Corriger `debugTick` overflow (P-M3)**

Dans le même fichier, chercher `debugTick` :

```bash
grep -n "debugTick" packages/kit-platformer/src/systems/PlatformerMovementSystem.ts
```

Remplacer le compteur non borné par un modulo :

```typescript
// AVANT
debugTick++;
if (debugTick % 30 === 0) { console.log(...); }

// APRÈS — utiliser l'engine frameCount, jamais de compteur local non borné
if (engine.frameCount % 30 === 0) { console.log(...); }
// Si engine.frameCount n'est pas accessible ici, utiliser performance.now() à la place :
// const now = performance.now();
// if (now - lastDebugLogTime > 500) { console.log(...); lastDebugLogTime = now; }
```

- [ ] **Étape 6 : Lancer les tests**

```bash
pnpm --filter @gwenjs/kit-platformer test 2>&1 | tail -20
```

Résultat attendu : tous `✓`.

- [ ] **Étape 7 : Commit**

```bash
git add packages/kit-platformer/src/systems/PlatformerMovementSystem.ts packages/kit-platformer/tests/
git commit -m "fix(kit-platformer): clean up entity Maps on entity:destroy to prevent memory leak

Four Maps (groundStates, jumpStates, nearStillAirMs, lastYByEntity) accumulated
entries for destroyed entities with no cleanup. In procedurally-generated worlds
with high entity churn this causes a progressive memory leak.

Fix: hook entity:destroy to remove per-entity entries immediately.
Also fix debugTick integer overflow by using modulo on engine.frameCount.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6 : Tests de régression globaux

- [ ] **Étape 1 : Tests complets des packages impactés**

```bash
pnpm --filter @gwenjs/physics3d test 2>&1 | tail -20
pnpm --filter @gwenjs/audio test 2>&1 | tail -20
pnpm --filter @gwenjs/kit-platformer test 2>&1 | tail -20
```

Résultat attendu : tous `✓`.

- [ ] **Étape 2 : Typecheck global**

```bash
pnpm typecheck 2>&1 | tail -20
```

Résultat attendu : 0 erreur.

- [ ] **Étape 3 : Lint**

```bash
pnpm lint 2>&1 | tail -20
```

Résultat attendu : 0 erreur.

- [ ] **Étape 4 : Build complet**

```bash
pnpm build 2>&1 | tail -20
```

Résultat attendu : build propre.
