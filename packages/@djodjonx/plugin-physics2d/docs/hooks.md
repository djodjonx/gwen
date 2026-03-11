# Hooks and Extensions

## Global `physics:collision` hook

The plugin emits `physics:collision` every frame with enriched contacts.

```ts
api.hooks.hook('physics:collision', (contacts) => {
  for (const c of contacts) {
    if (!c.started) continue;
    // c.entityA / c.entityB are already valid EntityIds
  }
});
```

Type:

```ts
interface Physics2DPluginHooks {
  'physics:collision': (contacts: ReadonlyArray<CollisionContact>) => void;
}
```

## Prefab extension `extensions.physics`

Schema:

```ts
interface Physics2DPrefabExtension {
  bodyType: 'fixed' | 'dynamic' | 'kinematic';

  // collider (exactly one mode)
  radius?: number;
  hw?: number;
  hh?: number;

  restitution?: number;
  friction?: number;
  isSensor?: boolean;
  density?: number;

  mass?: number;
  gravityScale?: number;
  linearDamping?: number;
  angularDamping?: number;
  initialVelocity?: { vx: number; vy: number };

  onCollision?: (
    self: EntityId,
    other: EntityId,
    contact: CollisionContact,
    api: EngineAPI,
  ) => void;
}
```

## `onCollision` semantics

- Called for each contact involving the entity.
- `contact.started = true` on contact begin, `false` on contact end.
- Recommendation: explicitly filter on `contact.started` in gameplay logic.
- Recommendation: keep side effects idempotent (legitimate duplicate contacts can occur in a frame).

## Unity mapping

- `onCollision(..., contact.started === true)` ~= `OnCollisionEnter`
- `onCollision(..., contact.started === false)` ~= `OnCollisionExit`

There is no implicit `Stay` callback yet (implement game-side if needed).
