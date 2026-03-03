# Components

Components are pure data containers that describe what entities *are*.

## Defining Components

Use `defineComponent()` to create typed component definitions.

### Two Forms

**Form 1 — direct object** (recommended for most cases):

```typescript
import { defineComponent, Types } from '@gwen/engine-core';

export const Position = defineComponent({
  name: 'position',
  schema: {
    x: Types.f32,
    y: Types.f32
  }
});
```

**Form 2 — factory** (when you need local constants or dynamic setup):

```typescript
export const Position = defineComponent('position', () => ({
  schema: {
    x: Types.f32,
    y: Types.f32
  }
}));
```

Both forms produce identical results. Use Form 2 when the schema depends on a local variable or when you want to group related logic in a closure.

### Full Example

```typescript
export const Velocity = defineComponent({
  name: 'velocity',
  schema: {
    vx: Types.f32,
    vy: Types.f32
  }
});

export const Health = defineComponent({
  name: 'health',
  schema: {
    current: Types.i32,
    max: Types.i32
  }
});
```

## Available Types

GWEN provides several primitive types optimized for WASM:

```typescript
Types.f32      // 32-bit float (most common)
Types.f64      // 64-bit float (double precision)
Types.i32      // 32-bit signed integer
Types.i64      // 64-bit signed integer (bigint in JS)
Types.u32      // 32-bit unsigned integer
Types.u64      // 64-bit unsigned integer (bigint in JS)
Types.bool     // Boolean
Types.string   // String (stored as UTF-8 intern ID)
```

**Best practice:** Use `Types.f32` for positions, velocities, and most numeric data. It's fast and precise enough for games.

## Using Components

### Add to Entity

```typescript
const player = api.createEntity();

api.addComponent(player, Position, { x: 100, y: 200 });
api.addComponent(player, Velocity, { vx: 50, vy: 0 });
api.addComponent(player, Health, { current: 10, max: 10 });
```

### Get from Entity

```typescript
const pos = api.getComponent(player, Position);
console.log(pos.x, pos.y); // 100, 200
```

Always check if component exists:

```typescript
const pos = api.getComponent(player, Position);
if (!pos) return; // Entity might not have Position

console.log(pos.x); // Safe
```

### Update Component

```typescript
const pos = api.getComponent(player, Position);

// Update by adding again with new values
api.addComponent(player, Position, {
  x: pos.x + 10,
  y: pos.y + 5
});
```

### Remove Component

```typescript
api.removeComponent(player, Velocity);
```

### Check if Entity Has Component

```typescript
if (api.hasComponent(player, Health)) {
  console.log('Player can take damage');
}
```

## Real Example: Space Shooter Components

From the playground Space Shooter:

```typescript
export const Position = defineComponent({
  name: 'position',
  schema: { x: Types.f32, y: Types.f32 }
});

export const Velocity = defineComponent({
  name: 'velocity',
  schema: { vx: Types.f32, vy: Types.f32 }
});

export const Tag = defineComponent({
  name: 'tag',
  schema: { type: Types.string }
});

export const Collider = defineComponent({
  name: 'collider',
  schema: { radius: Types.f32 }
});

export const Health = defineComponent({
  name: 'health',
  schema: { hp: Types.i32 }
});

export const ShootTimer = defineComponent({
  name: 'shoot-timer',
  schema: {
    elapsed: Types.f32,
    cooldown: Types.f32
  }
});

export const Score = defineComponent({
  name: 'score',
  schema: {
    value: Types.i32,
    lives: Types.i32
  }
});
```

These 7 components are enough to build a complete Space Shooter game.

## Best Practices

### Keep Components Small

**Good:**
```typescript
export const Position = defineComponent({
  name: 'position',
  schema: { x: Types.f32, y: Types.f32 }
});

export const Rotation = defineComponent({
  name: 'rotation',
  schema: { angle: Types.f32 }
});
```

**Avoid:**
```typescript
export const Transform = defineComponent({
  name: 'transform',
  schema: {
    posX: Types.f32,
    posY: Types.f32,
    posZ: Types.f32,
    rotX: Types.f32,
    rotY: Types.f32,
    rotZ: Types.f32,
    scaleX: Types.f32,
    scaleY: Types.f32,
    scaleZ: Types.f32
  }
});
```

Why? Smaller components = more flexible queries.

### Use Descriptive Names

**Good:**
```typescript
export const ShootTimer = defineComponent({
  name: 'shoot-timer',
  schema: { elapsed: Types.f32, cooldown: Types.f32 }
});
```

**Avoid:**
```typescript
export const Timer = defineComponent({
  name: 't',
  schema: { e: Types.f32, c: Types.f32 }
});
```

### Component Naming Convention

- Component definition: `PascalCase` (e.g., `Position`)
- Component name string: `kebab-case` (e.g., `'position'`)
- Schema fields: `camelCase` (e.g., `maxHealth`)

```typescript
export const MaxHealth = defineComponent({
  name: 'max-health',        // kebab-case
  schema: {
    currentValue: Types.i32, // camelCase
    maximumValue: Types.i32
  }
});
```

## Common Components

### Transform Components

```typescript
export const Position = defineComponent({
  name: 'position',
  schema: { x: Types.f32, y: Types.f32 }
});

export const Rotation = defineComponent({
  name: 'rotation',
  schema: { angle: Types.f32 }
});

export const Scale = defineComponent({
  name: 'scale',
  schema: { x: Types.f32, y: Types.f32 }
});
```

### Physics Components

```typescript
export const Velocity = defineComponent({
  name: 'velocity',
  schema: { vx: Types.f32, vy: Types.f32 }
});

export const Acceleration = defineComponent({
  name: 'acceleration',
  schema: { ax: Types.f32, ay: Types.f32 }
});

export const Collider = defineComponent({
  name: 'collider',
  schema: { radius: Types.f32 }
});
```

### Gameplay Components

```typescript
export const Health = defineComponent({
  name: 'health',
  schema: { current: Types.i32, max: Types.i32 }
});

export const Score = defineComponent({
  name: 'score',
  schema: { value: Types.i32 }
});

export const Timer = defineComponent({
  name: 'timer',
  schema: { elapsed: Types.f32, duration: Types.f32 }
});
```

### Tag Components

```typescript
export const Tag = defineComponent({
  name: 'tag',
  schema: { type: Types.string }
});

// Usage:
api.addComponent(id, Tag, { type: 'player' });
api.addComponent(id, Tag, { type: 'enemy' });
api.addComponent(id, Tag, { type: 'bullet' });
```

## Querying by Components

Systems query entities by component names:

```typescript
// All entities with position and velocity
const moving = api.query(['position', 'velocity']);

// Filter by tag
for (const id of moving) {
  const tag = api.getComponent(id, Tag);
  if (tag?.type === 'player') {
    // Player-specific logic
  }
}
```

## Next Steps

- [Scenes](/core/scenes) - Organize game flow
- [Systems](/core/systems) - Write gameplay logic
- [Prefabs](/core/prefabs) - Reuse entity creation

