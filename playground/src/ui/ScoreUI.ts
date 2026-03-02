import { defineUI } from '@gwen/engine-core';
import { Score } from '../components';

/**
 * HUD Score + Vies — rendu directement sur le canvas 2D.
 *
 * Utilise api.services.get('renderer') pour dessiner via Canvas2DRenderer.
 * Aucune dépendance au DOM — pattern agnostique defineUI.
 */
export const ScoreUI = defineUI<GwenServices>({
  name: 'ScoreUI',

  // Pas de onMount — rien à allouer pour du canvas 2D

  render(api, entityId) {
    const renderer = api.services.get('renderer');
    const score    = api.getComponent(entityId, Score);
    if (!score) return;

    const { ctx, logicalWidth } = renderer;

    ctx.save();
    ctx.textAlign = 'center';

    // Score
    ctx.fillStyle  = '#4fffb0';
    ctx.font       = 'bold 20px "Courier New", monospace';
    ctx.shadowColor = '#4fffb0';
    ctx.shadowBlur  = 8;
    ctx.fillText(`SCORE: ${score.value}`, logicalWidth / 2, 28);

    // Vies
    ctx.fillStyle   = '#ff6b6b';
    ctx.shadowColor = '#ff6b6b';
    ctx.shadowBlur  = 4;
    ctx.font        = '14px "Courier New", monospace';
    ctx.fillText('♥ '.repeat(Math.max(0, score.lives)).trim(), logicalWidth / 2, 48);

    ctx.restore();
  },

  // Pas de onUnmount — rien à nettoyer pour du canvas 2D
});
