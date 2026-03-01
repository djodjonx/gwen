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
    const score = api.getComponent<ScoreData>(scoreEntity, C.SCORE);
    if (!score) return;

    // Retrieve player
    const playerEntity = api.query([C.TAG.name]).find(id => api.getComponent<Tag>(id, C.TAG)?.type === 'player');

    for (const bulletId of bullets) {
      const bTag = api.getComponent<Tag>(bulletId, C.TAG);
      if (bTag?.type !== 'bullet') continue;

      const bPos = api.getComponent<Position>(bulletId, C.POSITION)!;
      const bCol = api.getComponent<Collider>(bulletId, C.COLLIDER)!;

      for (const enemyId of enemies) {
        const eTag = api.getComponent<Tag>(enemyId, C.TAG);
        if (eTag?.type !== 'enemy') continue;

        const ePos = api.getComponent<Position>(enemyId, C.POSITION)!;
        const eCol = api.getComponent<Collider>(enemyId, C.COLLIDER)!;

        // Player bullet vs enemy
        if (dist(bPos.x, bPos.y, ePos.x, ePos.y) < bCol.radius + eCol.radius) {
          api.destroyEntity(bulletId);
          api.destroyEntity(enemyId);
          api.addComponent<ScoreData>(scoreEntity, C.SCORE, {
            ...score, value: score.value + 100,
          });
          break;
        }
      }
    }

    if (playerEntity !== undefined) {
      const pPos = api.getComponent<Position>(playerEntity, C.POSITION)!;
      const pCol = api.getComponent<Collider>(playerEntity, C.COLLIDER)!;

      for (const bulletId of bullets) {
        const bTag = api.getComponent<Tag>(bulletId, C.TAG);
        if (bTag?.type !== 'enemy-bullet') continue;
        if (!api.hasComponent(bulletId, C.POSITION.name)) continue;

        const bPos = api.getComponent<Position>(bulletId, C.POSITION)!;
        const bCol = api.getComponent<Collider>(bulletId, C.COLLIDER)!;

        // Enemy bullet vs player
        if (dist(bPos.x, bPos.y, pPos.x, pPos.y) < bCol.radius + pCol.radius) {
          api.destroyEntity(bulletId);
          const current = api.getComponent<ScoreData>(scoreEntity, C.SCORE)!;
          const newLives = current.lives - 1;
          api.addComponent<ScoreData>(scoreEntity, C.SCORE, {
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
