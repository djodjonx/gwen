# Scene Reload System - Documentation

## Overview

Le système de reload de scenes permet de contrôler si une scene doit être rechargée (détruite et recréée) lorsqu'on y retourne.

**Comportement par défaut**: `reloadOnReenter: true` (comme Unity/Godot)

## API

### Scene Interface

```typescript
interface Scene {
  readonly name: string;

  /**
   * Contrôle si la scene reload quand on y retourne.
   *
   * - `true` (default): Full reload (comme Unity/Godot)
   * - `false`: Keep state (comme Phaser pause/resume)
   * - `function`: Décision dynamique basée sur le contexte
   *
   * @default true
   */
  reloadOnReenter?: boolean | ReloadEvaluator;

  systems?: PluginEntry[];
  ui?: UIDefinition<any>[];
  layout?: string;
  onEnter(api: EngineAPI): void;
  onUpdate?(api: EngineAPI, deltaTime: number): void;
  onRender?(api: EngineAPI): void;
  onExit(api: EngineAPI): void;
}
```

### ReloadContext

```typescript
interface ReloadContext {
  /** Scene d'où on vient */
  fromScene: string | null;

  /** Scene vers laquelle on va */
  toScene: string;

  /** True si c'est un re-enter */
  isReenter: boolean;

  /** Nombre de fois qu'on est entré dans cette scene */
  enterCount: number;

  /** Data custom passée via scene.load(name, data) */
  data?: Record<string, unknown>;
}
```

### ReloadEvaluator

```typescript
type ReloadEvaluator = (
  api: EngineAPI,
  context: ReloadContext
) => boolean;
```

## Usage

### 1. Boolean Simple

```typescript
// Reload toujours (default - comme Unity/Godot)
export const GameScene = defineScene('Game', () => ({
  reloadOnReenter: true,
  systems: [MovementSystem, PlayerSystem],
  onEnter(api) {
    // Setup entities
  },
  onExit(api) {}
}));
```

```typescript
// Jamais reload (comme pause menu)
export const PauseScene = defineScene('Pause', () => ({
  reloadOnReenter: false,
  systems: [PauseSystem],
  onEnter(api) {
    // Garde l'état
  },
  onExit(api) {}
}));
```

### 2. Function Evaluator - Conditionnel

```typescript
// Reload seulement après game over
export const GameScene = defineScene('Game', () => ({
  reloadOnReenter: (api, ctx) => {
    return ctx.data?.reason === 'gameOver';
  },

  systems: [MovementSystem, PlayerSystem],
  onEnter(api) {},
  onExit(api) {}
}));

// Utilisation
if (lives <= 0) {
  api.scene.load('Game', { reason: 'gameOver' });
}
```

```typescript
// Reload après 3+ morts
export const GameScene = defineScene('Game', () => ({
  reloadOnReenter: (api, ctx) => {
    return ctx.enterCount > 3;
  },

  systems: [MovementSystem, PlayerSystem],
  onEnter(api) {},
  onExit(api) {}
}));
```

```typescript
// Logic complexe avec services
export const BossScene = defineScene('Boss', () => ({
  reloadOnReenter: (api, ctx) => {
    const gameState = api.services.get('gameState');
    const shouldRestart = gameState.playerDied && !gameState.hasCheckpoint;
    return shouldRestart;
  },

  systems: [BossSystem],
  onEnter(api) {},
  onExit(api) {}
}));
```

## Hooks

### scene:willReload

Appelé avant qu'une scene soit rechargée.

```typescript
api.hooks.hook('scene:willReload', (name, context) => {
  console.log(`Reloading ${name}`);
  console.log(`Reason: ${context.data?.reason}`);
  console.log(`Enter count: ${context.enterCount}`);

  // Sauvegarder l'état avant reload
  saveGameState();

  // Analytics
  analytics.track('scene_reload', {
    scene: name,
    enterCount: context.enterCount
  });
});
```

## Comportement Détaillé

### Reload (reloadOnReenter: true)

Quand une scene reload :

