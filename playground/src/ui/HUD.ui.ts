import { defineUI, type EngineAPI } from '@gwen/engine-core';
import { COMPONENTS as C, type ScoreData } from '../components';

export const HUD = defineUI({
  name: 'SpaceShooterHUD',
  css: `
    #hud { position: absolute; top: 20px; left: 20px; color: white; font-family: monospace; font-size: 18px; text-shadow: 2px 2px 0 #000; }
    #score-val { color: #ffe600; }
    #lives-val { color: #ff6b6b; }
  `,
  html: `
    <div id="hud">
      SCORE: <span id="score-val">0</span><br>
      LIVES: <span id="lives-val">♥♥♥</span>
    </div>
  `,
  onUpdate: (dom, entityId, api: EngineAPI) => {
    const score = api.getComponent<ScoreData>(entityId, C.SCORE);
    if (!score) return;
    dom.elements['score-val'].textContent = String(score.value);
    dom.elements['lives-val'].textContent = '♥'.repeat(Math.max(0, score.lives));
  }
});
