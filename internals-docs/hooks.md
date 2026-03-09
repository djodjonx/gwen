# 🔌 Guide d'utilisation des Hooks GWEN

## Introduction

GWEN utilise `@unjs/hookable` (version 5.5.3) pour gérer les hooks du moteur. Les hooks permettent aux plugins d'étendre et de personnaliser le comportement du moteur sans modifier son code interne.

## Concepts clés

### Qu'est-ce qu'un hook ?

Un hook est un point d'extension nommé dans le moteur où les plugins peuvent enregistrer des handlers. Quand le moteur atteint ce point, tous les handlers enregistrés pour ce hook sont appelés **dans l'ordre d'enregistrement**.

### Hooks synchrones vs asynchrones

- **Hooks informations** : les handlers ne retournent rien (`void`)
- **Hooks asynchrones** : `callHook()` retourne une Promise que vous devez attendre

## API des Hooks

### Enregistrer un hook

```typescript
import { defineSystem } from '@djodjonx/gwen-engine-core';

export const MySystem = defineSystem({
  name: 'MySystem',

  onInit(api) {
    // Enregistrer un handler pour 'entity:create'
    api.hooks.hook('entity:create', (id) => {
      console.log(`Entity créée: ${id}`);
    });

    // Le hook retourne une fonction pour se désinscrire
    const unregister = api.hooks.hook('entity:destroy', (id) => {
      console.log(`Entity détruite: ${id}`);
    });

    // Vous pouvez vous désinscrire plus tard
    // unregister();
  }
});
```

### Appeler un hook

Les hooks sont normalement appelés automatiquement par le moteur. Mais vous pouvez aussi les appeler manuellement :

```typescript
// Hook informatif (synchrone)
api.hooks.callHook('mon:hook:custom', donnees);

// Avec await (pour hooks asynchrones)
await api.hooks.callHook('mon:hook:async', donnees);
```

### Ordre d'exécution

Les handlers d'un même hook sont exécutés **séquentiellement**, dans l'ordre d'enregistrement :

```typescript
api.hooks.hook('test', () => console.log('1. Premier'));
api.hooks.hook('test', () => console.log('2. Deuxième'));
api.hooks.hook('test', () => console.log('3. Troisième'));

await api.hooks.callHook('test');
// Output:
// 1. Premier
// 2. Deuxième
// 3. Troisième
```

## Hooks du système

### 🎮 Engine Lifecycle

| Hook | Paramètres | Description |
|------|-----------|------------|
| `engine:init` | - | Moteur initialisé |
| `engine:start` | - | Game loop démarrée |
| `engine:stop` | - | Game loop arrêtée |
| `engine:tick` | `deltaTime: number` | Chaque frame |

### 🧩 Plugin Lifecycle

| Hook | Paramètres | Description |
|------|-----------|------------|
| `plugin:register` | `plugin: TsPlugin` | Plugin enregistré |
| `plugin:init` | `plugin: TsPlugin, api: EngineAPI` | Plugin initialisé |
| `plugin:beforeUpdate` | `api: EngineAPI, dt: number` | Avant update (input capture) |
| `plugin:update` | `api: EngineAPI, dt: number` | Après WASM (game logic) |
| `plugin:render` | `api: EngineAPI` | Rendu |
| `plugin:destroy` | `plugin: TsPlugin` | Plugin détruit |

### 🎬 Entity Management

| Hook | Paramètres | Description |
|------|-----------|------------|
| `entity:create` | `id: EntityId` | Entité créée |
| `entity:destroy` | `id: EntityId` | Avant destruction |
| `entity:destroyed` | `id: EntityId` | Après destruction |

### 📦 Component Management

| Hook | Paramètres | Description |
|------|-----------|------------|
| `component:add` | `id: EntityId, type: string, data: unknown` | Composant ajouté |
| `component:remove` | `id: EntityId, type: string` | Avant suppression |
| `component:removed` | `id: EntityId, type: string` | Après suppression |
| `component:update` | `id: EntityId, type: string, data: unknown` | Composant mis à jour |

### 🎪 Scene Management

| Hook | Paramètres | Description |
|------|-----------|------------|
| `scene:beforeLoad` | `name: string` | Avant chargement |
| `scene:load` | `name: string` | Scène chargée |
| `scene:loaded` | `name: string` | Après chargement |
| `scene:beforeUnload` | `name: string` | Avant déchargement |
| `scene:unload` | `name: string` | Scène déchargée |
| `scene:unloaded` | `name: string` | Après déchargement |

### 🔧 Custom Hooks

