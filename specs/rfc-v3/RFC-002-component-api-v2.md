# RFC-002 — Component API v2

**Statut:** Draft  
**Priorité:** P1 — Milestone 1  
**Packages impactés:** `@djodjonx/engine-core`

---

## Résumé

Séparer `add` (création) et `set` (mise à jour), introduire un namespace `api.component`
avec une API non-allouante pour les updates de hot loop, et un namespace `api.entity`
avec la gestion des tags ECS.

---

## Motivation

### Problème actuel

```typescript
// api.addComponent utilisé pour CRÉER et METTRE À JOUR — ambigu
// Chaque appel alloue un objet {} en mémoire
api.addComponent(eid, KartState, { ...state, speed: newSpeed }); // alloc + serialize + WASM
```

### Après RFC-002

```typescript
// Création (une seule fois, onInit ou onSpawn)
api.component.add(eid, KartState, { speed: 0, throttle: 0 });

// Update non-allouant (hot loop, chaque frame)
api.component.set(eid, KartState, { speed: newSpeed }); // patch partiel, 0 alloc

// Lecture
const state = api.component.get(eid, KartState);

// Tags
api.entity.tag(eid, 'drifting');
api.entity.untag(eid, 'drifting');
api.entity.hasTag(eid, 'drifting'); // → boolean
```

---

## Design détaillé

### 1. Interface `ComponentAPI`

```typescript
export interface ComponentAPI {
  add<S extends ComponentSchema>(
    id: EntityId,
    def: ComponentDefinition<S>,
    data: InferSchemaType<S>
  ): void;

  /**
   * Patch partiel, non-allouant — écrit directement dans le buffer binaire.
   * Upsert : crée le composant si absent (avec defaults pour les champs manquants).
   */
  set<S extends ComponentSchema>(
    id: EntityId,
    def: ComponentDefinition<S>,
    patch: Partial<InferSchemaType<S>>
  ): void;

  get<S extends ComponentSchema>(
    id: EntityId,
    def: ComponentDefinition<S>
  ): InferSchemaType<S> | undefined;

  getOrThrow<S extends ComponentSchema>(
    id: EntityId,
    def: ComponentDefinition<S>
  ): InferSchemaType<S>;

  remove(id: EntityId, def: ComponentDef): boolean;
  has(id: EntityId, def: ComponentDef): boolean;
}
```

### 2. Interface `EntityAPI`

```typescript
export interface EntityAPI {
  create(): EntityId;
  destroy(id: EntityId): boolean;
  isAlive(id: EntityId): boolean;
  tag(id: EntityId, tag: string): void;
  untag(id: EntityId, tag: string): void;
  hasTag(id: EntityId, tag: string): boolean;
}
```

### 3. Intégration dans `EngineAPI`

```typescript
export interface EngineAPI {
  readonly component: ComponentAPI;
  readonly entity: EntityAPI;

  // Rétrocompatibilité — deprecated mais non supprimé en M1
  /** @deprecated Use api.component.add() or api.component.set() */
  addComponent<T>(id: EntityId, type: ComponentType | ComponentDefinition<any>, data: T): void;
  /** @deprecated Use api.component.get() */
  getComponent<T>(id: EntityId, type: ComponentType): T | undefined;
}
```

### 4. Implémentation de `set()` — zéro allocation

```typescript
set(id, def, patch) {
  const offset = this.componentRegistry.getOffset(id, def);
  if (offset === -1) {
    // Upsert : crée avec defaults + patch
    this.add(id, def, { ...def.defaults, ...patch });
    return;
  }
  const view = new DataView(this.binaryBuffer, offset);
  let byteOffset = 0;
  for (const [fieldName, type] of Object.entries(def.schema)) {
    if (fieldName in patch) {
      type.serialize(patch[fieldName], view, byteOffset);
    }
    byteOffset += type.byteSize;
  }
  this.queryEngine.invalidate();
}
```

**Perf clé :** En mode compilé (RFC-008), remplacé par `Float32Array[offset] = value` direct.

### 5. Tags ECS

Les tags sont des composants vides stockés dans un `Set<string>` par entité.
Leur présence/absence déclenche l'invalidation du QueryEngine.

```typescript
// Dans la query (RFC-001)
defineSystem('DriftSmokeSystem', {
  query: { all: [Transform3D], tag: 'drifting' }, // seuls les karts en drift
  onUpdate(api, dt, entities) { ... }
});
```

### 6. Defaults dans `defineComponent`

Les defaults sont requis pour que `set()` puisse faire un upsert :

```typescript
export const KartState = defineComponent({
  name: 'KartState',
  schema: { speed: Types.f32, drifting: Types.bool },
  defaults: { speed: 0, drifting: false }, // ← nouveau champ optionnel
});
```

---

## Migration CLI

```bash
gwen migrate --to api-v2
# Transforme automatiquement :
# api.addComponent(id, T, data) → api.component.add(id, T, data)
# api.addComponent(id, T, {...existing, ...patch}) → api.component.set(id, T, patch)
# api.getComponent(id, T) → api.component.get(id, T)
```

---

## Drawbacks

- `set()` avec upsert nécessite des defaults dans le schema
- Breaking si les consumers ne migrent pas (atténué par les méthodes dépréciées)

---

## Questions ouvertes

- Faut-il un `api.component.getOrDefault()` séparé ?
- Les defaults doivent-ils être obligatoires ou optionnels dans `defineComponent` ?
