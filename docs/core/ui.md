# UI Rendering

GWEN gives you **complete freedom over rendering**.

The UI system is **renderer-agnostic** — you choose how to draw based on your game's needs.

## Renderer Flexibility

### Use Canvas2D

Fast, immediate-mode drawing with full 2D canvas API:

```typescript
export const PlayerUI = defineUI({
  name: 'PlayerUI',
  render(api, entityId) {
    const { ctx } = api.services.get('renderer');
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(x, y, 32, 32);
  }
});
```

### Use HTML/CSS

Declarative UI for menus, HUD, overlays:

```typescript
// In gwen.config.ts
new HtmlUIPlugin()

// In your component
export const MenuUI = defineUI({
  name: 'MenuUI',
  onMount(api) {
    api.services.get('htmlUI').mount('menu', '<button>Start</button>');
  }
});
```

### Use WebGL (Three.js, Babylon.js, etc.)

Integrate any WebGL library via services:

```typescript
export const Model3DUI = defineUI({
  name: 'Model3DUI',
  render(api, entityId) {
    const scene = api.services.get('three-scene');
    const pos = api.getComponent(entityId, Position);

    // Update Three.js objects
    scene.children[entityId].position.set(pos.x, pos.y, 0);
  }
});
```

### Mix Multiple Renderers

Use Canvas2D for gameplay, HTML for UI menus:

```typescript
export const GameScene = defineScene('Game', () => ({
  ui: [
    PlayerUI,        // Canvas2D sprites
    EnemyUI,         // Canvas2D sprites
    HUDMenuUI        // HTML/CSS menu
  ],
  // ...
}));
```

## Why This Matters

GWEN doesn't lock you into a single rendering paradigm:
- **No forced abstractions** — you control the rendering layer
- **Pick the right tool** — Canvas for perf, HTML for UI, WebGL for advanced effects
- **Hybrid rendering** — mix and match renderers in the same scene
- **Easy integration** — bring your favorite graphics library

## Defining UI Components

Use `defineUI()` to create custom rendering. Two forms are supported.

### Typed services — automatic after `gwen prepare`

After running `gwen prepare`, `api.services.get()` is **fully typed automatically** — no generic, no annotation needed:

```typescript
// ✅ After gwen prepare — api is fully typed, no annotation required
export const PlayerUI = defineUI({
  name: 'PlayerUI',
  render(api, id) {
    const { ctx } = api.services.get('renderer'); // → Canvas2DRenderer ✅
    ctx.fillRect(...);
  }
});
```

If you prefer to be explicit (e.g. in a shared library), you can still annotate:

```typescript
// ✅ Explicit annotation — optional, for clarity
export const PlayerUI = defineUI<GwenDefaultServices>({
  name: 'PlayerUI',
  render(api, id) {
    const { ctx } = api.services.get('renderer'); // → Canvas2DRenderer ✅
  }
});
```

`GwenDefaultServices` is the global interface enriched by `gwen prepare` with your project's actual services — no import needed.

---

### Form 1 — direct object (stateless rendering)

```typescript
import { defineUI } from '@gwen/engine-core';
import { Position } from '../components';

export const PlayerUI = defineUI({
  name: 'PlayerUI',

  render(api, entityId) {
    const pos = api.getComponent(entityId, Position);
    if (!pos) return;

    const { ctx } = api.services.get('renderer'); // ✅ typed automatically
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(pos.x - 16, pos.y - 16, 32, 32);
  }
});
```

### Form 2 — factory (local state per UI in closure)

Use when you need per-entity state (animation timers, cached DOM elements, etc.):

```typescript
export const EnemyUI = defineUI('EnemyUI', () => {
  // State captured in closure — one instance per registered UI
  let flashTimer = 0;

  return {
    onMount(api, entityId) {
      flashTimer = 0;
    },
    render(api, entityId) {
      flashTimer += api.deltaTime;
      const pos = api.getComponent(entityId, Position);
      if (!pos) return;

      const { ctx } = api.services.get('renderer'); // ✅ typed automatically
      // Flash effect using local state
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(flashTimer * 10);
      ctx.fillStyle = '#ff4444';
      ctx.fillRect(pos.x - 16, pos.y - 16, 32, 32);
      ctx.globalAlpha = 1;
    },
    onUnmount(api, entityId) { }
  };
});
```

Both forms produce a `UIDefinition` object that you register in a scene's `ui` array.

## UI Lifecycle

