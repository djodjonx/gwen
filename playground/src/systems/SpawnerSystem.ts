import { createPlugin } from '@gwen/engine-core';
import type { EngineAPI } from '@gwen/engine-core';
import { Tag, Position } from '../components';

let spawnTimer = 0;
const WAVE_INTERVAL = 3.5;
const COLS = 5;

export const SpawnerSystem = createPlugin({
  name: 'SpawnerSystem' as const,

  onUpdate(api: EngineAPI<GwenServices>, dt: number) {
    spawnTimer += dt;
    if (spawnTimer < WAVE_INTERVAL) return;
    spawnTimer = 0;

    // Vague de 5 ennemis en ligne
    for (let i = 0; i < COLS; i++) {
      const x = 60 + i * ((480 - 120) / (COLS - 1));
      api.prefabs.instantiate('Enemy', x, -30 - Math.random() * 40);
    }
  },
});