1. ✅ `scene:willReload` hook appelé
2. ✅ `scene:beforeUnload` hook appelé
3. ✅ `onExit()` appelé
4. ✅ Systèmes détruits (onDestroy)
5. ✅ `scene:unload` hook appelé
6. ✅ Toutes les entités purgées
7. ✅ `scene:unloaded` hook appelé
8. ✅ `scene:beforeLoad` hook appelé
9. ✅ Systèmes recréés (factories appelées)
10. ✅ `scene:load` hook appelé
11. ✅ `onEnter()` appelé
12. ✅ `scene:loaded` hook appelé

**Résultat** : État complètement frais, comme si la scene était chargée pour la première fois.

### No Reload (reloadOnReenter: false)

Quand une scene NE reload PAS :

1. ❌ Aucun hook appelé
2. ❌ onExit/onEnter NON appelés
3. ❌ Systèmes gardent leur état (closures)
4. ❌ Entités persistent
5. ✅ La scene continue exactement où elle en était

**Résultat** : État préservé, comme un "pause/resume".

## Cas d'Usage

### Game Scene - Reload par défaut

```typescript
export const GameScene = defineScene('Game', () => ({
  // Default true → reload toujours
  ui: [BackgroundUI, PlayerUI, EnemyUI],
  systems: [MovementSystem, PlayerSystem, SpawnerSystem],

  onEnter(api) {
    // Setup initial entities
    api.prefabs.instantiate('Player');
    for (let i = 0; i < 5; i++) {
      api.prefabs.instantiate('Enemy', 100 + i * 50, 100);
    }
  },

  onExit(api) {}
}));

// Dans CollisionSystem
if (lives <= 0) {
  api.scene.load('MainMenu'); // Sort vers menu
}

// Pour retry
if (keyboard.isPressed('R')) {
  api.scene.load('Game'); // Reload automatique !
}
```

### Pause Menu - Pas de reload

```typescript
export const PauseScene = defineScene('Pause', () => ({
  reloadOnReenter: false, // Garde l'état

  ui: [PauseUI],

  onEnter(api) {
    // Pause le jeu
  },

  onExit(api) {
    // Resume le jeu
  }
}));
```

### Conditionnel - Game Over vs Retry

```typescript
export const GameScene = defineScene('Game', () => ({
  reloadOnReenter: (api, ctx) => {
    // Reload seulement si game over
    // Pas de reload si juste retry rapide
    return ctx.data?.reason === 'gameOver';
  },

  systems: [MovementSystem, PlayerSystem],
  onEnter(api) {},
  onExit(api) {}
}));

// Game over → reload
if (lives <= 0) {
  api.scene.load('Game', { reason: 'gameOver' });
}

// Quick retry → pas de reload
if (keyboard.isPressed('R')) {
  api.scene.load('Game', { reason: 'retry' });
}
```

## Comparaison avec Autres Moteurs

| Moteur | Comportement | GWEN Équivalent |
|--------|--------------|-----------------|
| **Unity** | Toujours reload | `reloadOnReenter: true` (default) |
| **Godot** | Toujours reload | `reloadOnReenter: true` (default) |
| **Phaser** | start/restart/pause/resume | `reloadOnReenter: boolean` |
| **Unreal** | Toujours reload | `reloadOnReenter: true` (default) |

## Best Practices

### ✅ DO

```typescript
// Utiliser default (true) pour game scenes
export const GameScene = defineScene('Game', () => ({
  // reloadOnReenter non spécifié → true par défaut
  systems: [MovementSystem],
  onEnter(api) {},
  onExit(api) {}
}));

// Utiliser false pour menus/pause
export const PauseScene = defineScene('Pause', () => ({
  reloadOnReenter: false,
  ui: [PauseUI],
  onEnter(api) {},
  onExit(api) {}
}));

// Utiliser function pour logique complexe
export const BossScene = defineScene('Boss', () => ({
  reloadOnReenter: (api, ctx) => {
    return ctx.data?.playerDied === true;
  },
  systems: [BossSystem],
  onEnter(api) {},
  onExit(api) {}
}));
```

### ❌ DON'T

