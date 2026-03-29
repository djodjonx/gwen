# RFC-010 — Kit Kart

**Statut:** Draft  
**Priorité:** P4 — Milestone 5  
**Packages impactés:** `@gwen/kit-kart` (nouveau)

---

## Résumé

Créer `@gwen/kit-kart` : kit de démarrage pour les jeux racing/kart.
Composants, systèmes et prefabs pour avoir un kart qui roule et dérive en < 30 min.
Même philosophie que `@djodjonx/gwen-kit-platformer` mais en 3D.

**Principe cardinal :** kit-kart ne sait pas ce qu'est Mario Kart.
Il ne connaît pas les bananes, carapaces ou tours de circuit.
Ce sont des mécanismes de véhicule, pas des règles de jeu.

---

## Design détaillé

### 1. Composants

```typescript
// Configuration statique du kart
export const KartController = defineComponent({
  name: 'KartController',
  schema: {
    maxSpeed:       Types.f32,   // m/s (défaut: 20)
    acceleration:   Types.f32,   // m/s² (défaut: 15)
    brakeForce:     Types.f32,   // facteur [0,1] (défaut: 0.6)
    steerSpeed:     Types.f32,   // rad/s (défaut: 3)
    maxSteerAngle:  Types.f32,   // rad (défaut: 0.45)
    gripFront:      Types.f32,   // adhérence [0,1] (défaut: 0.9)
    gripRear:       Types.f32,   // adhérence [0,1] (défaut: 0.75)
    driftThreshold: Types.f32,   // vitesse angulaire pour déclencher drift (défaut: 1.2)
    driftBoostMax:  Types.f32,   // charge max boost (défaut: 1.0)
    mass:           Types.f32,   // kg (défaut: 300)
  },
  defaults: { maxSpeed:20, acceleration:15, brakeForce:0.6, steerSpeed:3, maxSteerAngle:0.45,
              gripFront:0.9, gripRear:0.75, driftThreshold:1.2, driftBoostMax:1.0, mass:300 }
});

// État runtime (read-only pour le jeu)
export const KartState = defineComponent({
  name: 'KartState',
  schema: {
    speed:          Types.f32,
    steerAngle:     Types.f32,
    drifting:       Types.bool,
    driftAngle:     Types.f32,
    driftBoost:     Types.f32,   // [0,1]
    grounded:       Types.bool,
    groundedWheels: Types.i32,   // bitmask 4 roues
    airTime:        Types.f32,
  },
  defaults: { speed:0, steerAngle:0, drifting:false, driftAngle:0, driftBoost:0, grounded:true, groundedWheels:15, airTime:0 }
});

// Input frame courante
export const KartInput = defineComponent({
  name: 'KartInput',
  schema: {
    throttle:  Types.f32,   // [0,1]
    brake:     Types.f32,   // [0,1]
    steer:     Types.f32,   // [-1,1]
    handbrake: Types.bool,
    boost:     Types.bool,
  },
  defaults: { throttle:0, brake:0, steer:0, handbrake:false, boost:false }
});
```

### 2. KartPlugin

```typescript
export class KartPlugin implements GwenPlugin {
  readonly id = 'kit-kart';

  constructor(private options: { defaultInput?: boolean } = {}) {}

  onInit(api: EngineAPI) {
    api.pluginManager.addSystem(KartInputSystem(this.options));
    api.pluginManager.addSystem(KartPhysicsSystem);
    api.pluginManager.addSystem(KartDriftSystem);
    api.pluginManager.addSystem(WheelSyncSystem);
  }
}
```

### 3. KartPhysicsSystem

```typescript
export const KartPhysicsSystem = defineSystem('KartPhysicsSystem', {
  query: [KartController, KartState, KartInput, Transform3D],
  onInit(api) { this._physics = api.services.get('physics3d') as Physics3DAPI; },
  onUpdate(api, dt, entities) {
    const physics = this._physics;
    for (const e of entities) {
      const ctrl  = e.get(KartController);
      const state = e.get(KartState);
      const input = e.get(KartInput);

      const targetSpeed = input.throttle * ctrl.maxSpeed - input.brake * ctrl.maxSpeed * ctrl.brakeForce;
      const newSpeed = damp(state.speed, targetSpeed, 4, dt);
      const targetSteer = input.steer * ctrl.maxSteerAngle;
      const newSteer = damp(state.steerAngle, targetSteer, ctrl.steerSpeed, dt);

      if (state.grounded) {
        const t = e.get(Transform3D);
        const forward = rotateByQuat(FORWARD, t.rotation);
        const right   = rotateByQuat(RIGHT, t.rotation);
        physics.applyForce(e.id, scaleVec3(forward, newSpeed * ctrl.mass * dt));
        physics.applyTorque(e.id, { x: 0, y: newSteer * ctrl.mass * 0.5, z: 0 });
        const vel = physics.getLinearVelocity(e.id);
        const lateralSlip = dotVec3(vel, right);
        physics.applyForce(e.id, scaleVec3(right, -lateralSlip * ctrl.gripRear * ctrl.mass));
      }
      e.set(KartState, { speed: newSpeed, steerAngle: newSteer });
    }
  }
});
```

