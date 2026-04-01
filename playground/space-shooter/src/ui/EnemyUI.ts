import { defineUI } from '@gwenengine/core';
import { Position, Health } from '../components';

/**
 * EnemyUI — Rendu complet d'un ennemi.
 */
export const EnemyUI = defineUI({
  name: 'EnemyUI',

  render(api, id) {
    const pos = api.getComponent(id, Position);
    const health = api.getComponent(id, Health);
    if (!pos || !health) return;

    const { ctx } = api.services.get('renderer');

    ctx.save();
    ctx.translate(pos.x, pos.y);

    // Sprite ennemi
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

    // Détail central
    ctx.fillStyle = 'rgba(255,180,180,0.5)';
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.lineTo(-5, -4);
    ctx.lineTo(0, 0);
    ctx.lineTo(5, -4);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  },
});