Vous pouvez créer vos propres hooks :

```typescript
export const PhysicsPlugin = defineSystem({
  name: 'PhysicsPlugin',

  onUpdate(api, dt) {
    // Émettre un hook custom
    api.hooks.callHook('physics:collision' as any, {
      bodyA: entity1,
      bodyB: entity2
    });
  }
});

// Enregistrer un handler
api.hooks.hook('physics:collision' as any, (event) => {
  console.log('Collision entre', event.bodyA, event.bodyB);
});
```

## Exemples pratiques

### 1. Plugin de profiling

Mesurez les performances de vos systèmes :

```typescript
export const ProfilingPlugin = defineSystem({
  name: 'Profiling',

  onInit(api) {
    const timings = new Map<string, number[]>();

    api.hooks.hook('plugin:beforeUpdate', (_, dt) => {
      performance.mark('update-start');
    });

    api.hooks.hook('plugin:update', (_, dt) => {
      performance.mark('update-end');
      performance.measure('update', 'update-start', 'update-end');
    });
  }
});
```

### 2. Plugin de validation

Validez les données avant qu'elles ne soient ajoutées :

```typescript
export const ValidationPlugin = defineSystem({
  name: 'Validation',

  onInit(api) {
    api.hooks.hook('component:add', (id, type, data) => {
      if (type === 'Position' && (!data.x || !data.y)) {
        throw new Error('Position requiert x et y');
      }
    });
  }
});
```

### 3. Plugin de persistance

Enregistrez les modifications d'entités :

```typescript
export const PersistencePlugin = defineSystem({
  name: 'Persistence',

  onInit(api) {
    const changes: any[] = [];

    api.hooks.hook('entity:create', (id) => {
      changes.push({ type: 'create', id, timestamp: Date.now() });
    });

    api.hooks.hook('component:add', (id, componentType, data) => {
      changes.push({
        type: 'component:add',
        id,
        componentType,
        data,
        timestamp: Date.now()
      });
    });

    // Sauvegarder périodiquement
    setInterval(() => {
      console.log('Saving changes:', changes);
      changes.length = 0;
    }, 5000);
  }
});
```

### 4. Plugin de debug

Loguez tous les événements pour le débogage :

```typescript
export const DebugEventsPlugin = defineSystem({
  name: 'DebugEvents',

  onInit(api) {
    if (!api.engine.getConfig().debug) return;

    api.hooks.hook('entity:create', (id) => {
      console.debug('[DEBUG] entity:create', id);
    });

    api.hooks.hook('entity:destroy', (id) => {
      console.debug('[DEBUG] entity:destroy', id);
    });

    api.hooks.hook('component:add', (id, type, data) => {
      console.debug('[DEBUG] component:add', id, type, data);
    });
  }
});
```

## Gestion des erreurs

Hookable (v5+) propage les erreurs au lieu de les avaler. Gérez-les correctement :

```typescript
try {
  await api.hooks.callHook('plugin:update', api, dt);
} catch (error) {
  console.error('Error in plugin:update hooks:', error);
}
```

## Désabonnement

Pour arrêter d'écouter un hook :

```typescript
// Méthode 1 : Fonction retournée
const unregister = api.hooks.hook('entity:create', (id) => {
  console.log('Entity created:', id);
});

// Plus tard...
unregister(); // ✅ Hook désabonné
```

## Best Practices

✅ **À faire :**
- Enregistrer les hooks dans `onInit()`
- Garder les handlers légers et rapides
- Gérer les erreurs dans les handlers async
- Utiliser les noms de hooks descriptifs pour les custom hooks
- Documenter les hooks custom que vous créez

❌ **À éviter :**
- Enregistrer des hooks dans les autres lifecycles
- Faire de longues opérations dans les handlers (bloque la frame)
- Créer des dépendances circulaires entre hooks
- Oublier de désinscrire si vous le faites dynamiquement

## Migration de l'ancienne API

Si vous utilisiez `engine.on()` / `engine.off()` (déprécié) :

```typescript
// ❌ Ancien style (déprécié)
engine.on('entityCreated', (data) => {
  console.log('Entity created:', data.id);
});

// ✅ Nouveau style
api.hooks.hook('entity:create', (id) => {
  console.log('Entity created:', id);
});
```

Mappings :
- `entityCreated` → `entity:create`
- `entityDestroyed` → `entity:destroyed`
- `componentAdded` → `component:add`
- `componentRemoved` → `component:removed`

---

**Voir aussi :** [Système de Plugins](./plugins/creating.md) | [Architecture Engine](./ARCHITECTURE.md)

