/**
 * Scène : Écran principal (menu)
 */
import type { Scene } from '@gwen/engine-core';
import type { EngineAPI } from '@gwen/engine-core';
import type { SceneManager } from '@gwen/engine-core';

export class MainMenuScene implements Scene {
  readonly name = 'MainMenu';

  private ctx: CanvasRenderingContext2D | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private scenes: SceneManager;

  constructor(scenes: SceneManager) {
    this.scenes = scenes;
  }

  onEnter(_api: EngineAPI): void {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas?.getContext('2d') ?? null;

    // Appuyer sur ESPACE démarre le jeu
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        this.scenes.loadScene('Game');
      }
    };
    window.addEventListener('keydown', this.keyHandler);
    this.updateHUD(0, 3);
  }

  onUpdate(_api: EngineAPI, _dt: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.canvas) return;

    const W = this.canvas.width;
    const H = this.canvas.height;

    ctx.fillStyle = '#000814';
    ctx.fillRect(0, 0, W, H);

    // Titre
    ctx.fillStyle = '#4fffb0';
    ctx.font = 'bold 36px "Courier New"';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#4fffb0';
    ctx.shadowBlur = 20;
    ctx.fillText('SPACE SHOOTER', W / 2, H / 2 - 60);

    ctx.shadowBlur = 0;
    ctx.font = '16px "Courier New"';
    ctx.fillStyle = '#aaa';
    ctx.fillText('built with GWEN engine', W / 2, H / 2 - 30);

    // Clignotement "PRESS SPACE"
    if (Math.floor(Date.now() / 600) % 2 === 0) {
      ctx.fillStyle = '#ffe600';
      ctx.font = '18px "Courier New"';
      ctx.fillText('[ PRESS SPACE TO START ]', W / 2, H / 2 + 30);
    }

    // Contrôles
    ctx.fillStyle = '#555';
    ctx.font = '12px "Courier New"';
    ctx.fillText('← → : Move    SPACE : Shoot', W / 2, H / 2 + 80);
  }

  onExit(_api: EngineAPI): void {
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
  }

  private updateHUD(score: number, lives: number): void {
    const el = document.getElementById('score');
    const livesEl = document.getElementById('lives');
    if (el) el.textContent = `SCORE: ${score}`;
    if (livesEl) livesEl.textContent = '♥ '.repeat(lives).trim();
  }
}
