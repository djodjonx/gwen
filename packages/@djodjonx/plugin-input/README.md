# @djodjonx/gwen-plugin-input

**GWEN Input Plugin — Keyboard, mouse, and gamepad input**

Handle player input with a unified, easy-to-use API.

## Installation

```bash
npm install @djodjonx/gwen-plugin-input
```

## Quick Start

### Register the Plugin

```typescript
// gwen.config.ts
import { defineConfig } from '@djodjonx/gwen-kit';
import { InputPlugin } from '@djodjonx/gwen-plugin-input';

export default defineConfig({
  plugins: [new InputPlugin()],
});
```

### Detect Input in Your System

```typescript
import type { EngineAPI } from '@djodjonx/gwen-engine-core';

export function createPlayerMovement(api: EngineAPI) {
  const input = api.services.get('input');

  // Check for key presses
  if (input.isPressed('ArrowLeft') || input.isPressed('a')) {
    moveLeft();
  }
  if (input.isPressed('ArrowRight') || input.isPressed('d')) {
    moveRight();
  }

  // Detect just-pressed (once per frame)
  if (input.isJustPressed('Space')) {
    jump();
  }

  // Mouse position
  const { x, y } = input.mousePosition;
  const isMouseDown = input.isPressed('MouseLeft');
}
```

## API Reference

### `isPressed(key: string): boolean`

Check if a key is currently pressed.

**Keys:**

- Keyboard: `'a'`, `'Enter'`, `'ArrowUp'`, `'Space'`, etc.
- Mouse: `'MouseLeft'`, `'MouseRight'`, `'MouseMiddle'`
- Gamepad: `'GamepadButton0'`, `'GamepadAxis0'`, etc.

### `isJustPressed(key: string): boolean`

Check if a key was pressed this frame (fire once per press).

### `isJustReleased(key: string): boolean`

Check if a key was released this frame.

### `mousePosition: { x: number, y: number }`

Current mouse position relative to the canvas.

### `gamepadAxes: number[]`

Analog stick values for connected gamepads (-1 to 1).

## Examples

### Classic WASD Movement

```typescript
const input = api.services.get('input');

const velocity = { x: 0, y: 0 };

if (input.isPressed('w') || input.isPressed('ArrowUp')) velocity.y -= 5;
if (input.isPressed('s') || input.isPressed('ArrowDown')) velocity.y += 5;
if (input.isPressed('a') || input.isPressed('ArrowLeft')) velocity.x -= 5;
if (input.isPressed('d') || input.isPressed('ArrowRight')) velocity.x += 5;
```

### Click-to-Move

```typescript
if (input.isJustPressed('MouseLeft')) {
  const target = input.mousePosition;
  moveTowards(target);
}
```

### Gamepad Support

```typescript
const axes = input.gamepadAxes;
if (axes.length > 0) {
  const leftStickX = axes[0];
  const leftStickY = axes[1];
  moveWithAnalog(leftStickX, leftStickY);
}
```

## Browser Compatibility

- Keyboard input: All modern browsers
- Mouse input: All modern browsers
- Gamepad API: Chrome 25+, Firefox 29+, Safari 10.1+, Edge 15+

## See Also

- [@djodjonx/gwen-engine-core](../engine-core/) — Core engine
- [@djodjonx/gwen-plugin-audio](../plugin-audio/) — Audio system
- [@djodjonx/gwen-plugin-debug](../plugin-debug/) — Debug overlay