```typescript
// ❌ Ne pas utiliser factories manuelles
export const GameScene = defineScene('Game', () => ({
  systems: [
    () => MovementSystem, // ❌ Pas besoin !
    () => PlayerSystem,   // ❌ reloadOnReenter gère ça
  ],
  onEnter(api) {},
  onExit(api) {}
}));

// ✅ Utiliser reloadOnReenter à la place
export const GameScene = defineScene('Game', () => ({
  reloadOnReenter: true, // ✅ Systèmes recréés automatiquement
  systems: [MovementSystem, PlayerSystem],
  onEnter(api) {},
  onExit(api) {}
}));
```

## Troubleshooting

### Problème : Systèmes gardent leur état après game over

**Cause** : `reloadOnReenter` est `false` ou absent sur une vieille scene.

**Solution** : Ajouter `reloadOnReenter: true` (ou laisser default).

```typescript
export const GameScene = defineScene('Game', () => ({
  reloadOnReenter: true, // ← Ajoutez ça
  systems: [MovementSystem],
  onEnter(api) {},
  onExit(api) {}
}));
```

### Problème : Hook scene:willReload pas appelé

**Cause** : Le reload ne se produit pas (reloadOnReenter est false).

**Solution** : Vérifier la valeur de `reloadOnReenter`.

```typescript
// Debug
export const GameScene = defineScene('Game', () => ({
  reloadOnReenter: (api, ctx) => {
    console.log('Evaluating reload:', ctx);
    return true; // Forcez true pour tester
  },
  systems: [MovementSystem],
  onEnter(api) {},
  onExit(api) {}
}));
```

### Problème : enterCount ne s'incrémente pas

**Cause** : Normal - `enterCount` est cumulatif sur toute la session.

**Solution** : Si vous voulez reset, utilisez la data :

```typescript
let sessionDeaths = 0;

export const GameScene = defineScene('Game', () => ({
  reloadOnReenter: (api, ctx) => {
    sessionDeaths++;
    return sessionDeaths > 3;
  },
  systems: [MovementSystem],
  onEnter(api) {},
  onExit(api) {}
}));
```

## Migration depuis Code Existant

### Avant (avec factories manuelles)

```typescript
export const GameScene = defineScene('Game', () => ({
  systems: [
    () => MovementSystem,
    () => PlayerSystem,
    () => SpawnerSystem,
  ],
  onEnter(api) {},
  onExit(api) {}
}));
```

### Après (avec reloadOnReenter)

```typescript
export const GameScene = defineScene('Game', () => ({
  reloadOnReenter: true, // ← Nouveau !
  systems: [
    MovementSystem,    // ← Plus de factories
    PlayerSystem,
    SpawnerSystem,
  ],
  onEnter(api) {},
  onExit(api) {}
}));
```

**Bénéfices** :
- ✅ Code plus simple
- ✅ Intent clair
- ✅ Contrôle fin avec function evaluator
- ✅ Hooks pour observer les reloads

## Testing

```typescript
import { describe, it, expect } from 'vitest';
import { SceneManager, defineScene } from '@gwen/engine-core';

it('should reload scene when reloadOnReenter is true', () => {
  let enterCount = 0;

  const TestScene = defineScene({
    name: 'Test',
    reloadOnReenter: true,
    onEnter() { enterCount++; },
    onExit() {},
  });

  sceneManager.register(TestScene);
  sceneManager.loadSceneImmediate('Test', api);
  expect(enterCount).toBe(1);

  sceneManager.loadSceneImmediate('Test', api);
  expect(enterCount).toBe(2); // Reloaded!
});
```

## Performance

**Reload** (default) :
- ⚠️ Coût: Moyen (destruction + recréation)
- ✅ Bénéfice: État garanti frais, pas de bugs de state

**No Reload** (false) :
- ✅ Coût: Zéro (pas d'opérations)
- ⚠️ Risque: État peut être corrompu

**Recommandation** : Utiliser le default (reload) sauf si performance critique ET vous maîtrisez parfaitement la gestion d'état.

---

**Status** : ✅ Stable depuis v0.2.0
**Tested** : 13 tests passent
**Inspired by** : Unity, Godot, Phaser

