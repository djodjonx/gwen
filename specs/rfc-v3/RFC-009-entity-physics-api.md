# RFC-009 — Entity-native Physics API

**Statut:** Draft  
**Priorité:** P3 — Milestone 4  
**Packages impactés:** `@djodjonx/gwen-plugin-physics3d`, `@djodjonx/gwen-plugin-physics2d`

---

## Résumé

Wrapper EntityId-natif par-dessus l'API slot-based de Rapier.
Le développeur n'a plus à gérer des indices `playerSlot`, `footSlot`, etc.
L'EntityId GWEN est la seule clé pour interagir avec la physique.

---

## Motivation

### Problème actuel (mario-css)

```typescript
let playerSlot = -1;              // indice Rapier — fragile, manuel
let playerEntityId: EntityId | null = null;

// Mapping manuel à conserver
const slot = physics.createBody(...); // retourne un number
// Dev doit maintenir EntityId ↔ slot lui-même

physics.applyImpulse(playerSlot, 0, JUMP_IMPULSE); // utilise le slot
```

### Après RFC-009

```typescript
// EntityId uniquement
physics.createBody(id, { type: 'dynamic', mass: 60 });
physics.applyImpulse(id, { x: 0, y: 500, z: 0 });
const vel = physics.getLinearVelocity(id);
// Mapping EntityId ↔ slot géré internalement par GWEN
```

---

## Design détaillé

### 1. `EntityPhysicsMap` — registre interne

```typescript
export class EntityPhysicsMap {
  private entityToHandle = new Map<EntityId, number>();
  private handleToEntity = new Map<number, EntityId>();

  register(id: EntityId, handle: number): void {
    this.entityToHandle.set(id, handle);
    this.handleToEntity.set(handle, id);
  }

  unregister(id: EntityId): void {
    const h = this.entityToHandle.get(id);
    if (h !== undefined) this.handleToEntity.delete(h);
    this.entityToHandle.delete(id);
  }

  getHandle(id: EntityId): number {
    const h = this.entityToHandle.get(id);
    if (h === undefined) throw new Error(`[Physics3D] No body for entity ${id}`);
    return h;
  }

  getEntity(handle: number): EntityId | undefined {
    return this.handleToEntity.get(handle);
  }
}
```

### 2. Cleanup automatique à la destruction d'entité

```typescript
onInit(api: EngineAPI) {
  api.hooks.hook('entity:destroyed', (entityId) => {
    if (this.bodyMap.has(entityId)) {
      this.rapier.removeBody(this.bodyMap.getHandle(entityId));
      this.bodyMap.unregister(entityId);
    }
  });
}
```

### 3. Collision events — EntityId dans les événements

```typescript
// Le dev reçoit des EntityIds, jamais des handles Rapier
physics.onCollision((event) => {
  console.log(event.entityA, event.entityB); // EntityId GWEN
  console.log(event.normal, event.depth);
});

// Raycast avec EntityId dans le résultat
const hit = physics.raycast({ origin: pos, direction: down, maxDistance: 2.0 });
if (hit) {
  console.log(hit.entityId); // EntityId GWEN
}
```

### 4. Migration plugin-physics2d

```typescript
// Avant
physics.applyImpulse(playerSlot, 0, JUMP_IMPULSE);

// Après
physics.applyImpulse(playerEntityId, { x: 0, y: JUMP_IMPULSE });
```

Plan :
1. V1 : accepte EntityId ET number (slot) — warning sur les slots
2. V2 : supprime le support des slots

### 5. `usePhysicsBody` (adapter R3F)

```typescript
// Cleanup automatique au unmount React
export function usePhysicsBody(id: EntityId, config: RigidBodyConfig): Physics3DAPI {
  const physics = useService('physics3d') as Physics3DAPI;
  useEffect(() => {
    physics.createBody(id, config);
    return () => physics.removeBody(id);
  }, [id]);
  return physics;
}
```

---

## Drawbacks

- `Map<EntityId, number>` : ~56 bytes/entité overhead — négligeable jusqu'à 100k entités
- Nécéssite que `entity:destroyed` soit bien propagé (hook engine existant)

---

## Questions ouvertes

- Exposer `getHandle(id)` en public pour les power users voulant accéder à Rapier directement ?
- Cleanup synchrone ou différé à la prochaine frame physique ?
