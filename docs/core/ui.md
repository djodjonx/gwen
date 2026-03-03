# UI Rendering

GWEN gives you full control over how entities are drawn using `defineUI()` with Canvas2D.

## Defining UI Components

Use `defineUI()` to create custom rendering:

```typescript
import { defineUI } from '@gwen/engine-core';
import { Position } from '../components';

export const PlayerUI = defineUI({
  name: 'PlayerUI',

  render(api, entityId) {
    // Get entity data
    const pos = api.getComponent(entityId, Position);
    if (!pos) return;

    // Get canvas context
    const { ctx } = api.services.get('renderer');

    // Draw
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(pos.x - 16, pos.y - 16, 32, 32);
  }
});
```

## UI Lifecycle

UI components have a single method:

```typescript
render(api: EngineAPI, entityId: number): void
```

- Called every frame for each entity with a matching `UIComponent`
- `entityId` is the entity to render
- Access canvas via `api.services.get('renderer').ctx`

## Registering UI

UI components are registered in scenes:

```typescript
export const GameScene = defineScene('Game', () => ({
  ui: [PlayerUI, EnemyUI, BulletUI],
  plugins: [],

  onEnter(api) {
    // Create entity and link UI
    const player = api.createEntity();
    api.addComponent(player, Position, { x: 100, y: 100 });
    api.addComponent(player, UIComponent, { uiName: 'PlayerUI' });
  }
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

export const PlayerUI = defineUI<GwenServices>({
  name: 'PlayerUI',

  render(api, id) {
    const pos = api.getComponent(id, Position);
    const vel = api.getComponent(id, Velocity);
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
  plugins: [
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
export const ScoreSystem = createPlugin({
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

