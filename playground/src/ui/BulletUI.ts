import { defineUI } from '@gwen/engine-core';
import { Position, Tag } from '../components';

/**
 * BulletUI — Rendu des balles joueur et ennemi.
 * Enregistrée avant PlayerUI/EnemyUI → dessinée sous les vaisseaux.
 */
export const BulletUI = defineUI<GwenServices>({
  name: 'BulletUI',

  render(api, id) {
    const pos = api.getComponent(id, Position);
    const tag = api.getComponent(id, Tag);
    if (!pos || !tag) return;

    const { ctx } = api.services.get('renderer');

    ctx.save();
    ctx.translate(pos.x, pos.y);

    if (tag.type === 'bullet') {
      // Balle joueur — trait jaune avec halo
      ctx.fillStyle   = '#ffe600';
      ctx.shadowColor = '#ffe600';
      ctx.shadowBlur  = 10;
      ctx.fillRect(-2, -9, 4, 18);

      // Cœur lumineux au centre
      ctx.shadowBlur  = 4;
      ctx.fillStyle   = '#fff';
      ctx.fillRect(-1, -4, 2, 8);
    } else {
      // Balle ennemi — orbe rouge pulsante
      const pulse = 0.85 + Math.sin(Date.now() / 80) * 0.15;
      ctx.scale(pulse, pulse);
      ctx.fillStyle   = '#ff4444';
      ctx.shadowColor = '#ff2222';
      ctx.shadowBlur  = 12;
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      // Point blanc au centre
      ctx.shadowBlur = 0;
      ctx.fillStyle  = 'rgba(255,200,200,0.9)';
      ctx.beginPath();
      ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  },
});

