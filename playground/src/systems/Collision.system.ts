import { type TsPlugin, type EngineAPI, type SceneManager } from '@gwen/engine-core';
import { COMPONENTS as C, type Position, type Collider, type Tag, type ScoreData } from '../components';

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

export class CollisionSystem implements TsPlugin {
  readonly name = 'CollisionSystem';

  constructor(private scenes: SceneManager) { }

  onUpdate(api: EngineAPI): void {
    const bullets = api.query([C.TAG.name, C.POSITION.name, C.COLLIDER.name]);
    const enemies = api.query([C.TAG.name, C.POSITION.name, C.COLLIDER.name, C.HEALTH.name]);

    // Retrieve global score
    const scoreEntities = api.query([C.SCORE.name]);
    if (scoreEntities.length === 0) return;
    const scoreEntity = scoreEntities[0];
    const score = api.getComponent(scoreEntity, C.SCORE);
    if (!score) return;

    // Retrieve player
    const playerEntity = api.query([C.TAG.name]).find(id => api.getComponent(id, C.TAG)?.type === 'player');

    for (const bulletId of bullets) {
      const bTag = api.getComponent(bulletId, C.TAG);
      if (bTag?.type !== 'bullet') continue;

      const bPos = api.getComponent(bulletId, C.POSITION)!;
      const bCol = api.getComponent(bulletId, C.COLLIDER)!;

      for (const enemyId of enemies) {
        const eTag = api.getComponent(enemyId, C.TAG);
        if (eTag?.type !== 'enemy') continue;

        const ePos = api.getComponent(enemyId, C.POSITION)!;
        const eCol = api.getComponent(enemyId, C.COLLIDER)!;

        // Player bullet vs enemy
        if (dist(bPos.x, bPos.y, ePos.x, ePos.y) < bCol.radius + eCol.radius) {
          api.destroyEntity(bulletId);
          api.destroyEntity(enemyId);
          api.addComponent(scoreEntity, C.SCORE, {
            ...score, value: score.value + 100,
          });
          break;
        }
      }
    }

    if (playerEntity !== undefined) {
      const pPos = api.getComponent(playerEntity, C.POSITION)!;
      const pCol = api.getComponent(playerEntity, C.COLLIDER)!;

      for (const bulletId of bullets) {
        const bTag = api.getComponent(bulletId, C.TAG);
        if (bTag?.type !== 'enemy-bullet') continue;
        if (!api.hasComponent(bulletId, C.POSITION.name)) continue;

        const bPos = api.getComponent(bulletId, C.POSITION)!;
        const bCol = api.getComponent(bulletId, C.COLLIDER)!;

        // Enemy bullet vs player
        if (dist(bPos.x, bPos.y, pPos.x, pPos.y) < bCol.radius + pCol.radius) {
          api.destroyEntity(bulletId);
          const current = api.getComponent(scoreEntity, C.SCORE)!;
          const newLives = current.lives - 1;
          api.addComponent(scoreEntity, C.SCORE, {
            ...current, lives: newLives,
          });

          if (newLives <= 0) {
            this.scenes.loadScene('MainMenu');
          }
        }
      }
    }
  }
}
