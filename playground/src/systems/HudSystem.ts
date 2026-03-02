import { defineUI, UIManager } from '@gwen/engine-core';
import type { EngineAPI } from '@gwen/engine-core';
import { Score } from '../components';

// ── Définition UI du HUD ──────────────────────────────────────────────────────

export const ScoreUI = defineUI({
  name: 'ScoreUI',

  css: `
    .hud-root {
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      text-align: center;
      pointer-events: none;
      font-family: 'Courier New', monospace;
      color: #4fffb0;
    }
    .hud-score {
      font-size: 20px;
      letter-spacing: 2px;
      text-shadow: 0 0 8px #4fffb0;
    }
    .hud-lives {
      font-size: 14px;
      color: #ff6b6b;
      margin-top: 4px;
    }
  `,

  html: `
    <div class="hud-root">
      <div id="hud-score" class="hud-score">SCORE: 0</div>
      <div id="hud-lives" class="hud-lives">♥ ♥ ♥</div>
    </div>
  `,

  onUpdate(dom, _entityId, api: EngineAPI<GwenServices>) {
    const scoreList = api.query([Score.name]);
    if (scoreList.length === 0) return;
    const score = api.getComponent(scoreList[0], Score);
    if (!score) return;
    dom.elements['hud-score'].textContent = `SCORE: ${score.value}`;
    dom.elements['hud-lives'].textContent = '♥ '.repeat(Math.max(0, score.lives)).trim();
  },
});

// ── UIManager préconfiguré avec le HUD ───────────────────────────────────────

export function makeHudManager(): UIManager {
  const ui = new UIManager();
  ui.register(ScoreUI);
  return ui;
}
