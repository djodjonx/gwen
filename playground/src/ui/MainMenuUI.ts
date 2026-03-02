import { defineUI } from '@gwen/engine-core';

/**
 * MainMenuUI — Rendu complet du menu principal.
 *
 * Gère :
 *  - Fond + étoiles parallax
 *  - Titre avec halo
 *  - Texte clignotant "PRESS SPACE"
 *  - Contrôles en bas
 *
 * L'état de clignotement est local à ce module (une seule instance du menu).
 */
let blink  = true;
let blinkT = 0;

export const MainMenuUI = defineUI<GwenServices>({
  name: 'MainMenuUI',

  onMount() {
    blink  = true;
    blinkT = 0;
  },

  render(api, _entityId) {
    const renderer = api.services.get('renderer');
    const ctx      = renderer.ctx;
    const W        = renderer.logicalWidth;
    const H        = renderer.logicalHeight;

    // ── Fond ──────────────────────────────────────────────────────────────
    ctx.fillStyle = '#000814';
    ctx.fillRect(0, 0, W, H);

    // ── Étoiles parallax ─────────────────────────────────────────────────
    const t = Date.now() / 1000;
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    for (let i = 0; i < 40; i++) {
      const sx = (Math.sin(i * 7.3 + 1) * 0.5 + 0.5) * W;
      const sy = ((Math.sin(i * 3.7) * 0.5 + 0.5) * H + t * (12 + i % 18)) % H;
      ctx.fillRect(sx, sy, 1.2, 1.2);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (let i = 0; i < 20; i++) {
      const sx = (Math.sin(i * 13.1 + 5) * 0.5 + 0.5) * W;
      const sy = ((Math.cos(i * 4.9) * 0.5 + 0.5) * H + t * (28 + i % 15)) % H;
      ctx.fillRect(sx, sy, 1.8, 1.8);
    }

    // ── Titre ─────────────────────────────────────────────────────────────
    ctx.textAlign   = 'center';
    ctx.shadowColor = '#4fffb0';
    ctx.shadowBlur  = 20;
    ctx.fillStyle   = '#4fffb0';
    ctx.font        = 'bold 38px "Courier New", monospace';
    ctx.fillText('SPACE SHOOTER', W / 2, H / 2 - 60);

    // ── Sous-titre ────────────────────────────────────────────────────────
    ctx.shadowBlur = 0;
    ctx.fillStyle  = '#556';
    ctx.font       = '14px "Courier New", monospace';
    ctx.fillText('powered by GWEN engine', W / 2, H / 2 - 28);

    // ── Blink "PRESS SPACE" ───────────────────────────────────────────────
    // Mise à jour de l'état de clignotement basée sur le temps réel
    const now = Date.now() / 1000;
    if (now - blinkT > 0.55) { blink = !blink; blinkT = now; }

    if (blink) {
      ctx.fillStyle   = '#ffe600';
      ctx.shadowColor = '#ffe600';
      ctx.shadowBlur  = 8;
      ctx.font        = 'bold 17px "Courier New", monospace';
      ctx.fillText('[ PRESS SPACE TO START ]', W / 2, H / 2 + 28);
    }

    // ── Contrôles ─────────────────────────────────────────────────────────
    ctx.shadowBlur = 0;
    ctx.fillStyle  = '#445';
    ctx.font       = '12px "Courier New", monospace';
    ctx.fillText('WASD / Arrows : move    Space : shoot', W / 2, H / 2 + 72);
  },
});

