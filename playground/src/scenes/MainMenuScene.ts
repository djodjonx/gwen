/**
 * Scène : Écran principal (menu)
 *
 * Respecte la séparation logique/rendu du pattern TsPlugin :
 *  - onUpdate  → gestion d'état (blink timer, transitions)
 *  - onRender  → dessin Canvas2D uniquement
 */
import type { Scene, EngineAPI, SceneManager } from '@gwen/engine-core';
import type { KeyboardInput } from '@gwen/plugin-input';
import type { GwenServices } from '../../engine.config';

export class MainMenuScene implements Scene {
  readonly name = 'MainMenu';

  private ctx: CanvasRenderingContext2D | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private keyboard!: KeyboardInput;
  private scenes: SceneManager;

  /** Whether the "PRESS SPACE" label is currently visible (blink state). */
  private blinkVisible = true;
  /** Accumulated time (seconds) used for the blink timer. */
  private blinkTimer = 0;
  private static readonly BLINK_INTERVAL = 0.6; // seconds

  constructor(scenes: SceneManager) {
    this.scenes = scenes;
  }

  onEnter(api: EngineAPI<GwenServices>): void {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas?.getContext('2d') ?? null;
    this.blinkTimer = 0;
    this.blinkVisible = true;

    // Récupère le keyboard via le service locator — typé sans cast
    this.keyboard = api.services.get('keyboard');
    this.updateHUD(0, 3);
  }

  /** Logic only – no drawing here. */
  onUpdate(_api: EngineAPI<GwenServices>, dt: number): void {
    this.blinkTimer += dt;
    if (this.blinkTimer >= MainMenuScene.BLINK_INTERVAL) {
      this.blinkVisible = !this.blinkVisible;
      this.blinkTimer -= MainMenuScene.BLINK_INTERVAL;
    }

    // Démarrer le jeu quand Space est pressé — via KeyboardInput (plus de window.addEventListener)
    if (this.keyboard?.isJustPressed('Space')) {
      this.scenes.loadScene('Game');
    }
  }

  /** Rendering only – no state mutation here. */
  onRender(_api: EngineAPI<GwenServices>): void {
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

    // Clignotement "PRESS SPACE" (piloté par blinkVisible, pas par Date.now())
    if (this.blinkVisible) {
      ctx.fillStyle = '#ffe600';
      ctx.font = '18px "Courier New"';
      ctx.fillText('[ PRESS SPACE TO START ]', W / 2, H / 2 + 30);
    }

    // Contrôles
    ctx.fillStyle = '#555';
    ctx.font = '12px "Courier New"';
    ctx.fillText('arrow keys / WASD : Move    SPACE : Shoot', W / 2, H / 2 + 80);
  }

  onExit(_api: EngineAPI<GwenServices>): void {
    // Plus de removeEventListener — InputPlugin gère son propre cleanup
  }

  private updateHUD(score: number, lives: number): void {
    const el = document.getElementById('score');
    const livesEl = document.getElementById('lives');
    if (el) el.textContent = `SCORE: ${score}`;
    if (livesEl) livesEl.textContent = '♥ '.repeat(lives).trim();
  }
}