UI components have a single method:

```typescript
render(api: EngineAPI, entityId: EntityId): void
```

- Called every frame for each entity with a matching `UIComponent`
- `entityId` is the entity to render
- Access canvas via `api.services.get('renderer').ctx`

## Registering UI

UI components are registered in scenes:

```typescript
export const GameScene = defineScene('Game', () => ({
  ui: [PlayerUI, EnemyUI, BulletUI],
  systems: [],

  onEnter(api) {
    // Create entity and link UI
    const player = api.createEntity();
    api.addComponent(player, Position, { x: 100, y: 100 });
    api.addComponent(player, UIComponent, { uiName: 'PlayerUI' });
  },
  onExit(api) {},
}));
```

## Linking Entities to UI

Use the `UIComponent` to link entities to UI renderers:

```typescript
import { UIComponent } from '@gwen/engine-core';

const player = api.createEntity();
api.addComponent(player, Position, { x: 100, y: 100 });
api.addComponent(player, UIComponent, { uiName: 'PlayerUI' }); // Links to PlayerUI
```

## Real Example: Player Rendering

From the playground Space Shooter:

```typescript
import { defineUI } from '@gwen/engine-core';
import { Position, Velocity } from '../components';

export const PlayerUI = defineUI({
  name: 'PlayerUI',
    if (!pos) return;

    const { ctx } = api.services.get('renderer');
    const t = Date.now() / 1000;

    ctx.save();
    ctx.translate(pos.x, pos.y);

    // ── Thruster flame ──
    const speed = Math.abs(vel?.vy ?? 0) + Math.abs(vel?.vx ?? 0);
    const flameH = 8 + Math.sin(t * 18) * 4 + speed * 0.04;
    const flameW = 5 + Math.sin(t * 22 + 1) * 1.5;

    // Flame glow
    const grad = ctx.createRadialGradient(0, 14, 0, 0, 14, flameH + 4);
    grad.addColorStop(0, 'rgba(255,180,0,0.7)');
    grad.addColorStop(0.5, 'rgba(255,80,0,0.3)');
    grad.addColorStop(1, 'rgba(255,40,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 14 + flameH / 2, flameW + 3, flameH + 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Flame core
    ctx.fillStyle = 'rgba(255,160,40,0.85)';
    ctx.shadowColor = '#ff8800';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(-flameW, 12);
    ctx.lineTo(0, 12 + flameH);
    ctx.lineTo(flameW, 12);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    // ── Ship body ──
    ctx.fillStyle = '#4fffb0';
    ctx.shadowColor = '#4fffb0';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(-13, 14);
    ctx.lineTo(0, 8);
    ctx.lineTo(13, 14);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
});
```

## Canvas2D Basics

### Getting the Context

```typescript
const { ctx } = api.services.get('renderer');
```

### Drawing Shapes

```typescript
// Rectangle
ctx.fillStyle = '#ff0000';
ctx.fillRect(x, y, width, height);

// Circle
ctx.beginPath();
ctx.arc(x, y, radius, 0, Math.PI * 2);
ctx.fillStyle = '#00ff00';
ctx.fill();

// Line
ctx.beginPath();
ctx.moveTo(x1, y1);
ctx.lineTo(x2, y2);
ctx.strokeStyle = '#0000ff';
ctx.lineWidth = 2;
ctx.stroke();
```

### Transform Stack

Always use `save()`/`restore()` for transforms:

```typescript
render(api, id) {
  const { ctx } = api.services.get('renderer');
  const pos = api.getComponent(id, Position);

  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(angle);

  // Draw at (0, 0) - will be transformed
  ctx.fillRect(-16, -16, 32, 32);

  ctx.restore();
}
```

## UI Patterns

### Animated Sprite

```typescript
export const EnemyUI = defineUI({
  name: 'EnemyUI',

  render(api, id) {
    const pos = api.getComponent(id, Position);
    if (!pos) return;

    const { ctx } = api.services.get('renderer');
    const t = Date.now() / 1000;

    // Pulsing effect
    const scale = 1 + Math.sin(t * 4) * 0.1;

    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.scale(scale, scale);

    // Draw sprite
    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
});
```

### Health Bar

