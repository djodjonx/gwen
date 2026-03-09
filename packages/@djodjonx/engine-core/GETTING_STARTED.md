# 📖 GWEN Framework - Getting Started Guide

**Complete guide to build games with GWEN**

---

## 🎯 What is GWEN?

GWEN is a **modern game engine for the web** that combines:

- **Rust/WASM Core** - Fast game logic (entities, components, physics, AI)
- **TypeScript Layer** - Web integration (rendering, input, UI, assets)
- **Plugin System** - Extend with your own systems

### Architecture

```
Your Game (TypeScript)
    ↓
GWEN Framework (@djodjonx/gwen-engine-core)
    ├─ Engine API
    ├─ Renderer
    ├─ Input System
    └─ Asset Manager
    ↓
GWEN Core (Rust/WASM)
    ├─ Entity Manager
    ├─ Component Storage
    ├─ Query System
    ├─ Transform System
    └─ Game Loop
```

---

## 🚀 Installation

### Step 1: Install Dependencies

```bash
npm install @djodjonx/gwen-engine-core
```

### Step 2: Create HTML Canvas

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>GWEN Game</title>
    <style>
      body {
        margin: 0;
        padding: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        background: #222;
      }
      canvas {
        border: 2px solid #fff;
      }
    </style>
  </head>
  <body>
    <canvas id="game-canvas" width="1280" height="720"></canvas>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

### Step 3: Create Main Game File

**src/main.ts:**

```typescript
import { Engine, defineConfig } from '@djodjonx/gwen-engine-core';

// Configure engine
const config = defineConfig({
  canvas: 'game-canvas',
  width: 1280,
  height: 720,
  maxEntities: 5000,
  targetFPS: 60,
  debug: true,
  enableStats: true,
});

// Create engine
const engine = new Engine(config);

// Initialize game
engine.on('start', () => {
  console.log('Game started!');
  initGame();
});

// Update loop
engine.on('update', ({ deltaTime, frameCount }) => {
  updateGame(deltaTime);

  // Display stats
  if (frameCount % 60 === 0) {
    const stats = engine.getStats();
    console.log(`FPS: ${stats.fps}`);
  }
});

// Render loop
engine.on('render', () => {
  renderGame();
});

// Start the engine
engine.start();

// Game functions
function initGame() {
  // Create player
  // Create enemies
  // Set up input
}

function updateGame(dt: number) {
  // Update entities
  // Check collisions
  // Update AI
}

function renderGame() {
  // Render entities
  // Draw UI
}
```

---

## 🎮 First Game: Simple Bouncing Ball

Create a simple game with a bouncing ball:

**src/games/bouncing-ball.ts:**

```typescript
import { Engine, defineConfig } from '@djodjonx/gwen-engine-core';

interface Ball {
  entityId: number;
  vx: number;
  vy: number;
}

const engine = new Engine(
  defineConfig({
    canvas: 'game-canvas',
    width: 800,
    height: 600,
  }),
);

let ball: Ball;

engine.on('start', () => {
  // Create ball entity
  const ballEntity = engine.createEntity();

  // Add transform component
  engine.addComponent(ballEntity, 'transform', {
    x: 400,
    y: 300,
    rotation: 0,
  });

  // Add sprite component
  engine.addComponent(ballEntity, 'sprite', {
    width: 20,
    height: 20,
    color: { r: 1, g: 0, b: 0, a: 1 },
  });

  // Create ball object
  ball = {
    entityId: ballEntity,
    vx: 200, // pixels per second
    vy: 150,
  };
});

engine.on('update', ({ deltaTime }) => {
  const transform = engine.getComponent(ball.entityId, 'transform');

  // Update position
  transform.x += ball.vx * deltaTime;
  transform.y += ball.vy * deltaTime;

  // Bounce off walls
  if (transform.x <= 0 || transform.x >= 800) {
    ball.vx *= -1;
  }
  if (transform.y <= 0 || transform.y >= 600) {
    ball.vy *= -1;
  }

  // Clamp to bounds
  transform.x = Math.max(0, Math.min(800, transform.x));
  transform.y = Math.max(0, Math.min(600, transform.y));

  // Update component
  engine.addComponent(ball.entityId, 'transform', transform);
});

engine.start();
```

---

## 🕹️ Game Template: Player Movement

Template for a game with player movement:

**src/games/player-movement.ts:**

