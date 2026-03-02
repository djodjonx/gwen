import { defineUI } from '@gwen/engine-core';
import type { EntityId } from '@gwen/engine-core';
import { Position, Health } from '../components';

// Phase d'oscillation propre à chaque entité — initialisée dans onMount
const phaseMap = new Map<EntityId, number>();

/**
 * EnemyUI — Rendu complet d'un ennemi.
 *
 * Contient :
 *  - Sprite géométrique avec légère rotation oscillante (onMount initialise la phase)
 *  - Halo rouge pulsant
 */
export const EnemyUI = defineUI<GwenServices>({
  name: 'EnemyUI',

  onMount(_api, id) {
    phaseMap.set(id, Math.random() * Math.PI * 2);
  },

  render(api, id) {
    const pos    = api.getComponent(id, Position);
    const health = api.getComponent(id, Health);
    if (!pos || !health) return;

    const { ctx } = api.services.get('renderer');
    const phase   = phaseMap.get(id) ?? 0;
    const t       = Date.now() / 1000;

    // Oscillation lente propre à l'entité
    const angle = Math.sin(t * 1.4 + phase) * 0.12;

    ctx.save();
    ctx.translate(pos.x, pos.y);

    ctx.shadowColor = '#ff6b6b';
    ctx.shadowBlur  = 10;

    ctx.rotate(angle);
    ctx.fillStyle = '#ff6b6b';
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
});
