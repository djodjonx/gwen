# Input Plugin

Package: `@gwenjs/input`

Keyboard, mouse, gamepad, and action mapping for gameplay systems.

## Install

```bash
pnpm add @gwenjs/input
```

## Register

```ts
import { defineConfig } from '@gwenjs/kit';
import { InputPlugin } from '@gwenjs/input';

export default defineConfig({
  plugins: [
    InputPlugin({
      gamepadDeadzone: 0.2,
    }),
  ],
});
```

## API

Main exports:
- `InputPlugin(config?)`
- `KeyboardInput`, `MouseInput`, `GamepadInput`
- `InputMapper`
- `Keys`, `GamepadButtons`, `GamepadAxes`

Services provided:
- `keyboard`
- `mouse`
- `gamepad`
- `inputMapper` (only when `actionMap` is configured)

Config options:
- `canvas?: HTMLCanvasElement`
- `eventTarget?: EventTarget`
- `gamepadDeadzone?: number`
- `actionMap?: InputMapConfig`

## Example

```ts
export const PlayerSystem = defineSystem(() => {
  const keyboard = useService('keyboard');

  onUpdate(() => {
    if (keyboard.isPressed('ArrowLeft')) {
      // move left
    }
    if (keyboard.isJustPressed('Space')) {
      // jump once
    }
  });
});
```

## Source

- `packages/input/src/index.ts`
