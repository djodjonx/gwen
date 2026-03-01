import type { Scene, EngineAPI, SceneManager } from '@gwen/engine-core';
import type { KeyboardInput } from '@gwen/plugin-input';
import type { Canvas2DRenderer } from '@gwen/renderer-canvas2d';

export class MainMenuScene implements Scene {
  readonly name = 'MainMenu';

  private keyboard!: KeyboardInput;
  private renderer!: Canvas2DRenderer;
  private blink = true;
  private blinkT = 0;

  constructor(private scenes: SceneManager) {}

  onEnter(api: EngineAPI<GwenServices>) {
    this.keyboard = api.services.get('keyboard');
    this.renderer = api.services.get('renderer');
    this.blink = true;
    this.blinkT = 0;
  }

  onUpdate(_api: EngineAPI<GwenServices>, dt: number) {
    this.blinkT += dt;
    if (this.blinkT > 0.55) { this.blink = !this.blink; this.blinkT = 0; }
    if (this.keyboard?.isJustPressed('Space')) this.scenes.loadScene('Game');
  }

  onRender() {
    const ctx = this.renderer?.ctx;
    if (!ctx) return;
    const W = this.renderer.logicalWidth;
    const H = this.renderer.logicalHeight;

    // Fond
    ctx.fillStyle = '#000814';
    ctx.fillRect(0, 0, W, H);

    // Étoiles
    const t = Date.now() / 1000;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 60; i++) {
      const sx = (Math.sin(i * 7.3 + 1) * 0.5 + 0.5) * W;
      const sy = ((Math.sin(i * 3.7) * 0.5 + 0.5) * H + t * (15 + i % 25)) % H;
      ctx.fillRect(sx, sy, 1.5, 1.5);
    }

    // Titre
    ctx.textAlign = 'center';
    ctx.shadowColor = '#4fffb0'; ctx.shadowBlur = 20;
    ctx.fillStyle = '#4fffb0';
    ctx.font = 'bold 38px "Courier New", monospace';
    ctx.fillText('SPACE SHOOTER', W / 2, H / 2 - 60);

    // Sous-titre
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#556';
    ctx.font = '14px "Courier New", monospace';
    ctx.fillText('powered by GWEN engine', W / 2, H / 2 - 28);

    // Clignotant
    if (this.blink) {
      ctx.fillStyle = '#ffe600';
      ctx.shadowColor = '#ffe600'; ctx.shadowBlur = 8;
      ctx.font = 'bold 17px "Courier New", monospace';
      ctx.fillText('[ PRESS SPACE TO START ]', W / 2, H / 2 + 28);
    }

    // Contrôles
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#445';
    ctx.font = '12px "Courier New", monospace';
    ctx.fillText('WASD / Arrows : move    Space : shoot', W / 2, H / 2 + 72);
  }

  onExit() {}
}
