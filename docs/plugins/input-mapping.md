# Input Mapping

The Input Mapping system of `@djodjonx/gwen-plugin-input` lets you declare
logical actions (Jump, Move) independent of the physical device
(keyboard, gamepad). Zero magic strings — everything is typed via TypeScript.

## Installation

```ts
import { InputPlugin } from '@djodjonx/gwen-plugin-input';
import { PlatformerDefaultInputMap } from '@djodjonx/gwen-kit-platformer';

// In gwen.config.ts:
export default defineConfig({
  plugins: [
    new InputPlugin({ actionMap: PlatformerDefaultInputMap }),
  ],
});
```

## Declaring an ActionMap

```ts
import { Keys, GamepadButtons, BindingType, InputType } from '@djodjonx/gwen-plugin-input';
import type { InputMapConfig } from '@djodjonx/gwen-plugin-input';

export const MyInputMap: InputMapConfig = {
  name: 'my-game',
  actions: {
    Jump: {
      type: InputType.Button,
      bindings: [
        { type: BindingType.Key, key: Keys.Space },
        { type: BindingType.GamepadButton, button: GamepadButtons.South },
      ],
    },
    Move: {
      type: InputType.Axis2D,
      bindings: [{
        type: BindingType.Composite2D,
        left:  { type: BindingType.Key, key: Keys.A },
        right: { type: BindingType.Key, key: Keys.D },
        up:    { type: BindingType.Key, key: Keys.W },
        down:  { type: BindingType.Key, key: Keys.S },
      }],
    },
  },
};
```

## Using the InputMapper in a system

```ts
import { defineSystem } from '@djodjonx/gwen-engine-core';
import type { InputMapper } from '@djodjonx/gwen-plugin-input';

export const PlayerSystem = defineSystem('PlayerSystem', () => {
  let mapper: InputMapper;

  return {
    onInit(api) {
      // Resolve in onInit — never in onUpdate
      mapper = api.services.get('inputMapper') as InputMapper;
    },

    onUpdate(api, dt) {
      const move = mapper.readAxis2D('Move');     // { x: -1|0|1, y: -1|0|1 }
      const jump = mapper.isActionJustPressed('Jump'); // true on the 1st frame
    },
  };
});
```

## API Reference

### `InputMapper`

| Method | Description |
|---|---|
| `isActionPressed(action)` | `true` if the action is held this frame |
| `isActionJustPressed(action)` | `true` on the first frame of press |
| `isActionJustReleased(action)` | `true` on the first frame of release |
| `readAxis2D(action)` | Normalized `{x, y}` vector from an Axis2D binding |

### `Keys` constants

All standard Web keys (`KeyboardEvent.code`):
`Keys.A`…`Keys.Z`, `Keys.Space`, `Keys.ArrowUp`, `Keys.F1`…`Keys.F12`, etc.

### `GamepadButtons` constants

Xbox / Standard Gamepad API layout:
`GamepadButtons.South` (A), `GamepadButtons.East` (B), `GamepadButtons.DPadUp`, etc.

## Binding types

| Type | Interface | Usage |
|---|---|---|
| `BindingType.Key` | `KeyBinding` | Keyboard key |
| `BindingType.GamepadButton` | `GamepadButtonBinding` | Gamepad button |
| `BindingType.GamepadAxis` | `GamepadAxisBinding` | Analog stick |
| `BindingType.Composite2D` | `Composite2DBinding` | 4 keys → 2D vector |
