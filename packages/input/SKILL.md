---
name: gwen-input
description: Expert skill for handling multi-device user input (Keyboard, Mouse, Gamepad) with normalized polling and deadzone management.
---

# Input Expert Skill

## Context
GWEN Input abstraction provides a unified polling API. It samples hardware state once per frame in `onBeforeUpdate` to ensure consistency across all systems during the frame.

## Instructions

### 1. Configuration
```typescript
import { InputPlugin } from '@gwenengine/input';

export default defineConfig({
  plugins: [
    new InputPlugin({ 
      gamepadDeadzone: 0.15,
      // Target for events, defaults to window. Useful for isolated iframes.
      eventTarget: window,
      // Canvas used to calculate relative mouse coordinates
      canvas: document.getElementById('game') as HTMLCanvasElement
    })
  ],
});
```

### 2. Keyboard API (`keyboard` service)
- `isDown(code)`: Persistent state (held).
- `isPressed(code)`: Edge detection (true for one frame).
- `isReleased(code)`: Release detection (true for one frame).
- `anyPressed(['KeyW', 'ArrowUp'])`: Check for multiple mapping possibilities.

### 3. Mouse API (`mouse` service)
- `getPosition()`: Returns `{ x, y }` relative to the configured canvas.
- `getDelta()`: Returns `{ x, y }` movement since the last frame.
- `isButtonDown(button)`: 0=Left, 1=Middle, 2=Right.
- `getWheelDelta()`: Scroll amount.

### 4. Gamepad API (`gamepad` service)
- `getAxis(axisIndex)`: Returns normalized `-1.0` to `1.0` value (includes deadzone logic).
- `isButtonPressed(buttonIndex)`: Standard mapping for gamepads.
- `getGamepad(index)`: Access raw gamepad state for non-standard devices.

## Available Resources
- `packages/@gwenengine/plugin-input/src/keyboard.ts`: List of supported `KeyCodes`.
- `packages/@gwenengine/plugin-input/src/gamepad.ts`: Standard mapping constants (Button A=0, B=1, etc.).

## Constraints
- **Lifecycle**: Input is captured *before* updates. Never use `window.addEventListener` for gameplay logic as it might fire out of sync with the ECS `deltaTime`.
- **Canvas Focus**: Mouse position requires a canvas reference in the config to be accurate (takes into account `getBoundingClientRect`).
- **Standardization**: Uses the Browser "Standard Gamepad Mapping".
