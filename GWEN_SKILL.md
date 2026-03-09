# 🎮 GWEN Framework — AI Agent Skill

Gwen est un moteur de jeu ECS (Entity Component System) hybride ultra-performant, utilisant **Rust (Wasm)** pour le coeur du moteur et **TypeScript** pour l'API, l'outillage et le rendu.

## 🏗️ Architecture & Arborescence

Gwen suit une convention stricte de "Convention over Configuration" :
- `gwen.config.ts` : Point d'entrée de la configuration (plugins, moteur, html).
- `src/components/` : Définition des données (Schémas).
- `src/systems/` : Logique de jeu (Update loop).
- `src/scenes/` : Orchestration (Niveaux, Menus).
- `src/prefabs/` : Modèles d'entités réutilisables.
- `src/ui/` : Rendu visuel (Canvas 2D ou HTML/CSS).

## 🛠️ API Core (TypeScript)

### 1. Composants (`defineComponent`)
Les composants sont des structures de données pures.
```typescript
import { defineComponent, Types } from '@djodjonx/gwen-engine-core';

export const Position = defineComponent({
  name: 'position',
  schema: { x: Types.f32, y: Types.f32 }
});
```

### 2. Systèmes (`defineSystem`)
Les systèmes s'exécutent à chaque frame.
```typescript
export const MovementSystem = defineSystem({
  name: 'MovementSystem',
  onUpdate(api, dt) {
    const entities = api.query([Position, Velocity]);
    for (const id of entities) {
      const pos = api.getComponent(id, Position);
      api.addComponent(id, Position, { x: pos.x + 10 });
    }
  }
});
```

### 3. Scènes (`defineScene`)
Gèrent le cycle de vie et l'activation des systèmes/UI.
```typescript
export const GameScene = defineScene('Game', () => ({
  systems: [MovementSystem, CollisionSystem],
  ui: [PlayerUI, ScoreUI],
  onEnter(api) {
    api.prefabs.register(PlayerPrefab);
    api.prefabs.instantiate('Player');
  }
}));
```

### 4. UI (`defineUI`)
Rendu spécifique à une entité possédant un `UIComponent`.
```typescript
export const PlayerUI = defineUI({
  name: 'PlayerUI',
  render(api, id) {
    const { ctx } = api.services.get('renderer'); // Service auto-typé
    const pos = api.getComponent(id, Position);
    ctx.fillRect(pos.x, pos.y, 20, 20);
  }
});
```

## 🔌 Plugins & Services

Gwen est extensible via des plugins. Les services exposés par les plugins sont accessibles via `api.services.get('name')`.
- **Keyboard** : `api.services.get('keyboard')` -> `isPressed(key)`
- **Renderer** : `api.services.get('renderer')` -> `ctx` (CanvasRenderingContext2D)
- **Audio** : `api.services.get('audio')` -> `play(sound, options)`
- **Physics2D** : Intégration Rust native pour les collisions.

## 🚀 Workflow de développement

1. **Configuration** : Ajouter les plugins dans `gwen.config.ts`.
2. **Préparation** : Lancer `gwen prepare` (ou `pnpm dev`) pour générer les types automatiques des services.
3. **Entités** : Utiliser `api.createEntity()` ou `api.prefabs.instantiate()`.
4. **Scènes** : Charger via `api.scene.load('SceneName')`.

## 💡 Patterns & Best Practices

- **Typed Services** : Ne jamais typer manuellement les services. Gwen les génère dynamiquement dans `GwenDefaultServices` lors du `gwen prepare`.
- **Prefabs over Manual Creation** : Toujours préférer les prefabs pour la création d'entités complexes.
- **Scene State** : Utiliser `api.services.register()` pour partager des données persistantes entre les scènes.
- **Hybrid Rendering** : On peut mixer `Canvas2DRenderer` pour le jeu et `HtmlUIPlugin` pour les menus/overlays.
