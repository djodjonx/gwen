import { type TsPlugin, type EngineAPI } from '@gwen/engine-core';

export class SpawnerSystem implements TsPlugin {
  readonly name = 'SpawnerSystem';
  private spawnTimer = 0;
  private spawnInterval = 2.5;

  onEnter(): void {
    this.spawnTimer = 0;
    this.spawnInterval = 2.5;
  }

  onUpdate(api: EngineAPI, dt: number): void {
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      this.spawnInterval = Math.max(0.8, this.spawnInterval - 0.05);
      const x = 30 + Math.random() * (480 - 60);
      api.prefabs.instantiate('Enemy', x, -30);
    }
  }
}
