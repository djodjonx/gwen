# Official Plugins

GWEN provides official plugins for common game features.

## @djodjonx/gwen-plugin-input

Keyboard, mouse, and gamepad input handling.

```typescript
import { InputPlugin } from '@djodjonx/gwen-plugin-input';

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

## @djodjonx/gwen-plugin-audio

Sound effects and music playback.

```typescript
import { AudioPlugin } from '@djodjonx/gwen-plugin-audio';

new AudioPlugin({ masterVolume: 0.7 })
```

**Usage:**

```typescript
const audio = api.services.get('audio');

audio.play('shoot');
audio.playMusic('background', { loop: true });
```

## @djodjonx/gwen-renderer-canvas2d

Canvas 2D rendering.

```typescript
import { Canvas2DRenderer } from '@djodjonx/gwen-renderer-canvas2d';

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

## @djodjonx/gwen-plugin-sprite-anim

Sprite animation runtime with clips, parameters, transitions, and state machine support for `defineUI`.

```typescript
import { SpriteAnimPlugin } from '@djodjonx/gwen-plugin-sprite-anim';

new SpriteAnimPlugin({
  autoUpdate: true,
  fixedDelta: 1 / 60,
})
```

**Usage:**

```typescript
const animator = api.services.get('animator');

animator.setParam(playerId, 'moving', true);
animator.setTrigger(playerId, 'shoot');
```

## @djodjonx/gwen-plugin-html-ui

HTML/CSS UI integration.

```typescript
import { HtmlUIPlugin } from '@djodjonx/gwen-plugin-html-ui';

new HtmlUIPlugin()
```

**Usage:**

```html
<div id="score">Score: 0</div>
```

## @djodjonx/gwen-plugin-debug

Performance overlay and debugging tools.

```typescript
import { DebugPlugin } from '@djodjonx/gwen-plugin-debug';

new DebugPlugin({
  overlay: { position: 'top-right' }
})
```

Shows FPS, frame time, entity count.

## Next Steps

- [Creating Plugins](/plugins/creating) - Build your own
- [Configuration](/core/configuration) - Register plugins
