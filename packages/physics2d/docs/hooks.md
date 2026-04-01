# Hooks and Extensions

## Policy

- `getCollisionEventsBatch()` is the first-class, pull-first API.
- Hooks are convenience-only and opt-in.
- Internal hot paths must not depend on per-contact hooks.
- `eventMode: 'hybrid'` enables automatic hook dispatch during `onUpdate`.

## Global `physics:collision` hook

The plugin emits `physics:collision` with enriched contacts when one of these is true:

- plugin config uses `eventMode: 'hybrid'`, or
- a prefab registers `extensions.physics.onCollision`.

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

## Recommended usage: pull-first

```ts
onUpdate(api) {
  const physics = api.services.get('physics');
  const batch = physics.getCollisionEventsBatch();
  for (const event of batch.events) {
    // hot-path gameplay logic here
  }
}
```

Why this is preferred:

- you control when the batch is read,
- the ring buffer is consumed through typed views,
- repeated reads in the same frame reuse the same decoded batch,
- it avoids building gameplay logic around implicit hook timing.

## Prefab extension `extensions.physics`

Recommended schema:

```ts
interface Physics2DPrefabExtension {
  bodyType?: 'fixed' | 'dynamic' | 'kinematic';
  colliders?: PhysicsColliderDef[];
  onCollision?: (
    self: EntityId,
    other: EntityId,
    contact: CollisionContact,
    api: EngineAPI,
  ) => void;
}
```

Legacy mono-collider props (`radius`, `hw`, `hh`, `friction`, `restitution`, `isSensor`, `density`) are still supported through the TS compatibility adapter and emit a dev deprecation warning.

## `onCollision` semantics

- Called for each contact involving the entity.
- `contact.started = true` on contact begin, `false` on contact end.
- Recommendation: explicitly filter on `contact.started` in gameplay logic.
- Recommendation: keep side effects idempotent.

## Anti-patterns

Avoid these in hot code:

- relying only on hooks for high-frequency collision processing,
- reading the batch in multiple systems and mutating shared arrays,
- adding new legacy top-level collider props instead of `colliders[]`,
- reintroducing JSON payloads on the event path.

## Unity mapping

- `onCollision(..., contact.started === true)` ~= `OnCollisionEnter`
- `onCollision(..., contact.started === false)` ~= `OnCollisionExit`

There is no implicit `Stay` callback yet.
