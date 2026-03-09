import { defineSystem } from '@djodjonx/gwen-engine-core';

const WAVE_INTERVAL = 3.5;
const COLS = 5;

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

      for (let i = 0; i < COLS; i++) {
        const x = 60 + i * ((480 - 120) / (COLS - 1));
        api.prefabs.instantiate('Enemy', x, -30 - Math.random() * 40);
      }
    },

    onDestroy() {
      // Réinitialiser l'état pour la prochaine fois
      spawnTimer = 0;
    },
  };
});