### 4. KartDriftSystem

```typescript
export const KartDriftSystem = defineSystem('KartDriftSystem', {
  query: [KartController, KartState, KartInput],
  onUpdate(api, dt, entities) {
    for (const e of entities) {
      const ctrl  = e.get(KartController);
      const state = e.get(KartState);
      const input = e.get(KartInput);
      const wasDrifting = state.drifting;
      const isDrifting = wasDrifting ? input.handbrake : (input.handbrake && state.speed > 5 && state.grounded);
      const driftAngle = damp(state.driftAngle, isDrifting ? input.steer * 0.8 : 0, isDrifting ? 3 : 8, dt);
      let driftBoost = state.driftBoost;
      if (isDrifting && Math.abs(driftAngle) > 0.3) {
        driftBoost = Math.min(ctrl.driftBoostMax, driftBoost + dt * 0.4);
      } else if (!isDrifting && wasDrifting && driftBoost > 0.5) {
        api.hooks.call('kart:drift-boost', { entityId: e.id, charge: driftBoost });
        driftBoost = 0;
      }
      e.set(KartState, { drifting: isDrifting, driftAngle, driftBoost });
    }
  }
});
```

### 5. `spawnKart` helper

```typescript
export function spawnKart(api: EngineAPI, config: {
  position: Vec3;
  rotation?: Quat;
  controller?: Partial<KartControllerData>;
  tags?: string[];
}): EntityId {
  const id = api.entity.create();
  api.component.add(id, Transform3D, { position: config.position, rotation: config.rotation ?? QUAT_IDENTITY, scale: VEC3_ONE });
  api.component.add(id, KartController, { ...KartController.defaults, ...config.controller });
  api.component.add(id, KartState, KartState.defaults);
  api.component.add(id, KartInput, KartInput.defaults);
  const physics = api.services.get('physics3d') as Physics3DAPI;
  physics.createBody(id, { type: 'dynamic', mass: config.controller?.mass ?? 300 });
  physics.addCollider(id, { shape: { type: 'cuboid', halfExtents: { x:0.8, y:0.4, z:1.2 } } });
  physics.vehicle.create(id, defaultVehicleConfig(config.controller));
  for (const tag of config.tags ?? []) api.entity.tag(id, tag);
  return id;
}
```

### 6. Hooks exposés

| Hook | Data | Usage jeu |
|------|------|-----------|
| `kart:drift-boost` | `{ entityId, charge }` | Particules, son, boost vitesse |
| `kart:grounded` | `{ entityId, wasAirborne }` | Son atterrissage, caméra shake |
| `kart:collision` | `{ entityA, entityB, speed }` | Son de choc, knockback |
| `kart:speed-change` | `{ entityId, speed }` | HUD, effets sonores moteur |

### 7. Exemple complet — Mario Kart JS sur GWEN

```typescript
// gwen.config.ts
export default defineConfig({
  engine: { maxEntities: 1000, targetFPS: 60, loop: 'external' },
  plugins: [
    new Physics3D({ gravity: { x:0, y:-15, z:0 } }),
    new InputPlugin(),
    new AudioPlugin(),
    new KartPlugin({ defaultInput: false }),
  ],
  mainScene: 'RaceScene',
});

// scenes/RaceScene.ts
export const RaceScene = defineScene('RaceScene', {
  onCreate(api) {
    const kartId = spawnKart(api, { position: { x:0, y:0.5, z:0 }, tags: ['local-player'] });
    for (let i = 1; i < 8; i++) {
      spawnKart(api, { position: gridPosition(i), tags: ['ai-kart', `ai-${i}`] });
    }
    api.hooks.hook('kart:drift-boost', ({ entityId, charge }) => {
      if (api.entity.hasTag(entityId, 'local-player')) {
        api.component.set(entityId, KartController, { maxSpeed: 20 + charge * 10 });
      }
    });
  }
});

// App.tsx
const KartsRenderer = createInstancedSync({ query: [KartState, Transform3D], ... });

function App() {
  return (
    <GwenProvider engine={engine}>
      <Canvas>
        <GwenLoop priority={-1} />
        <KartsRenderer />
        <TrackMesh />
      </Canvas>
    </GwenProvider>
  );
}
```

---

## Drawbacks

- Abstraction : les devs voulant un contrôle fin désactivent les systèmes et réimplémentent
- Tuning des paramètres physique (grip, suspension) non trivial pour les débutants

---

## Questions ouvertes

- Preset `arcade` / `realistic` / `drift-focused` dans `KartController` ?
- `VehicleController` Rapier (RFC-005) remplace ou complète `KartPhysicsSystem` ?
- Respawn dans le kit ou dans le jeu ?
