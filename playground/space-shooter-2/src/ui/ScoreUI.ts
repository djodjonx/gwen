import { defineUI } from '@djodjonx/gwen-engine-core';
import scoreHtml from './score.html?raw';
import { Score } from '../components';

/**
 * HUD Score + Vies — rendu via HtmlUIPlugin.
 *
 * Le template HTML/CSS est dans score.html (autocomplétion IDE complète).
 * Monté/démonté automatiquement via api.services.get('htmlUI').
 */
export const ScoreUI = defineUI({
  name: 'ScoreUI',

  onMount(api, entityId) {
    api.services.get('htmlUI').mount(entityId, scoreHtml);
  },

  render(api, entityId) {
    const score = api.getComponent(entityId, Score);
    if (!score) return;

    const ui = api.services.get('htmlUI');
    ui.text(entityId, 'hud-score', `SCORE: ${score.value}`);
    ui.text(entityId, 'hud-lives', '♥ '.repeat(Math.max(0, score.lives)).trim());
  },

  onUnmount(api, entityId) {
    api.services.get('htmlUI').unmount(entityId);
  },
});
