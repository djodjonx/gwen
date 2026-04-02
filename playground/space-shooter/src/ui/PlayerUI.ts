import { defineUI } from '@gwenjs/core';
import { Position, Velocity } from '../components';

/**
 * PlayerUI — Rendu complet du vaisseau joueur.
 *
 * Contient :
 *  - Flamme thruster animée (réactive à la vitesse)
 *  - Sprite géométrique avec halo cyan
 *  - Barre de vie + icônes cœur sous le vaisseau
 */
export const PlayerUI = defineUI({
  name: 'PlayerUI',

  render(api, id) {
    const pos = api.getComponent(id, Position);
    const vel = api.getComponent(id, Velocity);
    if (!pos) return;

    const { ctx } = api.services.get('renderer');
    const t = Date.now() / 1000;

    ctx.save();
    ctx.translate(pos.x, pos.y);

    // ── Thruster ──────────────────────────────────────────────────────────
    const speed = Math.abs(vel?.vy ?? 0) + Math.abs(vel?.vx ?? 0);
    const flameH = 8 + Math.sin(t * 18) * 4 + speed * 0.04;
    const flameW = 5 + Math.sin(t * 22 + 1) * 1.5;

    // Halo externe
    const grad = ctx.createRadialGradient(0, 14, 0, 0, 14, flameH + 4);
    grad.addColorStop(0, 'rgba(255,180,0,0.7)');
    grad.addColorStop(0.5, 'rgba(255,80,0,0.3)');
    grad.addColorStop(1, 'rgba(255,40,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 14 + flameH / 2, flameW + 3, flameH + 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Flamme principale
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

    // ── Sprite vaisseau ───────────────────────────────────────────────────
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

    // ── Détail central
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
  },
});
