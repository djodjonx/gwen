import { defineSystem } from '@gwenengine/core';

const WAVE_INTERVAL = 3.5;
const COLS = 5;
const SPAWN_MARGIN_X = 28;

function randomSpawnX(width: number): number {
  const minX = SPAWN_MARGIN_X;
  const maxX = Math.max(minX + 1, width - SPAWN_MARGIN_X);
  return minX + Math.random() * (maxX - minX);
}

export const SpawnerSystem = defineSystem('SpawnerSystem', () => {
  let spawnTimer = 0;

  return {
    onInit() {
      spawnTimer = 0;
    },

    onUpdate(api, dt) {
      spawnTimer += dt;
      if (spawnTimer < WAVE_INTERVAL) return;
      spawnTimer = 0;

      const renderer = api.services.get('renderer');
      const width = renderer.logicalWidth;

      for (let i = 0; i < COLS; i++) {
        const x = randomSpawnX(width);
        api.prefabs.instantiate('Enemy', x, -30 - Math.random() * 40);
      }
    },

    onDestroy() {
      // Réinitialiser l'état pour la prochaine fois
      spawnTimer = 0;
    },
  };
});
