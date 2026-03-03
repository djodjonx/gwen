import { defineSystem } from '@gwen/engine-core';
import type { EngineAPI } from '@gwen/engine-core';

const WAVE_INTERVAL = 3.5;
const COLS = 5;

export const SpawnerSystem = defineSystem('SpawnerSystem', () => {
  let spawnTimer = 0;

  return {
    onInit() {
      spawnTimer = 0;
    },

    onUpdate(api: EngineAPI<GwenServices>, dt: number) {
      spawnTimer += dt;
      if (spawnTimer < WAVE_INTERVAL) return;
      spawnTimer = 0;

      for (let i = 0; i < COLS; i++) {
        const x = 60 + i * ((480 - 120) / (COLS - 1));
        api.prefabs.instantiate('Enemy', x, -30 - Math.random() * 40);
      }
    },
  };
});
