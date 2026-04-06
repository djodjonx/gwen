# Plan VITE-05 — Corrections des hotpaths JS runtime

## Objectif

Identifier et corriger les patterns JS qui génèrent des **allocations inutiles** ou
des **boucles inefficaces** dans les hotpaths du moteur (frame loop, ECS queries).

Ces corrections sont distinctes des optimisations compile-time (VITE-01 à VITE-04) :
elles s'appliquent directement dans les packages `core`, `physics2d`, `physics3d`
et dans le code généré par le vite plugin.

---

## Contexte : packages analysés

Les fichiers suivants ont été identifiés comme hotpaths :
- `packages/core/src/` — engine frame loop, ECS queries, live queries
- `packages/physics2d/src/plugin/` — contact ring buffer, shape system
- `packages/physics3d/src/plugin/` — bridge events, body state parsing

---

## Hotpath 1 — Spread operator sur `createLiveQuery()`

### Localisation

À rechercher dans tout `packages/core/src/` :

```typescript
// Pattern problématique
const entities = [...createLiveQuery([Position, Velocity])];
// ou
for (const e of [...useQuery(...)]) { ... }
```

### Problème

`[...iterable]` crée un tableau temporaire à chaque frame. Sur 1000 entités × 60fps = **60 000 tableaux/seconde** alloués et immédiatement GC'd. Crée de la pression GC visible dans le profiler.

### Correction

```typescript
// Avant (alloue un tableau temporaire)
const entities = [...createLiveQuery([Position, Velocity])];
for (const e of entities) { ... }

// Après (zero-copy — itère directement l'itérable)
for (const e of createLiveQuery([Position, Velocity])) { ... }
```

Si le tableau est réutilisé plusieurs fois dans la même frame, pré-allouer un buffer fixe :

```typescript
// Si nécessaire de matérialiser : réutiliser un buffer
// (pattern avancé — uniquement si createLiveQuery() ne supporte pas la double itération)
const _entityBuffer: number[] = [];

function collectEntities(query: Iterable<number>): number[] {
  _entityBuffer.length = 0;
  for (const e of query) _entityBuffer.push(e);
  return _entityBuffer;
}
```

### Action

1. Grep : `grep -r '\[\.\.\.' packages/core/src/ packages/physics2d/src/ packages/physics3d/src/`
2. Pour chaque occurrence dans une boucle frame (dans `onUpdate`, `system.update`, frame callback) :
   - Si le tableau n'est utilisé qu'une fois → remplacer `[...query]` par `for...of query`
   - Si le tableau est passé à une fonction externe qui requiert `Array` → garder, mais documenter

---

## Hotpath 2 — Double boucle dans les callbacks d'événements

### Localisation

Dans `packages/physics2d/src/plugin/` et `packages/physics3d/src/plugin/index.ts` :

```typescript
// Pattern suspect — boucle externe sur events + boucle interne sur handlers
for (const event of events) {
  for (const handler of this._handlers) {
    if (handler.type === event.type) handler.callback(event);
  }
}
```

### Problème

O(N×M) par frame où N = nombre d'events et M = nombre de handlers.
Sur des systèmes actifs avec 100+ collisions/frame et 20+ handlers : **2000 comparaisons/frame**.

### Correction : index par type

```typescript
// Pré-indexer les handlers par type (une fois à l'enregistrement)
private readonly _handlersByType = new Map<string, Array<(e: unknown) => void>>();

addHandler(type: string, callback: (e: unknown) => void): void {
  let arr = this._handlersByType.get(type);
  if (!arr) { arr = []; this._handlersByType.set(type, arr); }
  arr.push(callback);
}

// Dans le frame loop : O(N) uniquement
for (const event of events) {
  const handlers = this._handlersByType.get(event.type);
  if (!handlers) continue;
  for (const h of handlers) h(event);
}
```

### Action

