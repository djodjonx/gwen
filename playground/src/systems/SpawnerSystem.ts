import { createPlugin } from '@gwen/engine-core';
import type { EngineAPI } from '@gwen/engine-core';

let spawnTimer = 0;
const WAVE_INTERVAL = 3.5;
const COLS = 5;

export const SpawnerSystem = createPlugin({
  name: 'SpawnerSystem' as const,

  onInit() {
    spawnTimer = 0; // réinitialiser à chaque montée de scène
  },

  onUpdate(api: EngineAPI<GwenServices>, dt: number) {
    spawnTimer += dt;
    if (spawnTimer < WAVE_INTERVAL) return;
    spawnTimer = 0;

    // UIComponent inclus dans EnemyPrefab — pas d'attache manuelle ici
    for (let i = 0; i < COLS; i++) {
      const x = 60 + i * ((480 - 120) / (COLS - 1));
      api.prefabs.instantiate('Enemy', x, -30 - Math.random() * 40);
    }
  },
});
