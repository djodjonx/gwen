import { type EngineAPI } from '@gwen/engine-core';
import type { GwenPlugin } from '@gwen/engine-core';
import type { GwenServices } from '../../engine.config';

export class SpawnerSystem implements GwenPlugin<'SpawnerSystem'> {
  readonly name = 'SpawnerSystem' as const;
  private spawnTimer = 0;
  private spawnInterval = 2.5;

  onEnter(): void {
    this.spawnTimer = 0;
    this.spawnInterval = 2.5;
  }

  onUpdate(api: EngineAPI<GwenServices>, dt: number): void {
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      this.spawnInterval = Math.max(0.8, this.spawnInterval - 0.05);
      const x = 30 + Math.random() * (480 - 60);
      api.prefabs.instantiate('Enemy', x, -30);
    }
  }
}
