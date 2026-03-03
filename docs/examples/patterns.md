# Common Patterns

Reusable techniques for building games with GWEN.

## Entity Management

### Destroy Offscreen Entities

```typescript
import { defineSystem } from '@gwen/engine-core';

export const CleanupSystem = defineSystem({
  name: 'CleanupSystem',
  onUpdate(api, dt) {
    const entities = api.query(['position']);
    for (const id of entities) {
      const pos = api.getComponent(id, Position);
      if (pos.y < -50 || pos.y > 700) {
        api.destroyEntity(id);
      }
    }
  }
});
```

### Object Pooling

```typescript
const pool: number[] = [];

function getEntity(api): number {
  return pool.pop() || api.createEntity();
}

function releaseEntity(api, id: number) {
  // Remove all components
  api.removeComponent(id, Position);
  api.removeComponent(id, Velocity);
  pool.push(id);
}
```

## Collision Detection

### Circle-Circle

```typescript
function checkCollision(posA, colA, posB, colB): boolean {
  const dx = posA.x - posB.x;
  const dy = posA.y - posB.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return dist < colA.radius + colB.radius;
}
```

### Spatial Partitioning

```typescript
const grid = new Map<string, number[]>();

function getGridKey(x: number, y: number): string {
  const cellSize = 100;
  const cx = Math.floor(x / cellSize);
  const cy = Math.floor(y / cellSize);
  return `${cx},${cy}`;
}
```

## State Management

### Game State Service

```typescript
api.services.register('gameState', {
  score: 0,
  level: 1,
  paused: false
});

// Access anywhere
const state = api.services.get('gameState');
state.score += 10;
```

## Input Handling

### Multi-Key Input

```typescript
const keyboard = api.services.get('keyboard');

let vx = 0, vy = 0;
if (keyboard.isPressed('ArrowLeft')) vx = -SPEED;
if (keyboard.isPressed('ArrowRight')) vx = SPEED;
if (keyboard.isPressed('ArrowUp')) vy = -SPEED;
if (keyboard.isPressed('ArrowDown')) vy = SPEED;
```

### Button Press (Once)

```typescript
if (keyboard.isJustPressed('Space')) {
  // Fires once per press
}
```

## Timer Patterns

### Cooldown

```typescript
const timer = api.getComponent(id, ShootTimer);
const elapsed = timer.elapsed + dt;

if (elapsed >= timer.cooldown) {
  // Fire!
  api.addComponent(id, ShootTimer, { ...timer, elapsed: 0 });
} else {
  api.addComponent(id, ShootTimer, { ...timer, elapsed });
}
```

### Delayed Action

```typescript
const timer = api.getComponent(id, Timer);
const elapsed = timer.elapsed + dt;

if (elapsed >= timer.duration) {
  // Action
  api.removeComponent(id, Timer);
} else {
  api.addComponent(id, Timer, { ...timer, elapsed });
}
```

## Animation

### Sprite Animation

```typescript
const frame = Math.floor((Date.now() / 100) % 4);
// frame cycles: 0, 1, 2, 3, 0, 1, 2, 3...
```

### Easing

```typescript
function easeOutQuad(t: number): number {
  return t * (2 - t);
}

const t = timer.elapsed / timer.duration;
const ease = easeOutQuad(t);
const y = startY + (endY - startY) * ease;
```

## Scene Transitions

### Fade Transition

```typescript
export const FadeSystem = defineSystem({
  name: 'FadeSystem',
  onUpdate(api, dt) {
    const fade = api.services.get('fade');

    if (fade.active) {
      fade.alpha += dt * fade.speed;

      if (fade.alpha >= 1) {
        api.scene?.load(fade.nextScene);
      }
    }
  }
});
```

## Component Patterns

### Tag-Based Filtering

```typescript
const tag = api.getComponent(id, Tag);
if (tag?.type === 'player') {
  // Player-specific logic
}
```

### Optional Components

```typescript
const vel = api.getComponent(id, Velocity);
const speed = vel ? Math.sqrt(vel.vx ** 2 + vel.vy ** 2) : 0;
```

## Next Steps

- [Space Shooter](/examples/space-shooter) - Complete example
- [API Reference](/api/helpers) - Full API docs