1. Grep : `grep -rn 'for.*handlers\|for.*callbacks\|for.*listeners' packages/physics2d/src/ packages/physics3d/src/`
2. Identifier les doubles boucles `for..of events { for..of handlers { ... } }`
3. Appliquer le pattern Map-par-type si M > 5 handlers (sinon la Map a un overhead non justifié)

---

## Hotpath 3 — `slice()` sur les batches d'événements

### Localisation

Dans le ring buffer physics2d / physics3d, après `flush()` :

```typescript
// Pattern problématique
const batch = this._events.slice(0, count);
for (const event of batch) { ... }
```

### Problème

`slice()` alloue un nouveau tableau à chaque frame même si les données ne sont pas modifiées.

### Correction

```typescript
// Avant
const batch = events.slice(0, count);

// Après : itérer par index sur le tableau original
for (let i = 0; i < count; i++) {
  processEvent(events[i]);
}
```

Si le tableau doit être passé à du code externe :

```typescript
// Réutiliser une vue — pas d'allocation si le buffer est un TypedArray
// Pour Array<T> ordinaire, on ne peut pas éviter le slice — documenter le compromis
```

### Action

1. Grep : `grep -rn '\.slice(' packages/core/src/ packages/physics2d/src/ packages/physics3d/src/`
2. Pour chaque `.slice()` dans un hotpath frame :
   - Si dans `onUpdate` ou équivalent → remplacer par boucle indexée
   - Si résultat passé à une API externe qui requiert `Array` → ajouter un commentaire `// NOTE: allocation required by external API`

---

## Hotpath 4 — Allocations objets dans le pathfinding / event payloads

### Localisation

Dans `packages/physics3d/src/plugin/index.ts`, la fonction `parseBodyState` :

```typescript
// Chaque frame, pour chaque corps physique :
function parseBodyState(buf: Float32Array, offset: number): BodyState {
  return {        // ← allocation d'objet à chaque appel
    position: { x: buf[offset], y: buf[offset+1], z: buf[offset+2] },
    rotation: { x: buf[offset+3], y: buf[offset+4], z: buf[offset+5], w: buf[offset+6] },
    // ...
  };
}
```

### Problème

Sur 1000 corps physiques × 60fps = **60 000 objets/frame** alloués et GC'd.

### Correction : struct-of-arrays ou pool d'objets

**Option A — Struct-of-arrays (préférée pour TypeScript + WASM)**

Au lieu de matérialiser des objets, exposer des accesseurs directs sur le buffer :

```typescript
// Lire les propriétés directement depuis le Float32Array
class BodyStateView {
  constructor(private readonly buf: Float32Array, private offset: number) {}
  get posX() { return this.buf[this.offset]; }
  get posY() { return this.buf[this.offset + 1]; }
  get posZ() { return this.buf[this.offset + 2]; }
  // ...
  setOffset(offset: number) { this.offset = offset; return this; }
}

// Une seule instance réutilisée dans la boucle
const _view = new BodyStateView(buf, 0);
for (let i = 0; i < count; i++) {
  _view.setOffset(i * BODY_STRIDE);
  callback(_view); // ← pas d'allocation
}
```

**Option B — Object pool (simpler)**

```typescript
const _statePool: BodyState[] = [];

function acquireBodyState(): BodyState {
  return _statePool.pop() ?? { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
}

function releaseBodyState(s: BodyState): void {
  _statePool.push(s);
}
```

