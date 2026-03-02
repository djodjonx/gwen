import { createPlugin, UIComponent } from '@gwen/engine-core';
import type { EngineAPI } from '@gwen/engine-core';

let spawnTimer = 0;
const WAVE_INTERVAL = 3.5;
const COLS = 5;

export const SpawnerSystem = createPlugin({
  name: 'SpawnerSystem' as const,

  onUpdate(api: EngineAPI<GwenServices>, dt: number) {
    spawnTimer += dt;
    if (spawnTimer < WAVE_INTERVAL) return;
    spawnTimer = 0;

    // Vague de 5 ennemis — EnemyUI attachée à chacun
    for (let i = 0; i < COLS; i++) {
      const x = 60 + i * ((480 - 120) / (COLS - 1));
      const enemyId = api.prefabs.instantiate('Enemy', x, -30 - Math.random() * 40);
      if (enemyId !== undefined) {
        api.addComponent(enemyId, UIComponent, { uiName: 'EnemyUI' });
      }
    }
  },
});
