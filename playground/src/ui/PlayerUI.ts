import { defineUI } from '@gwen/engine-core';
import type { EntityId } from '@gwen/engine-core';
import { Position, Health, Velocity } from '../components';

// ── Helpers ───────────────────────────────────────────────────────────────────

function drawHealthBar(
  ctx: CanvasRenderingContext2D,
  hp: number,
  maxHp: number,
  yOffset: number,
  width = 36,
) {
  const ratio  = Math.max(0, hp) / maxHp;
  const x      = -width / 2;
  const color  = ratio > 0.6 ? '#4fffb0' : ratio > 0.3 ? '#ffe600' : '#ff4444';

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x - 1, yOffset - 1, width + 2, 6);
  ctx.fillStyle = '#222';
  ctx.fillRect(x, yOffset, width, 4);
  ctx.shadowColor = color;
  ctx.shadowBlur  = 5;
  ctx.fillStyle   = color;
  ctx.fillRect(x, yOffset, width * ratio, 4);
  ctx.shadowBlur  = 0;
}

// ── PlayerUI ──────────────────────────────────────────────────────────────────

/**
 * PlayerUI — Rendu complet du vaisseau joueur.
 *
 * Contient :
 *  - Flamme thruster animée (réactive à la vitesse)
 *  - Sprite géométrique avec halo cyan
 *  - Barre de vie + icônes cœur sous le vaisseau
 */
export const PlayerUI = defineUI<GwenServices>({
  name: 'PlayerUI',

  render(api, id) {
    const pos    = api.getComponent(id, Position);
    const health = api.getComponent(id, Health);
    const vel    = api.getComponent(id, Velocity);
    if (!pos || !health) return;

    const { ctx } = api.services.get('renderer');
    const t       = Date.now() / 1000;
    const hp      = Math.max(0, health.hp);

    ctx.save();
    ctx.translate(pos.x, pos.y);

    // ── Thruster ──────────────────────────────────────────────────────────
    const speed    = Math.abs(vel?.vy ?? 0) + Math.abs(vel?.vx ?? 0);
    const flameH   = 8 + Math.sin(t * 18) * 4 + speed * 0.04;
    const flameW   = 5 + Math.sin(t * 22 + 1) * 1.5;

    // Halo externe
    const grad = ctx.createRadialGradient(0, 14, 0, 0, 14, flameH + 4);
    grad.addColorStop(0,   'rgba(255,180,0,0.7)');
    grad.addColorStop(0.5, 'rgba(255,80,0,0.3)');
    grad.addColorStop(1,   'rgba(255,40,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 14 + flameH / 2, flameW + 3, flameH + 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Flamme principale
    ctx.fillStyle   = 'rgba(255,160,40,0.85)';
    ctx.shadowColor = '#ff8800';
    ctx.shadowBlur  = 8;
    ctx.beginPath();
    ctx.moveTo(-flameW, 12);
    ctx.lineTo(0, 12 + flameH);
    ctx.lineTo(flameW, 12);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    // ── Sprite vaisseau ───────────────────────────────────────────────────
    ctx.fillStyle   = '#4fffb0';
    ctx.shadowColor = '#4fffb0';
    ctx.shadowBlur  = 16;
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(-13, 14);
    ctx.lineTo(0, 8);
    ctx.lineTo(13, 14);
    ctx.closePath();
    ctx.fill();

    // Détail central
    ctx.fillStyle  = 'rgba(255,255,255,0.6)';
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(-4, 6);
    ctx.lineTo(0, 2);
    ctx.lineTo(4, 6);
    ctx.closePath();
    ctx.fill();

    // ── Barre de vie ──────────────────────────────────────────────────────
    drawHealthBar(ctx, hp, 3, 22);

    // ── Icônes cœur ───────────────────────────────────────────────────────
    ctx.font      = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle   = hp > 0 ? '#ff6b6b' : '#444';
    ctx.shadowColor = '#ff6b6b';
    ctx.shadowBlur  = hp > 0 ? 5 : 0;
    const hearts = Array.from({ length: 3 }, (_, i) => i < hp ? '♥' : '♡').join(' ');
    ctx.fillText(hearts, 0, 40);
    ctx.shadowBlur = 0;

    ctx.restore();
  },
});