```typescript
import { Engine, defineConfig, useEngine } from '@djodjonx/gwen-engine-core';

// Configuration
const config = defineConfig({
  canvas: 'game-canvas',
  width: 1280,
  height: 720,
  maxEntities: 5000,
});

const engine = new Engine(config);

// Game state
const gameState = {
  playerId: 0,
  keys: new Set<string>(),
  speed: 300, // pixels per second
};

// Initialize
engine.on('start', () => {
  // Create player
  const player = engine.createEntity();

  engine.addComponent(player, 'transform', {
    x: 640,
    y: 360,
    rotation: 0,
  });

  engine.addComponent(player, 'sprite', {
    width: 32,
    height: 32,
    color: { r: 0, g: 0.5, b: 1, a: 1 },
  });

  gameState.playerId = player;

  // Setup input
  setupInput();
});

// Update
engine.on('update', ({ deltaTime }) => {
  // Get player transform
  const transform = engine.getComponent(gameState.playerId, 'transform');

  // Handle input
  if (gameState.keys.has('ArrowUp') || gameState.keys.has('w')) {
    transform.y -= gameState.speed * deltaTime;
  }
  if (gameState.keys.has('ArrowDown') || gameState.keys.has('s')) {
    transform.y += gameState.speed * deltaTime;
  }
  if (gameState.keys.has('ArrowLeft') || gameState.keys.has('a')) {
    transform.x -= gameState.speed * deltaTime;
  }
  if (gameState.keys.has('ArrowRight') || gameState.keys.has('d')) {
    transform.x += gameState.speed * deltaTime;
  }

  // Clamp to screen
  transform.x = Math.max(16, Math.min(1264, transform.x));
  transform.y = Math.max(16, Math.min(704, transform.y));

  // Update component
  engine.addComponent(gameState.playerId, 'transform', transform);
});

// Input handling
function setupInput() {
  document.addEventListener('keydown', (e) => {
    gameState.keys.add(e.key);
  });

  document.addEventListener('keyup', (e) => {
    gameState.keys.delete(e.key);
  });
}

engine.start();
```

---

## 🔌 Using Plugins

### Example: Physics Plugin

```typescript
import { Engine, defineConfig } from '@djodjonx/gwen-engine-core';
import { PhysicsPlugin } from '@djodjonx/gwen-physics';

const engine = new Engine(
  defineConfig({
    canvas: 'game-canvas',
    plugins: [PhysicsPlugin],
  }),
);

engine.on('start', () => {
  const box = engine.createEntity();

  // Add physics component
  engine.addComponent(box, 'rigidbody', {
    mass: 1,
    velocity: { x: 0, y: 100 },
    gravity: true,
  });
});
```

### Example: Input Plugin

```typescript
import { Engine } from '@djodjonx/gwen-engine-core';
import { InputPlugin } from '@djodjonx/gwen-input';

const engine = new Engine();
engine.loadPlugin('input', InputPlugin);

engine.on('update', () => {
  const input = engine.getPlugin('input');

  if (input.isKeyPressed('Space')) {
    console.log('Space pressed!');
  }

  if (input.isMouseDown()) {
    const { x, y } = input.getMousePosition();
    console.log(`Mouse at ${x}, ${y}`);
  }
});
```

---

## 📊 Understanding Entities & Components

### Entity

An entity is a **game object** with an ID:

```typescript
const enemy = engine.createEntity(); // Returns entity ID
console.log(enemy); // e.g., 12345
```

### Component

A component is **data attached to an entity**:

```typescript
// Transform component (position, rotation, scale)
engine.addComponent(enemy, 'transform', {
  x: 100,
  y: 200,
  rotation: 0,
});

// Sprite component (graphics)
engine.addComponent(enemy, 'sprite', {
  width: 32,
  height: 32,
  color: { r: 1, g: 0, b: 0, a: 1 },
});

// Get component data
const transform = engine.getComponent(enemy, 'transform');
```

### Query

**Query** finds all entities with specific components:

```typescript
// Find all entities with transform AND sprite
const visible = engine.query(['transform', 'sprite']);

visible.forEach((entityId) => {
  const transform = engine.getComponent(entityId, 'transform');
  console.log(`Entity ${entityId} at ${transform.x}, ${transform.y}`);
});
```

---

## 🎯 Best Practices

### ✅ DO

- Use queries for repeated operations
- Batch component updates
- Remove entities when no longer needed
- Use type-safe configuration
- Profile with FPS counter

### ❌ DON'T

- Create/destroy entities every frame
- Repeatedly query same components
- Add duplicate components
- Ignore performance warnings
- Store state outside components

---

## 🐛 Debugging

### Enable Debug Mode

```typescript
const engine = new Engine({
  debug: true,
  enableStats: true,
});
```

### Check Statistics

```typescript
const stats = engine.getStats();
console.log(`FPS: ${stats.fps}`);
console.log(`Entities: ${stats.entityCount}`);
console.log(`Frame: ${stats.frameCount}`);
console.log(`Delta: ${stats.deltaTime.toFixed(4)}`);
```

### Log Events

```typescript
engine.on('entityCreated', (entityId) => {
  console.log(`Created entity: ${entityId}`);
});

engine.on('componentAdded', ({ entityId, componentType }) => {
  console.log(`Added ${componentType} to entity ${entityId}`);
});
```

---

## 📚 Next Steps

1. **[API Documentation](./API.md)** - Complete API reference
2. **[Plugin Development](./PLUGINS.md)** - Build your own plugins
3. **[Examples Repository](./examples/)** - Full game examples
4. **[Performance Guide](./PERFORMANCE.md)** - Optimization tips

---

## 💡 Common Questions

**Q: Where do I put my game logic?**
A: In the `update` and `render` event handlers.

**Q: How do I handle input?**
A: Use the InputPlugin or listen to DOM events and call engine methods.

**Q: Can I use TypeScript?**
A: Yes! Full TypeScript support with complete types.

**Q: How do I add physics?**
A: Load the PhysicsPlugin and add rigidbody components.

**Q: How do I render sprites?**
A: Add sprite components and the renderer displays them.

---

**Happy game development with GWEN! 🎮**
