# RFC-005 — Physics 3D Plugin

**Statut:** Draft  
**Priorité:** P2 — Milestone 2  
**Packages impactés:** `@djodjonx/gwen-plugin-physics3d` (nouveau)

---

## Résumé

Créer `@djodjonx/gwen-plugin-physics3d` : plugin WASM encapsulant Rapier3D,
même interface que `plugin-physics2d` mais étendu aux 3 dimensions.
Inclut un `VehicleController` pour la physique de kart.

---

## Motivation

Mario Kart JS a besoin :
- Collisions kart-kart et kart-décor (meshes 3D)
- Physique de véhicule (suspension, grip, dérive)
- Triggers (checkpoints, zones boost)
- Raycasts (contact sol pour suspension)

---

## Design détaillé

### 1. Interface `Physics3DAPI`

```typescript
export interface Physics3DAPI {
  // Corps rigides
  createBody(id: EntityId, config: RigidBodyConfig): void;
  removeBody(id: EntityId): void;
  applyForce(id: EntityId, force: Vec3): void;
  applyImpulse(id: EntityId, impulse: Vec3): void;
  applyTorque(id: EntityId, torque: Vec3): void;
  getLinearVelocity(id: EntityId): Vec3;
  setLinearVelocity(id: EntityId, vel: Vec3): void;
  getAngularVelocity(id: EntityId): Vec3;

  // Colliders
  addCollider(id: EntityId, config: ColliderConfig): void;
  removeCollider(id: EntityId, index?: number): void;

  // Queries spatiales
  raycast(ray: Ray, options?: RaycastOptions): RaycastHit | null;
  overlapSphere(center: Vec3, radius: number): EntityId[];

  // Événements (EntityId-natif — voir RFC-009)
  onCollision(handler: (event: CollisionEvent) => void): () => void;
  onTrigger(handler: (event: TriggerEvent) => void): () => void;

  // Véhicule
  readonly vehicle: VehicleController;
}
```

### 2. Types de corps

```typescript
export type RigidBodyType = 'dynamic' | 'kinematic' | 'fixed' | 'sensor';

export interface RigidBodyConfig {
  type: RigidBodyType;
  mass?: number;
  linearDamping?: number;
  angularDamping?: number;
  gravityScale?: number;
  ccdEnabled?: boolean;
}
```

### 3. Types de colliders

```typescript
export type ColliderShape =
  | { type: 'ball'; radius: number }
  | { type: 'cuboid'; halfExtents: Vec3 }
  | { type: 'capsule'; radius: number; halfHeight: number }
  | { type: 'convexHull'; points: Float32Array }
  | { type: 'trimesh'; vertices: Float32Array; indices: Uint32Array };

export interface ColliderConfig {
  shape: ColliderShape;
  friction?: number;
  restitution?: number;
  isSensor?: boolean;
  collisionGroups?: number;
}
```

### 4. VehicleController — physique de kart

```typescript
export interface VehicleController {
  create(id: EntityId, config: VehicleConfig): void;
  update(id: EntityId, input: VehicleInput): void;
  getState(id: EntityId): VehicleState;
}

export interface VehicleConfig {
  wheelPositions: [Vec3, Vec3, Vec3, Vec3]; // FL, FR, RL, RR
  suspensionRestLength: number;
  suspensionStiffness: number;
  suspensionDamping: number;
  maxSteerAngle: number;
  engineMaxForce: number;
  brakeForce: number;
  wheelRadius: number;
  wheelFriction: number;
}

export interface VehicleInput {
  throttle: number;   // [-1, 1]
  steer: number;      // [-1, 1]
  brake: number;      // [0, 1]
  handbrake: boolean;
}

export interface VehicleState {
  speed: number;
  driftAngle: number;
  wheelContacts: boolean[];
  suspensionLengths: number[];
}
```

### 5. Sync automatique Transform3D ↔ Rapier

```typescript
const PhysicsSync3DSystem = defineSystem('PhysicsSync3DSystem', {
  query: [Transform3D, RigidBody],
  onUpdate(api, dt, entities) {
    for (const e of entities) {
      const handle = bodyMap.get(e.id);
      if (!handle) continue;
      const pos = rapier.getBodyPosition(handle);
      const rot = rapier.getBodyRotation(handle);
      e.set(Transform3D, { position: pos, rotation: rot });
    }
  }
});
```

### 6. PluginDataBus channels

| Canal | Type | Usage |
|-------|------|-------|
| `physics3d:transforms` | `Float32Array` | Positions/rotations sync WASM→TS |
| `physics3d:events` | `EventChannel` | Collisions, triggers (ring-buffer) |

---

## Usage Mario Kart

```typescript
function spawnKart(api: EngineAPI, position: Vec3): EntityId {
  const id = api.entity.create();
  api.component.add(id, Transform3D, { position, rotation: {x:0,y:0,z:0,w:1}, scale:{x:1,y:1,z:1} });
  api.component.add(id, KartState, KartState.defaults);

  const physics = api.services.get('physics3d') as Physics3DAPI;
  physics.createBody(id, { type: 'dynamic', mass: 300, linearDamping: 0.5 });
  physics.addCollider(id, { shape: { type: 'cuboid', halfExtents: { x:0.8, y:0.5, z:1.2 } } });
  physics.vehicle.create(id, KART_VEHICLE_CONFIG);
  return id;
}
```

---

## Questions ouvertes

- `VehicleController` dans ce plugin ou dans `kit-kart` (RFC-010) ?
  (Recommandation : ici, car il utilise des internals Rapier non exposés publiquement)
- Pattern pour passer les vertices du circuit GLTF vers le trimesh Rapier ?