```typescript
export const HealthBarUI = defineUI({
  name: 'HealthBarUI',

  render(api, id) {
    const pos = api.getComponent(id, Position);
    const health = api.getComponent(id, Health);
    if (!pos || !health) return;

    const { ctx } = api.services.get('renderer');

    const barWidth = 40;
    const barHeight = 4;
    const ratio = health.current / health.max;

    // Background
    ctx.fillStyle = '#333333';
    ctx.fillRect(pos.x - barWidth / 2, pos.y - 30, barWidth, barHeight);

    // Health
    ctx.fillStyle = ratio > 0.5 ? '#00ff00' : '#ff0000';
    ctx.fillRect(pos.x - barWidth / 2, pos.y - 30, barWidth * ratio, barHeight);
  }
});
```

### Trail Effect

```typescript
export const TrailUI = defineUI({
  name: 'TrailUI',

  render(api, id) {
    const pos = api.getComponent(id, Position);
    const trail = api.getComponent(id, Trail);
    if (!pos || !trail) return;

    const { ctx } = api.services.get('renderer');

    // Draw trail points
    ctx.strokeStyle = 'rgba(0,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < trail.points.length - 1; i++) {
      const p1 = trail.points[i];
      const p2 = trail.points[i + 1];

      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
    }

    ctx.stroke();
  }
});
```

### Particle System

```typescript
export const ParticleUI = defineUI({
  name: 'ParticleUI',

  render(api, id) {
    const pos = api.getComponent(id, Position);
    const timer = api.getComponent(id, Timer);
    if (!pos || !timer) return;

    const { ctx } = api.services.get('renderer');

    // Fade out over time
    const alpha = 1 - (timer.elapsed / timer.duration);
    const size = 4 * alpha;

    ctx.fillStyle = `rgba(255,255,0,${alpha})`;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
    ctx.fill();
  }
});
```

## HTML/CSS UI Alternative

For menus and HUD, you can use HTML instead of Canvas:

```typescript
import { HtmlUIPlugin } from '@gwen/plugin-html-ui';

export default defineConfig({
  tsPlugins: [
    new HtmlUIPlugin()
  ]
});
```

Then create HTML UI components:

```html
<!-- src/ui/score.html -->
<div class="score-display">
  Score: <span id="score-value">0</span>
</div>
```

Update from systems:

```typescript
import { defineSystem } from '@gwen/engine-core';

export const ScoreSystem = defineSystem({
  name: 'ScoreSystem',

  onUpdate(api, dt) {
    const scoreEntity = api.query(['score'])[0];
    const score = api.getComponent(scoreEntity, Score);

    document.getElementById('score-value').textContent = score.value.toString();
  }
});
```

## Performance Tips

### 1. Check Component Existence

```typescript
const pos = api.getComponent(id, Position);
if (!pos) return; // Skip rendering
```

### 2. Batch Draw Calls

```typescript
// ✅ Good - single path
ctx.beginPath();
for (const id of entities) {
  const pos = api.getComponent(id, Position);
  ctx.rect(pos.x, pos.y, 10, 10);
}
ctx.fill();

// ❌ Bad - multiple paths
for (const id of entities) {
  ctx.beginPath();
  ctx.rect(pos.x, pos.y, 10, 10);
  ctx.fill();
}
```

### 3. Use Transform Stack

```typescript
ctx.save();
ctx.translate(x, y);
ctx.rotate(angle);
// draw at (0,0)
ctx.restore();
```

### 4. Cache Gradients

```typescript
// Cache outside render
const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 50);
grad.addColorStop(0, '#ff0000');
grad.addColorStop(1, '#000000');

// Use in render
ctx.fillStyle = grad;
```

## Render Order

UI components render in the order they're registered:

```typescript
export const GameScene = defineScene('Game', () => ({
  ui: [
    BackgroundUI,  // First (bottom layer)
    BulletUI,
    EnemyUI,
    PlayerUI,
    ScoreUI        // Last (top layer)
  ]
}));
```

## Best Practices

### 1. Always Check Components

```typescript
const pos = api.getComponent(id, Position);
if (!pos) return;
```

### 2. Use save/restore

```typescript
ctx.save();
// transforms
ctx.restore();
```

### 3. Separate Logic from Rendering

Systems update components, UI just reads and draws.

### 4. Use Descriptive Names

```typescript
// ✅ Good
export const PlayerUI = defineUI({ name: 'PlayerUI', ... });

// ❌ Avoid
export const UI1 = defineUI({ name: 'U1', ... });
```

## Next Steps

- [Configuration](/core/configuration) - Setup renderer
- [Examples](/examples/space-shooter) - See UI in action
- [Plugins](/plugins/official) - Explore renderers

