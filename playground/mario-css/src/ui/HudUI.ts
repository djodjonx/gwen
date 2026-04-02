import { defineUI } from '@gwenjs/core';

/**
 * HudUI — affiche le score via HtmlUIPlugin.
 * Monté sur une entité HUD dédiée dans MainScene.
 */
export const HudUI = defineUI('HudUI', () => ({
  onMount(api, entityId) {
    api.services.get('htmlUI').mount(
      entityId,
      `
      <style>
        .mario-hud {
          position: fixed;
          top: 0; left: 50%;
          transform: translateX(-50%);
          width: 800px;
          display: flex;
          justify-content: space-between;
          padding: 8px 16px;
          font-family: 'Courier New', Courier, monospace;
          font-size: 12px;
          font-weight: bold;
          color: #fff;
          text-shadow: 2px 2px 0 #000;
          pointer-events: none;
          z-index: 200;
          background: linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 100%);
          letter-spacing: 1px;
        }
      </style>
      <div class="mario-hud">
        <span id="hud-score">SCORE: 000000</span>
        <span id="hud-world">WORLD 1-1</span>
        <span id="hud-status">♥ ♥ ♥</span>
      </div>
    `,
    );
  },

  render() {
    // Les mises à jour sont faites depuis MainScene via htmlUI.text()
  },

  onUnmount(api, entityId) {
    api.services.get('htmlUI').unmount(entityId);
  },
}));
