import type { TsPlugin, EngineAPI } from '@gwen/engine-core';

/**
 * MainScene — Scène principale de votre jeu.
 * Implémentez votre logique dans onUpdate() et votre rendu dans onRender().
 */
export class MainScene implements TsPlugin {
  readonly name = 'MainScene';

  private entities: number[] = [];

  onInit(api: EngineAPI): void {
    // Créer quelques entités de démo
    for (let i = 0; i < 5; i++) {
      const id = api.createEntity();
      this.entities.push(id as number);
    }
    console.log(`[MainScene] Initialized with ${this.entities.length} entities`);
  }

  onUpdate(_api: EngineAPI, _dt: number): void {
    // Votre logique de jeu ici
    // _dt = delta time en secondes
  }

  onRender(_api: EngineAPI): void {
    // Votre rendu ici
    // Utilisez Canvas2DRenderer via api.services.get('Canvas2DRenderer')
  }

  onDestroy(_api: EngineAPI): void {
    console.log('[MainScene] Destroyed');
  }
}
