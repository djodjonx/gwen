# Official Plugins

GWEN provides official plugins for common game features.

## @gwen/plugin-input

Keyboard, mouse, and gamepad input handling.

```typescript
import { InputPlugin } from '@gwen/plugin-input';

new InputPlugin()
```

**Usage:**

```typescript
const keyboard = api.services.get('keyboard');

if (keyboard.isPressed('Space')) {
  // Jump
}

if (keyboard.isJustPressed('Enter')) {
  // Fire once
}
```

## @gwen/plugin-audio

Sound effects and music playback.

```typescript
import { AudioPlugin } from '@gwen/plugin-audio';

new AudioPlugin({ masterVolume: 0.7 })
```

**Usage:**

```typescript
const audio = api.services.get('audio');

audio.play('shoot');
audio.playMusic('background', { loop: true });
```

## @gwen/renderer-canvas2d

Canvas 2D rendering.

```typescript
import { Canvas2DRenderer } from '@gwen/renderer-canvas2d';

new Canvas2DRenderer({
  width: 800,
  height: 600,
  background: '#000000'
})
```

**Usage:**

```typescript
const { ctx } = api.services.get('renderer');

ctx.fillStyle = '#ff0000';
ctx.fillRect(x, y, 32, 32);
```

## @gwen/plugin-html-ui

HTML/CSS UI integration.

```typescript
import { HtmlUIPlugin } from '@gwen/plugin-html-ui';

new HtmlUIPlugin()
```

**Usage:**

```html
<div id="score">Score: 0</div>
```

## @gwen/plugin-debug

Performance overlay and debugging tools.

```typescript
import { DebugPlugin } from '@gwen/plugin-debug';

new DebugPlugin({
  overlay: { position: 'top-right' }
})
```

Shows FPS, frame time, entity count.

## Next Steps

- [Creating Plugins](/plugins/creating) - Build your own
- [Configuration](/core/configuration) - Register plugins