**Recommandation :** Option A si les callbacks sont synchrones (pas d'async/await). Option B si les états sont gardés entre frames.

### Action

1. Identifier `parseBodyState` dans `packages/physics3d/src/plugin/index.ts`
2. Comptabiliser combien de fois elle est appelée par frame (chercher les boucles qui l'appellent)
3. Si > 10 appels/frame → implémenter `BodyStateView` (Option A)
4. Mettre à jour les types de `PhysicsBodyStateCallback` pour accepter `BodyStateView | BodyState`

---

## Hotpath 5 — `Object.assign({}, ...)` dans les payloads d'events

### Localisation

À grep dans les plugins physics :

```typescript
this.emit({ ...baseEvent, entityId, type: 'contact' });
// ou
const payload = Object.assign({}, base, { entityId });
```

### Problème

Spread objet (`{ ...x }`) alloue un nouvel objet à chaque event émis.

### Correction

```typescript
// Réutiliser des objets event depuis un pool
const _contactEventPool: ContactEvent[] = [];

function emitContact(entityA: number, entityB: number): void {
  const ev = _contactEventPool.pop() ?? { type: 'contact', entityA: 0, entityB: 0 };
  ev.entityA = entityA;
  ev.entityB = entityB;
  this._emit(ev);
  // Les handlers doivent libérer l'event s'ils ont besoin de le garder :
  // const evCopy = { ...ev }; // copie explicite si nécessaire
}
```

### Action

1. Grep : `grep -rn 'Object\.assign\|{\s*\.\.\.' packages/physics2d/src/ packages/physics3d/src/`
2. Filtrer les occurrences dans les hotpaths (dans des boucles sur des entités ou dans `onUpdate`)
3. Appliquer un pool d'events pour les types les plus fréquents (contact, collision, trigger)

---

## Hotpath 6 — Boucle `for...in` sur des objets dans le frame loop

### Problème général

`for...in` est significativement plus lent que `for...of` sur des arrays, et plus lent que
`Object.keys().forEach()` sur les objets. Il traverse aussi la chaîne prototype.

### Action

1. Grep : `grep -rn 'for\s*(\s*const\s*\w\+\s*in' packages/core/src/ packages/physics2d/src/ packages/physics3d/src/`
2. Remplacer les `for...in` dans les hotpaths par `for...of Object.keys()` ou par une Map

---

## Récapitulatif des actions par fichier

| Fichier | Hotpath | Correction |
|---------|---------|------------|
| `packages/core/src/` | `[...createLiveQuery()]` | `for...of` direct |
| `packages/physics2d/src/plugin/ring-buffer.ts` | `.slice()` sur batch | boucle indexée |
| `packages/physics3d/src/plugin/index.ts` | `parseBodyState()` | `BodyStateView` |
| `packages/physics3d/src/plugin/index.ts` | `{ ...event }` | pool d'events |
| `packages/physics2d/src/plugin/` | double boucle handlers | Map par type |

---

## Checklist d'implémentation

> **Important :** ces corrections doivent être vérifiées avec le profiler Chrome (Performance panel)
> avant et après. Ne corriger que les hotpaths confirmés — pas de micro-optimisation préventive.

- [ ] Hotpath 1 : Grep `[...` dans les frame loops → remplacer par `for...of`
- [ ] Hotpath 2 : Identifier doubles boucles handlers → indexer par type avec Map
- [ ] Hotpath 3 : Grep `.slice(` dans les frame loops → boucle indexée
- [ ] Hotpath 4 : Auditer `parseBodyState` → implémenter `BodyStateView` si > 10 appels/frame
- [ ] Hotpath 5 : Grep `{ ...event }` → pool d'events pour les types fréquents
- [ ] Hotpath 6 : Grep `for...in` → remplacer par `for...of Object.keys()`

## Impact sur les autres packages

- **Aucune API publique modifiée** pour les hotpaths 1, 2, 3, 6
- **Hotpath 4** : si `BodyStateView` est exposé dans les callbacks, les types TypeScript
  des handlers physics3D doivent être mis à jour (breaking change mineur dans `types.ts`)
  → utiliser une union `BodyState | BodyStateView` pour la compatibilité descendante
- **Hotpath 5** : les handlers qui conservent une référence à l'event entre les frames
  doivent faire une copie explicite (`{ ...ev }`) — **documenter ce comportement**
