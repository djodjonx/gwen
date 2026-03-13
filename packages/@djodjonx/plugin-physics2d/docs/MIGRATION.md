# Migration Guide

## Sprint 1 status

Sprint 1 keeps compatibility active while introducing the vNext contract:

- `Physics2DConfig` now exposes `qualityPreset`, `eventMode` and `compat` flags.
- `extensions.physics.colliders[]` is the recommended schema.
- legacy mono-collider props are still supported through the TS adapter.
- `getCollisionEventsBatch()` is now the primary collision-event API.

## Before / after

### Legacy mono-collider prefab

```ts
extensions: {
  physics: {
    bodyType: 'dynamic',
    hw: 10,
    hh: 14,
    friction: 0.2,
  },
}
```

### vNext prefab

```ts
extensions: {
  physics: {
    bodyType: 'dynamic',
    colliders: [{ shape: 'box', hw: 10, hh: 14, friction: 0.2 }],
  },
}
```

### Legacy collision reads

```ts
const events = physics.getCollisionEvents();
```

### vNext collision reads

```ts
const events = physics.getCollisionEventsBatch();
```

## Deprecation inventory

| Symbol | Language | Kind | Deprecated since | Planned removal | Replacement | Status | Tracking issue | Tests |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `Physics2DPrefabExtension.radius` | TS | property | `0.4.0` | `1.0.0` | `colliders[0].radius` | active | `PHYS-S1-002` | `compat + new path` |
| `Physics2DPrefabExtension.hw` | TS | property | `0.4.0` | `1.0.0` | `colliders[0].hw` | active | `PHYS-S1-002` | `compat + new path` |
| `Physics2DPrefabExtension.hh` | TS | property | `0.4.0` | `1.0.0` | `colliders[0].hh` | active | `PHYS-S1-002` | `compat + new path` |
| `Physics2DPrefabExtension.restitution` | TS | property | `0.4.0` | `1.0.0` | `colliders[].restitution` | active | `PHYS-S1-002` | `compat + new path` |
| `Physics2DPrefabExtension.friction` | TS | property | `0.4.0` | `1.0.0` | `colliders[].friction` | active | `PHYS-S1-002` | `compat + new path` |
| `Physics2DPrefabExtension.isSensor` | TS | property | `0.4.0` | `1.0.0` | `colliders[].isSensor` | active | `PHYS-S1-002` | `compat + new path` |
| `Physics2DPrefabExtension.density` | TS | property | `0.4.0` | `1.0.0` | `colliders[].density` | active | `PHYS-S1-002` | `compat + new path` |
| `parseCollisionEvents` | TS | function | `0.4.0` | `1.0.0` | `readCollisionEventsFromBuffer` | active | `PHYS-S1-003` | `compat + new path` |
| `Physics2DAPI.getCollisionEvents` | TS | method | `0.4.0` | `1.0.0` | `getCollisionEventsBatch` | active | `PHYS-S1-007` | `compat + new path` |

## Checklist per PR touching legacy APIs

- [ ] code symbol tagged with `@deprecated`
- [ ] this inventory updated
- [ ] compat path tested
- [ ] replacement path tested
- [ ] docs examples updated

