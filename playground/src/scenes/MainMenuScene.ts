import type { Scene, EngineAPI, SceneManager } from '@gwen/engine-core';
import type { GwenServices } from '../../gwen.config';
import type { KeyboardInput } from '@gwen/plugin-input';

export class MainMenuScene implements Scene {
  readonly name = 'MainMenu';

  private keyboard!: KeyboardInput;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private blink = true;
  private blinkT = 0;

  constructor(private scenes: SceneManager) {}

  onEnter(api: EngineAPI<GwenServices>) {
    this.keyboard = api.services.get('keyboard');
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas?.getContext('2d') ?? null;
    this.blink = true;
    this.blinkT = 0;
  }

  onUpdate(_api: EngineAPI<GwenServices>, dt: number) {
    this.blinkT += dt;
    if (this.blinkT > 0.55) { this.blink = !this.blink; this.blinkT = 0; }
    if (this.keyboard?.isJustPressed('Space')) this.scenes.loadScene('Game');
  }

  onRender() {
    const ctx = this.ctx;
    if (!ctx || !this.canvas) return;
    const W = this.canvas.width, H = this.canvas.height;

    ctx.fillStyle = '#000814';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#4fffb0';
    ctx.shadowColor = '#4fffb0'; ctx.shadowBlur = 20;
    ctx.font = 'bold 38px "Courier New"';
    ctx.fillText('SPACE SHOOTER', W / 2, H / 2 - 60);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#888';
    ctx.font = '15px "Courier New"';
    ctx.fillText('powered by GWEN engine', W / 2, H / 2 - 28);

    if (this.blink) {
      ctx.fillStyle = '#ffe600';
      ctx.font = 'bold 18px "Courier New"';
      ctx.fillText('[ PRESS SPACE TO START ]', W / 2, H / 2 + 30);
    }

    ctx.fillStyle = '#444';
    ctx.font = '12px "Courier New"';
    ctx.fillText('WASD / Arrows : move    Space : shoot', W / 2, H / 2 + 75);
  }

  onExit() {}
}

