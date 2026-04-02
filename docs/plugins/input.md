# Input Plugin

**Package:** `@gwenjs/input`
**Service keys:** `keyboard` · `mouse` · `gamepad` · `inputMapper`

Unified input handling for keyboard, mouse, and gamepad. Supports raw per-device queries and an abstract action-mapping layer so game code never hardcodes physical keys.

## Install

```bash
pnpm add @gwenjs/input
```

## Register

```typescript
// gwen.config.ts
import { defineConfig } from '@gwenjs/app'
import { InputPlugin } from '@gwenjs/input'

export default defineConfig({
  plugins: [
    new InputPlugin({
      inputMap: {
        jump:   { keys: ['Space', 'ArrowUp'],   buttons: [0] },
        attack: { keys: ['KeyZ'],               buttons: [2] },
        left:   { keys: ['ArrowLeft', 'KeyA'],  axes:   [{ axis: 0, dir: -1 }] },
        right:  { keys: ['ArrowRight', 'KeyD'], axes:   [{ axis: 0, dir:  1 }] },
      },
    }),
  ],
})
```

## Service API

### `keyboard` — `KeyboardInput`

| Method | Description |
|--------|-------------|
| `keyboard.isDown(key)` | `true` while the key is held |
| `keyboard.isPressed(key)` | `true` only on the frame the key was first pressed |
| `keyboard.isReleased(key)` | `true` only on the frame the key was released |

Keys use [KeyboardEvent.code](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code) strings (`'Space'`, `'ArrowLeft'`, `'KeyA'`, …).

### `mouse` — `MouseInput`

| Property / Method | Description |
|-------------------|-------------|
| `mouse.position` | `{ x, y }` in canvas-space pixels |
| `mouse.delta` | `{ x, y }` movement since last frame |
| `mouse.isDown(button)` | `true` while mouse button is held (0=left, 1=middle, 2=right) |
| `mouse.isPressed(button)` | `true` on the first frame the button is pressed |
| `mouse.isReleased(button)` | `true` on the frame the button is released |
| `mouse.wheel` | Scroll delta this frame (`{ x, y }`) |

### `gamepad` — `GamepadInput`

| Property / Method | Description |
|-------------------|-------------|
| `gamepad.isDown(button)` | `true` while the button is held (standard mapping index) |
| `gamepad.isPressed(button)` | `true` on first frame the button is pressed |
| `gamepad.isReleased(button)` | `true` on the frame the button is released |
| `gamepad.axes` | `number[]` — raw axis values (`-1` to `1`) |
| `gamepad.connected` | `true` if at least one gamepad is connected |

### `inputMapper` — `InputMapper`

| Method | Description |
|--------|-------------|
| `inputMapper.isDown(action)` | `true` while any bound key/button is held |
| `inputMapper.isPressed(action)` | `true` on the first frame any binding fires |
| `inputMapper.isReleased(action)` | `true` on the frame all bindings are released |
| `inputMapper.getAxis(negAction, posAction)` | Returns `-1`, `0`, or `1` for a virtual axis |

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `inputMap` | `InputMapConfig` | `undefined` | Action-to-binding mapping. Omit if you only need raw device access. |

### `InputMapConfig` shape

```typescript
type InputMapConfig = Record<string, {
  keys?:    string[]
  buttons?: number[]
  axes?:    Array<{ axis: number; dir: 1 | -1; threshold?: number }>
}>
```

## Example

```typescript
import { defineSystem, useService, onUpdate } from '@gwenjs/core'
import { useQuery } from '@gwenjs/core'
import { Position, Velocity } from '../components'

export const playerInputSystem = defineSystem(() => {
  const keyboard     = useService('keyboard')
  const inputMapper  = useService('inputMapper')
  const entities     = useQuery([Position, Velocity])

  onUpdate((dt) => {
    for (const entity of entities) {
      const vel = entity.get(Velocity)

      // Abstract action (works with keyboard OR gamepad)
      vel.x = inputMapper.getAxis('left', 'right') * 200

      // Raw key check
      if (keyboard.isPressed('Space')) {
        vel.y = -400 // jump
      }
    }
  })
})
```

::: tip Composable shorthand
`@gwenjs/input` also exports `useKeyboard()`, `useMouse()`, `useGamepad()`, and `useInputMapper()` composables as shorthand for `useService('keyboard')` etc.
:::

## Related

- [Sprite Animation](/plugins/sprite-anim) — pair with input for animated characters
- [Kit: Platformer](/examples/patterns) — ready-made input bindings for a side-scroller
