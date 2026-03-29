# RFC-001 — Query System v2

**Statut:** Draft  
**Priorité:** P1 — Milestone 1  
**Packages impactés:** `@djodjonx/engine-core`, `@djodjonx/gwen-kit-platformer`, playgrounds

---

## Résumé

Ajouter un champ `query` à `defineSystem` qui injecte un itérateur typé `entities` dans
`onUpdate`. Cela permet au Vite plugin (RFC-008) de compiler la boucle vers du TypedArray pur,
et améliore la DX en évitant le suffixe `.name` et les WASM calls par entité.

---

## Motivation

### Problème actuel

```typescript
// Chaque frame, pour 1000 entités :
const entities = api.query([KartState.name, Transform.name]); // .name suffix requis
for (const eid of entities) {
  const state = api.getComponent(eid, KartState);   // 1 WASM call → deserialize
  const pos   = api.getComponent(eid, Transform);   // 1 WASM call → deserialize
  api.addComponent(eid, KartState, { ...state, speed: newSpeed }); // alloc {} + 1 WASM
}
// Total : 1 + 3000 WASM calls/frame = ~3ms à 1000 entités
```

### Après RFC-001 + RFC-008

```typescript
// Zéro WASM calls dans le hot loop (compile-time TypedArray offsets via RFC-008)
defineSystem('KartSystem', {
  query: [KartState, Transform],  // ← déclaration statique, pas de .name
  onUpdate(api, dt, entities) {   // ← entities injecté, typé
    for (const e of entities) {
      const speed = e.get(KartState).speed;     // TypedArray view, 0 WASM call
      e.set(KartState, { speed: speed + 1 });   // write direct, 0 alloc
    }
  }
});
```

---

## Design détaillé

### 1. Nouveau type `SystemQuery`

```typescript
export type ComponentDef = ComponentDefinition<ComponentSchema>;

export interface SystemQueryDescriptor {
  all?: ComponentDef[];        // Entités avec TOUS ces composants
  any?: ComponentDef[];        // Entités avec AU MOINS UN
  none?: ComponentDef[];       // Entités SANS aucun de ces composants
  changed?: ComponentDef[];    // Entités où au moins un composant a changé
  tag?: string;                // Filtre par tag ECS
}

// Forme courte (tableau = all:[])
export type SystemQuery = ComponentDef[] | SystemQueryDescriptor;
```

### 2. Nouveau champ `query` dans `SystemBody`

```typescript
export interface SystemBody {
  query?: SystemQuery;
  onInit?(api: EngineAPI): void;
  onBeforeUpdate?(api: EngineAPI, dt: number): void;
  // entities injecté si query est défini, sinon absent
  onUpdate?(api: EngineAPI, dt: number, entities?: QueryResult): void;
  onRender?(api: EngineAPI): void;
  onDestroy?(api: EngineAPI): void;
}
```

### 3. Type `QueryResult` — itérateur typé

```typescript
export interface EntityAccessor {
  readonly id: EntityId;
  get<S extends ComponentSchema>(def: ComponentDefinition<S>): InferSchemaType<S>;
  set<S extends ComponentSchema>(def: ComponentDefinition<S>, data: Partial<InferSchemaType<S>>): void;
  has(def: ComponentDef): boolean;
}

export type QueryResult = Iterable<EntityAccessor> & {
  readonly length: number;
  toArray(): EntityId[];
};
```

### 4. Comportement du QueryEngine

L'`Engine` résout la query à `onInit` du système et la met en cache comme `CompiledQuery`.
À chaque frame, le QueryEngine retourne le résultat filtré (invalidé sur mutation).

```typescript
// Dans Engine._tick(), phase onUpdate :
for (const system of this.pluginManager.systems) {
  if (system.query) {
    const result = this.queryEngine.resolve(system.query);
    await system.onUpdate?.(this.api, dt, result);
  } else {
    await system.onUpdate?.(this.api, dt);
  }
}
```

### 5. Compatibilité ascendante

- Les systèmes sans `query` ne reçoivent pas `entities` → **zéro breaking change**
- `api.query()` reste disponible pour les queries dynamiques (runtime)
- Le `.name` suffix reste accepté dans `api.query()` pour ne pas casser les plugins existants

### 6. Exemple — KartInputSystem

```typescript
export const KartInputSystem = defineSystem('KartInputSystem', {
  query: [KartState, Transform],

  onInit(api) {
    this._keyboard = api.services.get('keyboard');
  },

  onUpdate(api, dt, entities) {
    const keyboard = this._keyboard;
    const accel = keyboard.isPressed('ArrowUp') ? 1 : 0;
    const steer = keyboard.isPressed('ArrowLeft') ? -1
                : keyboard.isPressed('ArrowRight') ? 1 : 0;

    for (const e of entities) {
      const s = e.get(KartState);
      e.set(KartState, {
        throttle: accel,
        steer,
        speed: Math.max(0, s.speed + accel * dt * 10),
      });
    }
  }
});
```

---

## Fichiers à modifier

| Fichier | Changement |
|---------|-----------|
| `plugin-system/system.ts` | Ajouter `query?: SystemQuery`, types `QueryResult`, `EntityAccessor` |
| `core/ecs.ts` | Ajouter `QueryEngine.resolve(descriptor)` avec support `all/any/none/changed/tag` |
| `engine/engine.ts` | Injecter `QueryResult` dans le dispatch `onUpdate` |

**Nouveau fichier :** `src/core/query-result.ts` — implémentation runtime de `QueryResult`.
Le Vite plugin (RFC-008) remplace cette implémentation par du TypedArray pur en prod.

---

## Drawbacks

- `Changed<T>` nécessite un dirty-tracking par composant (1 bit/entité/composant)
- `onUpdate` a deux signatures selon que `query` est défini — overloads TypeScript requis

---

## Questions ouvertes

- `Changed<T>` : dirty flag dans le TS ECS ou signal depuis le WASM ?
- Faut-il un `tag` filter dans `SystemQueryDescriptor` dès M1 ou reporter à M2 ?
