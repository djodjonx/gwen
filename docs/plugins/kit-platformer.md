# gwen-kit-platformer

Kit opinioné pour jeux de plateforme 2D — fournit des factories DX qui
assemblent les plugins GWEN (physics, input) en comportements platformer
prêts à l'emploi.

## Prérequis

```bash
pnpm add @djodjonx/gwen-kit-platformer
```

Dans `gwen.config.ts` :

```ts
import { Physics2DPlugin } from '@djodjonx/gwen-plugin-physics2d';
import { InputPlugin } from '@djodjonx/gwen-plugin-input';
import { PlatformerDefaultInputMap } from '@djodjonx/gwen-kit-platformer';

export default defineConfig({
  plugins: [
    new Physics2DPlugin(),
    new InputPlugin({ actionMap: PlatformerDefaultInputMap }),
  ],
});
```

> Le CLI vérifie automatiquement que `Physics2DPlugin` et `InputPlugin` sont
> présents lors de `gwen prepare`. Une erreur claire est affichée sinon.

---

## Niveau 1 — Scène clé en main

`createPlatformerScene` configure une scène avec les systèmes d'input et
de mouvement déjà câblés.

```ts
import { createPlatformerScene, createPlayerPrefab } from '@djodjonx/gwen-kit-platformer';

const PlayerPrefab = createPlayerPrefab();

export const GameScene = createPlatformerScene({
  name: 'Game',

  // Systèmes exécutés après le mouvement (animation, caméra, HUD)
  systemsAfter: [CameraSystem, AnimationSystem],

  async onEnter(api) {
    api.prefabs.register(PlayerPrefab);
    api.prefabs.instantiate('PlatformerPlayer', 100, 300);
  },
});
```

### Options de `createPlatformerScene`

| Option | Type | Défaut | Description |
|---|---|---|---|
| `name` | `string` | — | Nom unique de la scène |
| `gravity` | `number` | `20` | Gravité verticale (unités physique) |
| `systemsBefore` | `PluginEntry[]` | `[]` | Systèmes avant l'input |
| `systemsAfter` | `PluginEntry[]` | `[]` | Systèmes après le mouvement |
| `onEnter` | `(api) => void` | — | Callback d'entrée de scène |
| `onExit` | `(api) => void` | — | Callback de sortie de scène |

### Ordre d'exécution des systèmes

```
systemsBefore → PlatformerInputSystem → PlatformerMovementSystem → systemsAfter
```

---

## Niveau 2 — Prefab joueur

`createPlayerPrefab` crée une `PrefabDefinition` avec physique et composants
platformer préconfigurés.

```ts
import { createPlayerPrefab } from '@djodjonx/gwen-kit-platformer';

const PlayerPrefab = createPlayerPrefab({
  speed:     400,   // px/s (défaut: 300)
  jumpForce: 600,   // px/s (défaut: 500)
  coyoteMs:  120,   // ms   (défaut: 110)

  // Extension sans fork — ajouter des composants custom
  onCreated(api, id) {
    api.addComponent(id, HealthComponent, { hp: 100 });
    api.addComponent(id, SpriteComponent, { texture: 'player.png' });
  },
});
```

### Options de `createPlayerPrefab`

| Option | Type | Défaut | Description |
|---|---|---|---|
| `name` | `string` | `'PlatformerPlayer'` | Nom du prefab |
| `speed` | `number` | `300` | Vitesse horizontale max (px/s) |
| `jumpForce` | `number` | `500` | Force de saut (px/s) |
| `coyoteMs` | `number` | `110` | Coyote time (ms) |
| `jumpBufferMs` | `number` | `110` | Jump buffer (ms) |
| `maxFallSpeed` | `number` | `600` | Vitesse de chute max (px/s) |
| `physics` | `Record<string, unknown>` | — | Extensions physiques |
| `onCreated` | `(api, id) => void` | — | Hook post-création |

---

## Comportements platformer inclus

### Coyote Time

Permet de sauter pendant `coyoteMs` millisecondes après avoir quitté une
plateforme. Rend le saut "pardonnable" — le joueur peut sauter légèrement
après le bord.

```
 ___________
            \          ← quitte la plateforme
             | ← encore coyoteMs ms pour sauter ici
             |
```

### Jump Buffer

Mémorise l'input de saut pendant `jumpBufferMs` ms avant l'atterrissage.
Le joueur peut presser Espace juste avant de toucher le sol — le saut se
déclenche à l'atterrissage.

```
   [Espace pressé ici]
         |
         ↓ atterrissage → saut déclenché ✅
```

---

## Input Map par défaut

`PlatformerDefaultInputMap` est disponible à l'import pour une configuration
rapide :

```ts
import { PlatformerDefaultInputMap } from '@djodjonx/gwen-kit-platformer';

// Move : WASD + Flèches
// Jump : Space + W + ArrowUp + Gamepad South
new InputPlugin({ actionMap: PlatformerDefaultInputMap })
```

Pour personnaliser les touches, créer une `InputMapConfig` custom :
voir [Input Mapping](./input-mapping.md).
