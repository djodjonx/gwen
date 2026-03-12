# Official Plugins

All official plugins are under the `@djodjonx` scope and integrate seamlessly with `gwen.config.ts`.

## @djodjonx/gwen-plugin-input

Keyboard, mouse, and gamepad input.

```typescript
import { InputPlugin } from '@djodjonx/gwen-plugin-input';

// gwen.config.ts
plugins: [new InputPlugin()]
```

**Usage:**

```typescript
const keyboard = api.services.get('keyboard');

if (keyboard.isPressed('ArrowRight')) { /* held */ }
if (keyboard.isJustPressed('Space')) { /* fired once */ }
if (keyboard.isJustReleased('Space')) { /* released once */ }
```

---

## @djodjonx/gwen-renderer-canvas2d

2D canvas rendering.

```typescript
import { Canvas2DRenderer } from '@djodjonx/gwen-renderer-canvas2d';

plugins: [new Canvas2DRenderer({ width: 800, height: 600 })]
```

**Usage:**

```typescript
const { ctx } = api.services.get('renderer');
ctx.fillStyle = '#00ff00';
ctx.fillRect(x, y, 32, 32);
```

---

## @djodjonx/gwen-plugin-audio

Sound effects and music.

```typescript
import { AudioPlugin } from '@djodjonx/gwen-plugin-audio';

plugins: [new AudioPlugin({ masterVolume: 0.7 })]
```

**Usage:**

```typescript
const audio = api.services.get('audio');
audio.play('shoot');
audio.playMusic('bgm', { loop: true });
audio.stop('bgm');
```

---

## @djodjonx/gwen-plugin-sprite-anim

Spritesheet animation with a state machine controller for `defineUI`.

```typescript
import { SpriteAnimPlugin } from '@djodjonx/gwen-plugin-sprite-anim';

plugins: [new SpriteAnimPlugin({ autoUpdate: true, fixedDelta: 1 / 60 })]
```

**Usage in `defineUI`:**

```typescript
export const PlayerUI = defineUI({
  name: 'PlayerUI',
  extensions: {
    spriteAnim: {
      atlas: '/sprites/player.png',
      frame: { width: 48, height: 48, columns: 8 },
      clips: {
        idle:       { frames: [1, 2, 3, 4, 3, 2], fps: 9,  loop: true  },
        shoot:      { frames: [8, 9, 10, 11],      fps: 14, loop: false, next: 'idle' },
        accelerate: { frames: [16, 17, 18, 19],    fps: 10, loop: true  },
      },
      controller: {
        initial: 'idle',
        parameters: {
          accelerating: { type: 'bool',    default: false },
          shoot:        { type: 'trigger'               },
        },
        states: {
          idle:       { clip: 'idle'       },
          shoot:      { clip: 'shoot'      },
          accelerate: { clip: 'accelerate' },
        },
        transitions: [
          { from: '*',          to: 'shoot',      priority: 1,  conditions: [{ param: 'shoot' }] },
          { from: 'idle',       to: 'accelerate', priority: 10, conditions: [{ param: 'accelerating', op: '==', value: true  }] },
          { from: 'accelerate', to: 'idle',       priority: 20, conditions: [{ param: 'accelerating', op: '==', value: false }] },
          { from: 'shoot',      to: 'idle',       hasExitTime: true, exitTime: 0.95 },
        ],
      },
      anchor: 'center',
    },
  },
  render(api, id) {
    const pos = api.getComponent(id, Position);
    if (!pos) return;
    const animator = api.services.get('animator');
    const renderer = api.services.get('renderer');
    animator.draw(renderer.ctx, id, pos.x, pos.y, { width: 48, height: 48, pixelSnap: true });
  },
});
```

**Driving animations from a system:**

```typescript
const animator = api.services.get('animator');

animator.setParam(id, 'accelerating', isMovingUp);
if (didShoot) animator.setTrigger(id, 'shoot');
```

> See [Troubleshooting](/TROUBLESHOOTING) for common visual artefacts like loop jumps.

---

## @djodjonx/gwen-plugin-html-ui

Render HTML/CSS overlays (HUD, menus, dialogs).

```typescript
import { HtmlUIPlugin } from '@djodjonx/gwen-plugin-html-ui';

plugins: [new HtmlUIPlugin()]
```

**Usage:**

```typescript
const htmlUI = api.services.get('htmlUI');
htmlUI.mount('score', '<div id="score">0</div>');
htmlUI.unmount('score');
```

---

## @djodjonx/gwen-plugin-debug

Performance overlay (FPS, frame time, entity count).

```typescript
import { DebugPlugin } from '@djodjonx/gwen-plugin-debug';

plugins: [new DebugPlugin({ overlay: { position: 'top-right' } })]
```

---

## @djodjonx/gwen-plugin-physics2d

2D rigid body simulation via Rapier (WASM).

```typescript
import { Physics2DPlugin } from '@djodjonx/gwen-plugin-physics2d';

plugins: [new Physics2DPlugin({ gravity: { x: 0, y: -9.81 } })]
```

**Usage:**

```typescript
const physics = api.services.get('physics');
physics.addRigidBody(entityId, { type: 'dynamic' });
physics.addBoxCollider(entityId, { hw: 16, hh: 16 });
```

---

## Next Steps

- [Creating Plugins](/plugins/creating)
- [Plugin Hooks Guide](/PLUGIN_HOOKS_GUIDE)
- [Configuration](/core/configuration)
