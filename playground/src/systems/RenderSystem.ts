import { createPlugin } from '@gwen/engine-core';
import type { EngineAPI } from '@gwen/engine-core';
import { Tag, Position } from '../components';
import type { Canvas2DRenderer } from '@gwen/renderer-canvas2d';

export function makeRenderSystem() {
  let renderer: Canvas2DRenderer | null = null;

  return createPlugin({
    name: 'RenderSystem' as const,

    onInit(api: EngineAPI<GwenServices>) {
      renderer = api.services.get('renderer');
    },

    onRender(api: EngineAPI<GwenServices>) {
      if (!renderer) return;
      const ctx = renderer.ctx;
      const W = renderer.logicalWidth;
      const H = renderer.logicalHeight;

      // Clear
      ctx.fillStyle = '#000814';
      ctx.fillRect(0, 0, W, H);

      // Étoiles parallax
      const t = Date.now() / 1000;
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      for (let i = 0; i < 60; i++) {
        const sx = (Math.sin(i * 7.3 + 1) * 0.5 + 0.5) * W;
        const sy = ((Math.sin(i * 3.7) * 0.5 + 0.5) * H + t * (15 + i % 25)) % H;
        ctx.fillRect(sx, sy, 1.5, 1.5);
      }

      // Entités
      const entities = api.query([Position.name, Tag.name]);
      for (const id of entities) {
        const pos = api.getComponent(id, Position);
        const tag = api.getComponent(id, Tag);
        if (!pos || !tag) continue;

        ctx.save();
        ctx.translate(pos.x, pos.y);

        switch (tag.type) {
          case 'player':
            ctx.fillStyle = '#4fffb0';
            ctx.shadowColor = '#4fffb0'; ctx.shadowBlur = 14;
            ctx.beginPath();
            ctx.moveTo(0, -18); ctx.lineTo(-13, 14);
            ctx.lineTo(0, 8);   ctx.lineTo(13, 14);
            ctx.closePath(); ctx.fill();
            break;

          case 'enemy':
            ctx.fillStyle = '#ff6b6b';
            ctx.shadowColor = '#ff6b6b'; ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.moveTo(0, 14);  ctx.lineTo(-14, -10);
            ctx.lineTo(0, -4);  ctx.lineTo(14, -10);
            ctx.closePath(); ctx.fill();
            break;

          case 'bullet':
            ctx.fillStyle = '#ffe600';
            ctx.shadowColor = '#ffe600'; ctx.shadowBlur = 8;
            ctx.fillRect(-2, -8, 4, 16);
            break;

          case 'enemy-bullet':
            ctx.fillStyle = '#ff4444';
            ctx.shadowColor = '#ff4444'; ctx.shadowBlur = 8;
            ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
            break;
        }

        ctx.restore();
      }
    },
  });
}
