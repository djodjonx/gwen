import { defineUI } from '@gwen/engine-core';
import { Position, Health } from '../components';

/**
 * EnemyUI — Petite barre de vie affichée au dessus de chaque ennemi.
 *
 * Rendu Canvas2D pur — positionné en coordonnées monde, au dessus de l'ennemi.
 * Attachée à chaque entité enemy via UIComponent { uiName: 'EnemyUI' }.
 *
 * Affiche :
 *  - Barre de vie fine (rouge → orange) uniquement si hp < maxHp
 *  - Nombre de HP restants si > 1
 */
export const EnemyUI = defineUI<GwenServices>({
  name: 'EnemyUI',

  render(api, entityId) {
    const renderer = api.services.get('renderer');
    const pos      = api.getComponent(entityId, Position);
    const health   = api.getComponent(entityId, Health);
    if (!pos || !health) return;

    const maxHp = 3; // les ennemis futurs pourront avoir plus de HP
    const hp    = Math.max(0, health.hp);
    const ratio = hp / maxHp;

    // Ne rien afficher si l'ennemi est à pleine vie (pas de bruit visuel inutile)
    if (ratio >= 1) return;

    const { ctx } = renderer;

    ctx.save();
    ctx.translate(pos.x, pos.y);

    // ── Barre de vie fine ─────────────────────────────────────────────────
    const barW = 28;
    const barH = 3;
    const barX = -barW / 2;
    const barY = -22; // au dessus de l'ennemi

    // Fond
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

    // Fond vide
    ctx.fillStyle = '#4a0000';
    ctx.fillRect(barX, barY, barW, barH);

    // Remplissage — rouge → orange
    const barColor = ratio > 0.5 ? '#ff8800' : '#ff3333';
    ctx.shadowColor = barColor;
    ctx.shadowBlur  = 5;
    ctx.fillStyle   = barColor;
    ctx.fillRect(barX, barY, barW * ratio, barH);
    ctx.shadowBlur  = 0;

    // ── HP numérique si > 1 ───────────────────────────────────────────────
    if (hp > 1) {
      ctx.font        = 'bold 8px monospace';
      ctx.textAlign   = 'center';
      ctx.fillStyle   = '#ffcccc';
      ctx.shadowColor = '#ff3333';
      ctx.shadowBlur  = 3;
      ctx.fillText(`${hp}`, 0, barY - 3);
      ctx.shadowBlur  = 0;
    }

    ctx.restore();
  },
});

