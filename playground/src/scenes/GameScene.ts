import { defineScene, UIComponent } from '@gwen/engine-core';
import type { EngineAPI } from '@gwen/engine-core';
import { PlayerPrefab, EnemyPrefab, BulletPrefab } from '../prefabs';
import { Score } from '../components';
import { MovementSystem } from '../systems/MovementSystem';
import { PlayerSystem } from '../systems/PlayerSystem';
import { AiSystem } from '../systems/AiSystem';
import { SpawnerSystem } from '../systems/SpawnerSystem';
import { CollisionSystem } from '../systems/CollisionSystem';
import { BackgroundUI } from '../ui/BackgroundUI';
import { BulletUI } from '../ui/BulletUI';
import { EnemyUI } from '../ui/EnemyUI';
import { PlayerUI } from '../ui/PlayerUI';
import { ScoreUI } from '../ui/ScoreUI';

export const GameScene = defineScene('Game', () => ({
  ui: [
    BackgroundUI,
    BulletUI,
    EnemyUI,
    PlayerUI,
    ScoreUI,
  ],

  plugins: [
    MovementSystem,
    PlayerSystem,
    AiSystem,
    SpawnerSystem,     // factory — le framework appellera SpawnerSystem() automatiquement
    CollisionSystem,
  ],

  onEnter(api: EngineAPI<GwenServices>) {
    api.prefabs.register(PlayerPrefab);
    api.prefabs.register(EnemyPrefab);
    api.prefabs.register(BulletPrefab);

    const bgId = api.createEntity();
    api.addComponent(bgId, UIComponent, { uiName: 'BackgroundUI' });

    const scoreId = api.createEntity();
    api.addComponent(scoreId, Score, { value: 0, lives: 3 });
    api.addComponent(scoreId, UIComponent, { uiName: 'ScoreUI' });

    api.prefabs.instantiate('Player');
    for (let i = 0; i < 5; i++) {
      api.prefabs.instantiate('Enemy', 60 + i * 90, -30 - i * 15);
    }
  },

  onExit(_api: EngineAPI<GwenServices>) { },
}));
