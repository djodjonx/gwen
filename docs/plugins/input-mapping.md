# Input Mapping

Le système d'Input Mapping de `@djodjonx/gwen-plugin-input` permet de déclarer
des actions logiques (Jump, Move) indépendantes du dispositif physique
(clavier, manette). Zéro magic string — tout est typé via TypeScript.

## Installation

```ts
import { InputPlugin } from '@djodjonx/gwen-plugin-input';
import { PlatformerDefaultInputMap } from '@djodjonx/gwen-kit-platformer';

// Dans gwen.config.ts :
export default defineConfig({
  plugins: [
    new InputPlugin({ actionMap: PlatformerDefaultInputMap }),
  ],
});
```

## Déclarer une ActionMap

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

## Utiliser l'InputMapper dans un système

```ts
import { defineSystem } from '@djodjonx/gwen-engine-core';
import type { InputMapper } from '@djodjonx/gwen-plugin-input';

export const PlayerSystem = defineSystem('PlayerSystem', () => {
  let mapper: InputMapper;

  return {
    onInit(api) {
      // Résoudre en onInit — jamais en onUpdate
      mapper = api.services.get('inputMapper') as InputMapper;
    },

    onUpdate(api, dt) {
      const move = mapper.readAxis2D('Move');     // { x: -1|0|1, y: -1|0|1 }
      const jump = mapper.isActionJustPressed('Jump'); // true sur la 1ère frame
    },
  };
});
```

## Référence API

### `InputMapper`

| Méthode | Description |
|---|---|
| `isActionPressed(action)` | `true` si l'action est maintenue ce frame |
| `isActionJustPressed(action)` | `true` sur la première frame d'appui |
| `isActionJustReleased(action)` | `true` sur la première frame de relâchement |
| `readAxis2D(action)` | Vecteur `{x, y}` normalisé depuis un binding Axis2D |

### Constantes `Keys`

Toutes les touches standards Web (`KeyboardEvent.code`) :
`Keys.A`…`Keys.Z`, `Keys.Space`, `Keys.ArrowUp`, `Keys.F1`…`Keys.F12`, etc.

### Constantes `GamepadButtons`

Layout Xbox / Standard Gamepad API :
`GamepadButtons.South` (A), `GamepadButtons.East` (B), `GamepadButtons.DPadUp`, etc.

## Types de binding

| Type | Interface | Utilisation |
|---|---|---|
| `BindingType.Key` | `KeyBinding` | Touche clavier |
| `BindingType.GamepadButton` | `GamepadButtonBinding` | Bouton manette |
| `BindingType.GamepadAxis` | `GamepadAxisBinding` | Stick analogique |
| `BindingType.Composite2D` | `Composite2DBinding` | 4 touches → vecteur 2D |
