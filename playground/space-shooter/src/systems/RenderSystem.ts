import { defineSystem, onRender, useQuery } from '@gwenjs/core';
import { useCanvas2D } from '@gwenjs/renderer-canvas2d';
import {
  Position,
  Size,
  Health,
  Shooter,
  PlayerTag,
  EnemyTag,
  PlayerBulletTag,
  EnemyBulletTag,
} from '../components/index';
import { gameState } from '../gameState';

const CANVAS_W = 480;
const CANVAS_H = 640;

/** Draws a player ship (upward-pointing triangle with a cockpit accent). */
function drawPlayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  hw: number,
  hh: number,
  invincible: boolean,
): void {
  ctx.save();

  // Flash when invincible.
  if (invincible && Math.floor(Date.now() / 100) % 2 === 0) {
    ctx.globalAlpha = 0.35;
  }

  // Hull
  ctx.fillStyle = '#00d4ff';
  ctx.beginPath();
  ctx.moveTo(x, y - hh);
  ctx.lineTo(x - hw, y + hh);
  ctx.lineTo(x + hw, y + hh);
  ctx.closePath();
  ctx.fill();

  // Engine glow
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(x, y - hh * 0.4);
  ctx.lineTo(x - hw * 0.45, y + hh * 0.4);
  ctx.lineTo(x + hw * 0.45, y + hh * 0.4);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/** Draws an enemy ship — colour shifts from orange → red as health decreases. */
function drawEnemy(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  hw: number,
  hh: number,
  hp: number,
): void {
  ctx.save();
  ctx.fillStyle = hp > 1 ? '#ff6a00' : '#ff1a1a';
  ctx.strokeStyle = hp > 1 ? '#ffcc00' : '#ff6666';
  ctx.lineWidth = 1.5;

  // Hexagonal body
  const r = hw * 0.9;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Core dot
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x, y, hw * 0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/** Draws a player bullet as a bright cyan bolt. */
function drawPlayerBullet(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  hw: number,
  hh: number,
): void {
  ctx.save();
  ctx.fillStyle = '#ffe566';
  ctx.shadowColor = '#ffe566';
  ctx.shadowBlur = 6;
  ctx.fillRect(x - hw, y - hh, hw * 2, hh * 2);
  ctx.restore();
}

/** Draws an enemy bullet as a red plasma drop. */
function drawEnemyBullet(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  hw: number,
  hh: number,
): void {
  ctx.save();
  ctx.fillStyle = '#ff4444';
  ctx.shadowColor = '#ff2222';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.ellipse(x, y, hw, hh, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Renders the HUD: score, lives, and game-over overlay. */
function drawHUD(ctx: CanvasRenderingContext2D): void {
  ctx.save();

  // Score
  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = '#e0e0ff';
  ctx.textAlign = 'left';
  ctx.fillText(`SCORE  ${gameState.score}`, 12, 28);

  // Lives
  ctx.textAlign = 'right';
  const livesText = '♥ '.repeat(Math.max(0, gameState.lives)).trim();
  ctx.fillStyle = '#ff6688';
  ctx.fillText(livesText, CANVAS_W - 12, 28);

  if (gameState.gameOver) {
    // Dim overlay
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

  const playerEntities = useQuery([Position, Size, Health, PlayerTag]);
  const enemyEntities = useQuery([Position, Size, Health, EnemyTag]);
  const playerBullets = useQuery([Position, Size, PlayerBulletTag]);
  const enemyBullets = useQuery([Position, Size, EnemyBulletTag]);

  onRender(() => {
    const ctx = renderer.ctx;

    // ── Player ────────────────────────────────────────────────────────────────
    for (const e of playerEntities) {
      const pos = e.get(Position);
      const sz = e.get(Size);
      if (!pos || !sz) continue;
      drawPlayer(ctx, pos.x, pos.y, sz.w / 2, sz.h / 2, gameState.invincibleTimer > 0);
    }

    // ── Enemies ───────────────────────────────────────────────────────────────
    for (const e of enemyEntities) {
      const pos = e.get(Position);
      const sz = e.get(Size);
      const hp = e.get(Health);
      if (!pos || !sz || !hp) continue;
      drawEnemy(ctx, pos.x, pos.y, sz.w / 2, sz.h / 2, hp.hp);
    }

    // ── Player bullets ────────────────────────────────────────────────────────
    for (const e of playerBullets) {
      const pos = e.get(Position);
      const sz = e.get(Size);
      if (!pos || !sz) continue;
      drawPlayerBullet(ctx, pos.x, pos.y, sz.w / 2, sz.h / 2);
    }

    // ── Enemy bullets ─────────────────────────────────────────────────────────
    for (const e of enemyBullets) {
      const pos = e.get(Position);
      const sz = e.get(Size);
      if (!pos || !sz) continue;
      drawEnemyBullet(ctx, pos.x, pos.y, sz.w / 2, sz.h / 2);
    }

    // ── HUD ───────────────────────────────────────────────────────────────────
    drawHUD(ctx);
  });
});
