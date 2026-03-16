# gwen-kit-platformer — Usage Avancé (Niveau 3)

Le kit expose ses composants ECS et systèmes internes pour les cas où les
factories ne suffisent pas.

## Assembler sa propre scène

```ts
import {
  PlatformerInputSystem,
  PlatformerMovementSystem,
  PlatformerController,
  PlatformerIntent,
  PLATFORMER_CONTROLLER_DEFAULTS,
} from '@djodjonx/gwen-kit-platformer';
import { defineScene } from '@djodjonx/gwen-engine-core';

export const CustomScene = defineScene({
  name: 'CustomGame',
  systems: [
    GroundDetectionSystem, // votre système de détection sol
    PlatformerInputSystem,
    PlatformerMovementSystem,
    EnemyAISystem,         // IA qui écrit dans PlatformerIntent
    AnimationSystem,
  ],
  onEnter(api) { /* ... */ },
  onExit(api)  { /* ... */ },
});
```

## Brancher une IA sur `PlatformerIntent`

`PlatformerMovementSystem` lit `PlatformerIntent` — il ne sait pas si
c'est un joueur ou une IA qui l'a écrit. Une IA écrit directement dans
`PlatformerIntent` sans toucher au système de mouvement :

```ts
import { defineSystem } from '@djodjonx/gwen-engine-core';
import { PlatformerController, PlatformerIntent } from '@djodjonx/gwen-kit-platformer';

export const EnemyAISystem = defineSystem('EnemyAISystem', () => ({
  onUpdate(api, dt) {
    for (const eid of api.query([PlatformerController, PlatformerIntent])) {
      // L'IA décide du mouvement
      const targetX = /* calcul pathfinding */ 0;
      api.addComponent(eid, PlatformerIntent, {
        moveX:           targetX,
        jumpJustPressed: shouldJump(eid),
        jumpPressed:     false,
      });
    }
  },
}));
```

## Composant `PlatformerController` — référence

| Champ | Type | Défaut | Description |
|---|---|---|---|
| `speed` | `f32` | `300` | Vitesse horizontale max (px/s) |
| `jumpForce` | `f32` | `500` | Impulsion verticale de saut (px/s) |
| `coyoteMs` | `f32` | `110` | Fenêtre coyote time (ms) |
| `jumpBufferMs` | `f32` | `110` | Fenêtre jump buffer (ms) |
| `maxFallSpeed` | `f32` | `600` | Plafond de vitesse de chute (px/s) |

## Composant `PlatformerIntent` — référence

| Champ | Type | Description |
|---|---|---|
| `moveX` | `f32` | Direction horizontale : -1 (gauche), 0 (immobile), 1 (droite) |
| `jumpJustPressed` | `bool` | `true` sur la première frame d'appui saut |
| `jumpPressed` | `bool` | `true` tant que le bouton saut est maintenu |

## Contrat `Physics2DAPI` requis

`PlatformerMovementSystem` utilise ces méthodes de `Physics2DAPI` :

| Méthode | Signature | Description |
|---|---|---|
| `getLinearVelocity` | `(eid) => {x,y} \| null` | Vélocité courante |
| `setLinearVelocity` | `(eid, vx, vy) => void` | Applique une vélocité |
| `isGrounded` | `(eid) => boolean` | Détection sol (foot sensor) |

Si `isGrounded` n'est pas disponible sur votre implémentation physics,
créez un composant `Grounded { value: bool }` mis à jour par un système
de collision dans `systemsBefore`.
