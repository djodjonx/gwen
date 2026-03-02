import { defineUI } from '@gwen/engine-core';
import { drawStars } from './helpers/drawStars';

/**
 * BackgroundUI — Clear canvas + étoiles parallax.
 * Première UI enregistrée → dessinée en premier → sous tout le reste.
 */
export const BackgroundUI = defineUI<GwenServices>({
  name: 'BackgroundUI',

  render(api, _entityId) {
    const { ctx, logicalWidth: W, logicalHeight: H } = api.services.get('renderer');

    // Clear
    ctx.fillStyle = '#000814';
    ctx.fillRect(0, 0, W, H);

    // Étoiles parallax
    drawStars(ctx, W, H);
  },
});

