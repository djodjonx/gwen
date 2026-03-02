import { defineUI } from '@gwen/engine-core';
import { drawStars } from './helpers/drawStars';

export const MainMenuUI = defineUI<GwenServices>('MainMenuUI', () => {
  // État local en closure — pas de variables globales
  let blink  = true;
  let blinkT = 0;

  return {
    onMount() {
      blink  = true;
      blinkT = 0;
    },

    render(api, _entityId) {
      const renderer = api.services.get('renderer');
      const ctx      = renderer.ctx;
      const W        = renderer.logicalWidth;
      const H        = renderer.logicalHeight;

      // ── Fond ────────────────────────────────────────────────────────────
      ctx.fillStyle = '#000814';
      ctx.fillRect(0, 0, W, H);

      // ── Étoiles parallax ────────────────────────────────────────────────
      drawStars(ctx, W, H);

      // ── Titre ───────────────────────────────────────────────────────────
      ctx.textAlign   = 'center';
      ctx.shadowColor = '#4fffb0';
      ctx.shadowBlur  = 20;
      ctx.fillStyle   = '#4fffb0';
      ctx.font        = 'bold 38px "Courier New", monospace';
      ctx.fillText('SPACE SHOOTER', W / 2, H / 2 - 60);

      // ── Sous-titre ──────────────────────────────────────────────────────
      ctx.shadowBlur = 0;
      ctx.fillStyle  = '#556';
      ctx.font       = '14px "Courier New", monospace';
      ctx.fillText('powered by GWEN engine', W / 2, H / 2 - 28);

      // ── Blink "PRESS SPACE" ─────────────────────────────────────────────
      const now = Date.now() / 1000;
      if (now - blinkT > 0.55) { blink = !blink; blinkT = now; }

      if (blink) {
        ctx.fillStyle   = '#ffe600';
        ctx.shadowColor = '#ffe600';
        ctx.shadowBlur  = 8;
        ctx.font        = 'bold 17px "Courier New", monospace';
        ctx.fillText('[ PRESS SPACE TO START ]', W / 2, H / 2 + 28);
      }

      // ── Contrôles ───────────────────────────────────────────────────────
      ctx.shadowBlur = 0;
      ctx.fillStyle  = '#445';
      ctx.font       = '12px "Courier New", monospace';
      ctx.fillText('WASD / Arrows : move    Space : shoot', W / 2, H / 2 + 72);
    },
  };
});
