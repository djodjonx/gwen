import { defineSystem, onRender, useQuery } from '@gwenjs/core';
import { useCanvas2D } from '@gwenjs/renderer-canvas2d';
import {
  Position,
  Velocity,
  Health,
  PlayerTag,
  EnemyTag,
  PlayerBulletTag,
  EnemyBulletTag,
} from '../components/index';
import { gameState } from '../gameState';

const CANVAS_W = 480;
const CANVAS_H = 640;

/** Parallax star field — two layers, time-scrolled vertically. */
function drawStars(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  const t = Date.now() / 1000;

  // Slow, dim layer
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  for (let i = 0; i < 40; i++) {
    const sx = (Math.sin(i * 7.3 + 1) * 0.5 + 0.5) * CANVAS_W;
    const sy = ((Math.sin(i * 3.7) * 0.5 + 0.5) * CANVAS_H + t * (12 + (i % 18))) % CANVAS_H;
    ctx.fillRect(sx, sy, 1.2, 1.2);
  }

  // Fast, bright layer
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  for (let i = 0; i < 20; i++) {
    const sx = (Math.sin(i * 13.1 + 5) * 0.5 + 0.5) * CANVAS_W;
    const sy = ((Math.cos(i * 4.9) * 0.5 + 0.5) * CANVAS_H + t * (28 + (i % 15))) % CANVAS_H;
    ctx.fillRect(sx, sy, 1.8, 1.8);
  }

  ctx.restore();
}

/** Player ship — green diamond with animated thruster flame. */
function drawPlayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  vx: number,
  vy: number,
  invincible: boolean,
): void {
  ctx.save();

  if (invincible && Math.floor(Date.now() / 100) % 2 === 0) {
    ctx.globalAlpha = 0.35;
  }

  ctx.translate(x, y);

  const t = Date.now() / 1000;
  const speed = Math.abs(vy) + Math.abs(vx);
  const flameH = 8 + Math.sin(t * 18) * 4 + speed * 0.04;
  const flameW = 5 + Math.sin(t * 22 + 1) * 1.5;

  // Thruster glow
  const grad = ctx.createRadialGradient(0, 14, 0, 0, 14, flameH + 4);
  grad.addColorStop(0, 'rgba(255,180,0,0.7)');
  grad.addColorStop(0.5, 'rgba(255,80,0,0.3)');
  grad.addColorStop(1, 'rgba(255,40,0,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, 14 + flameH / 2, flameW + 3, flameH + 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Thruster flame
  ctx.fillStyle = 'rgba(255,160,40,0.85)';
  ctx.shadowColor = '#ff8800';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(-flameW, 12);
  ctx.lineTo(0, 12 + flameH);
  ctx.lineTo(flameW, 12);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;

  // Hull
  ctx.fillStyle = '#4fffb0';
  ctx.shadowColor = '#4fffb0';
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.lineTo(-13, 14);
  ctx.lineTo(0, 8);
  ctx.lineTo(13, 14);
  ctx.closePath();
  ctx.fill();

  // Central detail
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(-4, 6);
  ctx.lineTo(0, 2);
  ctx.lineTo(4, 6);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/** Enemy ship — downward-pointing red triangle with glow. */
function drawEnemy(ctx: CanvasRenderingContext2D, x: number, y: number, hp: number): void {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = '#ff6b6b';
  ctx.shadowColor = '#ff6b6b';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(0, 14);
  ctx.lineTo(-14, -10);
  ctx.lineTo(0, -4);
  ctx.lineTo(14, -10);
  ctx.closePath();
  ctx.fill();

  // Brighter inner highlight for multi-HP enemies
  if (hp > 1) {
    ctx.fillStyle = 'rgba(255,180,180,0.5)';
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.lineTo(-5, -4);
    ctx.lineTo(0, 0);
    ctx.lineTo(5, -4);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

/** Player bullet — yellow glowing bolt with bright white core. */
function drawPlayerBullet(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = '#ffe600';
  ctx.shadowColor = '#ffe600';
  ctx.shadowBlur = 10;
  ctx.fillRect(-2, -9, 4, 18);

  // White core
  ctx.shadowBlur = 4;
  ctx.fillStyle = '#fff';
  ctx.fillRect(-1, -4, 2, 8);

  ctx.restore();
}

/** Enemy bullet — pulsating red orb with white centre. */
function drawEnemyBullet(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);

  const pulse = 0.85 + Math.sin(Date.now() / 80) * 0.15;
  ctx.scale(pulse, pulse);

  ctx.fillStyle = '#ff4444';
  ctx.shadowColor = '#ff2222';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,200,200,0.9)';
  ctx.beginPath();
  ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/** HUD — score (top-left), lives (top-right), and game-over overlay. */
function drawHUD(ctx: CanvasRenderingContext2D): void {
  ctx.save();

  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = '#e0e0ff';
  ctx.textAlign = 'left';
  ctx.fillText(`SCORE  ${gameState.score}`, 12, 28);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#ff6688';
  ctx.fillText('♥ '.repeat(Math.max(0, gameState.lives)).trim(), CANVAS_W - 12, 28);

  if (gameState.gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.textAlign = 'center';
    ctx.font = 'bold 40px monospace';
    ctx.fillStyle = '#ff4444';
    ctx.fillText('GAME OVER', CANVAS_W / 2, CANVAS_H / 2 - 24);

    ctx.font = '20px monospace';
    ctx.fillStyle = '#e0e0ff';
    ctx.fillText(`Final Score: ${gameState.score}`, CANVAS_W / 2, CANVAS_H / 2 + 20);

    ctx.font = '14px monospace';
    ctx.fillStyle = '#aaaacc';
    ctx.fillText('Reload to play again', CANVAS_W / 2, CANVAS_H / 2 + 52);
  }

  ctx.restore();
}

export const RenderSystem = defineSystem(function RenderSystem() {
  const renderer = useCanvas2D();

  const playerEntities = useQuery([Position, Health, PlayerTag]);
  const enemyEntities = useQuery([Position, Health, EnemyTag]);
  const playerBullets = useQuery([Position, PlayerBulletTag]);
  const enemyBullets = useQuery([Position, EnemyBulletTag]);

  onRender(() => {
    const ctx = renderer.ctx;

    // ── Background ────────────────────────────────────────────────────────────
    drawStars(ctx);

    // ── Player bullets (under ships) ──────────────────────────────────────────
    for (const e of playerBullets) {
      const pos = e.get(Position);
      if (!pos) continue;
      drawPlayerBullet(ctx, pos.x, pos.y);
    }

    // ── Enemy bullets (under ships) ───────────────────────────────────────────
    for (const e of enemyBullets) {
      const pos = e.get(Position);
      if (!pos) continue;
      drawEnemyBullet(ctx, pos.x, pos.y);
    }

    // ── Enemies ───────────────────────────────────────────────────────────────
    for (const e of enemyEntities) {
      const pos = e.get(Position);
      const hp = e.get(Health);
      if (!pos || !hp) continue;
      drawEnemy(ctx, pos.x, pos.y, hp.hp);
    }

    // ── Player (top layer) ────────────────────────────────────────────────────
    for (const e of playerEntities) {
      const pos = e.get(Position);
      if (!pos) continue;
      const vel = e.get(Velocity);
      drawPlayer(ctx, pos.x, pos.y, vel?.x ?? 0, vel?.y ?? 0, gameState.invincibleTimer > 0);
    }

    // ── HUD ───────────────────────────────────────────────────────────────────
    drawHUD(ctx);
  });
});
