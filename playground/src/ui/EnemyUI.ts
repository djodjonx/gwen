import { defineUI } from '@gwen/engine-core';
import type { EntityId } from '@gwen/engine-core';
import { Position, Health } from '../components';

/**
 * EnemyUI — Rendu complet d'un ennemi.
 *
 * Forme factory : phaseMap en closure locale — pas de variable globale.
 * Chaque entité a sa phase propre, nettoyée dans onUnmount.
 */
export const EnemyUI = defineUI<GwenServices>('EnemyUI', () => {
  // État local en closure — jamais partagé entre scènes
  const phaseMap = new Map<EntityId, number>();

  return {
    onMount(_api, id) {
      phaseMap.set(id, Math.random() * Math.PI * 2);
    },

    render(api, id) {
      const pos    = api.getComponent(id, Position);
      const health = api.getComponent(id, Health);
      if (!pos || !health) return;

      const { ctx } = api.services.get('renderer');

      ctx.save();
      ctx.translate(pos.x, pos.y);

      // Sprite ennemi
      ctx.fillStyle   = '#ff6b6b';
      ctx.shadowColor = '#ff6b6b';
      ctx.shadowBlur  = 10;
      ctx.beginPath();
      ctx.moveTo(0, 14);
      ctx.lineTo(-14, -10);
      ctx.lineTo(0, -4);
      ctx.lineTo(14, -10);
      ctx.closePath();
      ctx.fill();

      // Détail central
      ctx.fillStyle  = 'rgba(255,180,180,0.5)';
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

    onUnmount(_api, id) {
      phaseMap.delete(id);
    },
  };
});
