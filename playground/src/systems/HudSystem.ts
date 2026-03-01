import { createPlugin } from '@gwen/engine-core';
import type { EngineAPI } from '@gwen/engine-core';
import { Score } from '../components';

export const HudSystem = createPlugin({
  name: 'HudSystem' as const,

  onRender(api: EngineAPI<GwenServices>) {
    const scoreList = api.query([Score.name]);
    if (scoreList.length === 0) return;
    const score = api.getComponent(scoreList[0], Score);
    if (!score) return;

    const elScore = document.getElementById('score');
    const elLives = document.getElementById('lives');
    if (elScore) elScore.textContent = `SCORE: ${score.value}`;
    if (elLives) elLives.textContent = '♥ '.repeat(Math.max(0, score.lives)).trim();
  },
});

