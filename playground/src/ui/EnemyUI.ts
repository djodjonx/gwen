import { defineUI } from '@gwen/engine-core';
import type { EntityId } from '@gwen/engine-core';
import { Position, Health } from '../components';

// Phase d'oscillation propre à chaque entité — initialisée dans onMount
const phaseMap = new Map<EntityId, number>();

function drawHealthBar(
  ctx: CanvasRenderingContext2D,
  hp: number,
  maxHp: number,
  yOffset: number,
  width = 28,
) {
  const ratio  = Math.max(0, hp) / maxHp;
  const x      = -width / 2;
  const color  = ratio > 0.5 ? '#ff8800' : '#ff3333';

  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x - 1, yOffset - 1, width + 2, 5);
  ctx.fillStyle = '#4a0000';
  ctx.fillRect(x, yOffset, width, 3);
  ctx.shadowColor = color;
  ctx.shadowBlur  = 5;
  ctx.fillStyle   = color;
  ctx.fillRect(x, yOffset, width * ratio, 3);
  ctx.shadowBlur  = 0;
}

/**
 * EnemyUI — Rendu complet d'un ennemi.
 *
 * Contient :
 *  - Sprite géométrique avec légère rotation oscillante (onMount initialise la phase)
 *  - Halo rouge pulsant
 *  - Barre de vie au dessus si blessé (hp < maxHp)
 *  - Compteur HP numérique si hp > 1
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
    const hp      = Math.max(0, health.hp);
    const maxHp   = 3;

    // Oscillation lente propre à l'entité
    const angle = Math.sin(t * 1.4 + phase) * 0.12;
    // Pulsation du halo selon les dégâts
    const haloIntensity = hp < maxHp ? 0.5 + Math.sin(t * 6) * 0.3 : 0.25;

    ctx.save();
    ctx.translate(pos.x, pos.y);

    // ── Halo externe ──────────────────────────────────────────────────────
    ctx.shadowColor = '#ff6b6b';
    ctx.shadowBlur  = 10 + haloIntensity * 8;

    // ── Sprite ennemi (rotation oscillante) ───────────────────────────────
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

    // Reset rotation pour la barre de vie (toujours horizontale)
    ctx.rotate(-angle);

    // ── Barre de vie si blessé ────────────────────────────────────────────
    if (hp < maxHp) {
      drawHealthBar(ctx, hp, maxHp, -24);

      if (hp > 1) {
        ctx.font        = 'bold 8px monospace';
        ctx.textAlign   = 'center';
        ctx.fillStyle   = '#ffcccc';
        ctx.shadowColor = '#ff3333';
        ctx.shadowBlur  = 3;
        ctx.fillText(`${hp}`, 0, -27);
        ctx.shadowBlur  = 0;
      }
    }

    ctx.restore();
  },

  onUnmount(_api, id) {
    phaseMap.delete(id);
  },
});
