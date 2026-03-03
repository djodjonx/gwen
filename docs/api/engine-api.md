# Engine API

Runtime API available inside systems, scenes, UI, and prefabs.

## Entity Management

```typescript
// Create
const id = api.createEntity();

// Destroy
const removed = api.destroyEntity(id); // boolean
```

## Component Management

```typescript
api.addComponent(id, Position, { x: 100, y: 200 });

const pos = api.getComponent(id, Position);

api.removeComponent(id, Position);

if (api.hasComponent(id, Position)) {
  // ...
}
```

## Queries

```typescript
// By names
const entities = api.query(['position', 'velocity']);

// By component definitions (also supported)
const entities2 = api.query([Position, Velocity]);
```

## Prefabs

```typescript
api.prefabs.register(PlayerPrefab);
const playerId = api.prefabs.instantiate('Player', 100, 200);
```

## Services

```typescript
const keyboard = api.services.get('keyboard');
```

Service registration is typically done inside plugins (`onInit`).

## Scene Navigation

```typescript
// Scene manager may be absent in some contexts, so use optional chaining
api.scene?.load('Game');

const current = api.scene?.current;
```

## Frame State

```typescript
const dt = api.deltaTime;
const frame = api.frameCount;
```

## Not in EngineAPI

These are **not** part of `EngineAPI`:
- `api.entityExists(...)`
- `api.emit(...)`
- `api.on(...)`

Use plugin/service patterns for custom event buses when needed.

## Next Steps

- [Helpers](/api/helpers)
- [Types](/api/types)
