# 📌 Guide - Déclarer des Hooks Personnalisés dans un Plugin

## Vue d'Ensemble

Les plugins GWEN peuvent maintenant **déclarer et exposer leurs propres hooks** de manière **100% type-safe**.

Le système fonctionne exactement comme les `provides` (services), mais pour les hooks.

## Pattern Standard

### 1. Déclarer l'Interface des Hooks

Dans `src/types.ts` (ou `src/hooks.ts`) de votre plugin :

```typescript
/**
 * Hooks exposés par le plugin Physics2D.
 *
 * Les autres plugins peuvent écouter ces événements de manière type-safe.
 */
export interface Physics2DHooks {
  /**
   * Appelé quand deux corps entrent en collision
   * @param event - Détails de la collision
   */
  'physics:collision': (event: CollisionEvent) => void;

  /**
   * Appelé avant la simulation physique
   * @param deltaTime - Temps écoulé en millisecondes
   */
  'physics:beforeStep': (deltaTime: number) => void;

  /**
   * Appelé après la simulation physique
   */
  'physics:afterStep': () => void;
}
```

### 2. Déclarer le Plugin avec ses Hooks

Dans `src/index.ts` :

```typescript
import type { GwenPlugin } from '@gwen/engine-core';
import type { Physics2DHooks } from './types';

/**
 * Services exposés par Physics2D
 */
export interface Physics2DServices {
  physics: Physics2DManager;
}

/**
 * Physics2D Plugin — avec hooks custom
 */
export class Physics2DPlugin
  implements GwenPlugin<'Physics2D', Physics2DServices, Physics2DHooks>
{
  readonly name = 'Physics2D' as const;

  /**
   * Services fournis par ce plugin
   */
  readonly provides = {
    physics: {} as Physics2DManager,
  };

  /**
   * Hooks fournis par ce plugin (phantom type pour l'inférence)
   */
  readonly providesHooks = {} as Physics2DHooks;

  onInit(api: EngineAPI) {
    const physics = new Physics2DManager();
    api.services.register('physics', physics);
  }

  onUpdate(api: EngineAPI, dt: number) {
    const physics = api.services.get('physics');

    // Avant la simulation
    api.hooks.callHook('physics:beforeStep' as any, dt * 1000);

    // Simulation...
    physics.step(dt);

    // Après la simulation
    api.hooks.callHook('physics:afterStep' as any);

    // Détecter les collisions et émettre l'événement
    const collisions = physics.getCollisions();
    for (const collision of collisions) {
      api.hooks.callHook('physics:collision' as any, collision);
    }
  }
}
```

### 3. Exporter dans package.json (pour CLI)

Dans `package.json` du plugin :

```json
{
  "name": "@gwen/plugin-physics2d",
  "version": "0.1.0",
  "description": "Physics2D Plugin for GWEN",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "gwenHooks": "./src/types.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  }
}
```

La CLI utilisera `gwenHooks` pour découvrir et extraire les interfaces de hooks.

## Utiliser les Hooks du Plugin

### Dans un Autre Plugin

```typescript
export const CollisionHandler = defineSystem({
  name: 'CollisionHandler',

  onInit(api: EngineAPI) {
    // Écouter les collisions du Physics2D plugin
    api.hooks.hook('physics:collision' as any, (event) => {
      console.log('Collision:', event.bodyA, event.bodyB);

      // Faire quelque chose...
      const entityA = api.getComponent(event.bodyA.id, 'Health');
      if (entityA) {
        entityA.hp -= event.impulse * 10;
      }
    });
  }
});
```

### Type-Safety après `gwen prepare`

Après avoir exécuté `gwen prepare`, la CLI génère `.gwen/gwen.d.ts` :

```typescript
declare global {
  interface GwenDefaultHooks extends
    GwenHooks,           // Hooks système
    Physics2DHooks,      // Hooks du plugin Physics2D
    InputHooks,          // Hooks du plugin Input
    AudioHooks           // Hooks du plugin Audio
  {}
}
```

Cela signifie que **tout est type-safe sans annotation** :

```typescript
// ✅ APRÈS gwen prepare — type-safe complet
export const CollisionHandler = defineSystem({
  name: 'CollisionHandler',

  onInit(api) {
    // ✅ Intellisense et type-checking automatiques
    api.hooks.hook('physics:collision' as any, (event) => {
      // event est typé comme CollisionEvent ✅
    });

    api.hooks.hook('entity:create', (id) => {
      // id est typé comme EntityId ✅
    });
  }
});
```

## Nommage des Hooks

### Convention de Nommage

Utilisez le pattern `namespace:event` :

```typescript
// ✅ BON
export interface MyPluginHooks {
  'myplugin:event': () => void;
  'myplugin:initialized': () => void;
  'myplugin:error': (err: Error) => void;
}

// ❌ MAUVAIS — pas de namespace
export interface MyPluginHooks {
  'event': () => void;        // Conflits potentiels
  'init': () => void;
  'error': (err: Error) => void;
}
```

### Exemples

```typescript
// Physics plugin
'physics:collision': (event: CollisionEvent) => void;
'physics:beforeStep': (dt: number) => void;

// Input plugin
'input:keyDown': (key: string) => void;
'input:mouseMove': (x: number, y: number) => void;

// Audio plugin
'audio:play': (soundId: string) => void;
'audio:stop': (soundId: string) => void;

// UI plugin
'ui:buttonClicked': (buttonId: string) => void;
'ui:dialogClosed': (dialogId: string) => void;
```

## Ordre d'Exécution des Hooks

Les hooks d'un même événement sont exécutés **dans l'ordre d'enregistrement** :

```typescript
// Ordre d'exécution : 1 → 2 → 3
api.hooks.hook('physics:collision', () => console.log('1'));
api.hooks.hook('physics:collision', () => console.log('2'));
api.hooks.hook('physics:collision', () => console.log('3'));

// Output:
// 1
// 2
// 3
```

Cela permet aux plugins de se coordonner facilement.

## Erreurs et Gestion

Les erreurs dans un handler ne crashent pas le moteur :

```typescript
api.hooks.hook('physics:collision', (event) => {
  throw new Error('Oops!'); // Erreur loggée mais engine continue
});

// Les autres handlers sont toujours appelés
api.hooks.hook('physics:collision', (event) => {
  console.log('This still runs'); // ✅ Appelé
});
```

## Tester les Hooks

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createGwenHooks } from '@gwen/engine-core';

describe('Physics2D Hooks', () => {
  it('should emit collision event', async () => {
    const hooks = createGwenHooks();
    const callback = vi.fn();

    hooks.hook('physics:collision' as any, callback);

    await hooks.callHook('physics:collision' as any, {
      bodyA: { id: 1 },
      bodyB: { id: 2 },
      impulse: 10,
    });

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        bodyA: { id: 1 },
        bodyB: { id: 2 },
      })
    );
  });
});
```

## Résumé

| Aspect | Comment |
|--------|---------|
| **Déclarer** | `interface PluginHooks { 'ns:event': (...) => void }` |
| **Exposer** | `implements GwenPlugin<Name, Services, Hooks>` |
| **Émettre** | `api.hooks.callHook('ns:event' as any, data)` |
| **Écouter** | `api.hooks.hook('ns:event' as any, (data) => {})` |
| **Type-safe** | Automatique après `gwen prepare` |

---

**Next:** Exécutez `gwen prepare` pour enrichir `.gwen/gwen.d.ts` avec tous vos hooks plugins !

