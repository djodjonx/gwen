import { defineUI } from '@gwen/engine-core';
import { Position, Health, Tag } from '../components';

/**
 * PlayerUI — Indicateur de vie affiché sous le vaisseau du joueur.
 *
 * Rendu Canvas2D pur — positionné en coordonnées monde, sous le vaisseau.
 * Pas de DOM : l'UI suit le joueur à chaque frame.
 *
 * Affiche :
 *  - Icônes cœur ♥ colorés selon les HP restants
 *  - Barre de vitalité avec dégradé vert → rouge
 */
export const PlayerUI = defineUI<GwenServices>({
  name: 'PlayerUI',

  // Pas de onMount — rien à allouer pour Canvas2D

  render(api, entityId) {
    const renderer = api.services.get('renderer');
    const pos      = api.getComponent(entityId, Position);
    const health   = api.getComponent(entityId, Health);
    if (!pos || !health) return;

    const { ctx } = renderer;
    const maxHp   = 3;
    const hp      = Math.max(0, health.hp);
    const ratio   = hp / maxHp;

    ctx.save();
    ctx.translate(pos.x, pos.y);

    // ── Barre de vie ──────────────────────────────────────────────────────
    const barW  = 36;
    const barH  = 4;
    const barX  = -barW / 2;
    const barY  = 22; // sous le vaisseau

    // Fond sombre
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

    // Barre vide
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barW, barH);

    // Barre remplie — dégradé vert → orange → rouge selon HP
    const barColor = ratio > 0.6 ? '#4fffb0' : ratio > 0.3 ? '#ffe600' : '#ff4444';
    ctx.shadowColor = barColor;
    ctx.shadowBlur  = 6;
    ctx.fillStyle   = barColor;
    ctx.fillRect(barX, barY, barW * ratio, barH);
    ctx.shadowBlur  = 0;

    // ── Icônes HP ─────────────────────────────────────────────────────────
    ctx.font      = '10px monospace';
    ctx.textAlign = 'center';
    let hearts = '';
    for (let i = 0; i < maxHp; i++) {
      hearts += i < hp ? '♥' : '♡';
    }
    ctx.fillStyle   = hp > 0 ? '#ff6b6b' : '#555';
    ctx.shadowColor = '#ff6b6b';
    ctx.shadowBlur  = hp > 0 ? 4 : 0;
    ctx.fillText(hearts, 0, barY + barH + 11);
    ctx.shadowBlur = 0;

    ctx.restore();
  },

  // Pas de onUnmount — rien à nettoyer
});

