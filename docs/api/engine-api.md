# Engine API

Runtime API available in systems, scenes, and prefabs.

## Entity Management

```typescript
// Create
const id = api.createEntity();

// Destroy
api.destroyEntity(id);

// Check existence
if (api.entityExists(id)) { }
```

## Component Management

```typescript
// Add/Update
api.addComponent(id, Position, { x: 100, y: 200 });

// Get
const pos = api.getComponent(id, Position);

// Remove
api.removeComponent(id, Position);

// Check
if (api.hasComponent(id, Position)) { }
```

## Queries

```typescript
// Query by component names
const entities = api.query(['position', 'velocity']);

for (const id of entities) {
  const pos = api.getComponent(id, Position);
  const vel = api.getComponent(id, Velocity);
  // ...
}
```

## Prefabs

```typescript
// Register
api.prefabs.register(PlayerPrefab);

// Instantiate
const id = api.prefabs.instantiate('Player', x, y);
```

## Services

```typescript
// Get service
const keyboard = api.services.get('keyboard');

// Register service (in plugins)
api.services.register('myService', { value: 42 });
```

## Scene Management

```typescript
// Load scene
api.scene.load(GameScene);
```

## Events

```typescript
// Emit
api.emit('collision', { idA, idB });

// Listen (in plugins)
api.on('collision', (data) => {
  console.log(data);
});
```

## Next Steps

- [Helpers](/api/helpers) - Define functions
- [Types](/api/types) - Type definitions

