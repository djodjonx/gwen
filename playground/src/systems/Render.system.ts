import { type EngineAPI } from '@gwen/engine-core';
import type { GwenPlugin } from '@gwen/engine-core';
import type { Canvas2DRenderer } from '@gwen/renderer-canvas2d';
import type { GwenServices } from '../../engine.config';
import { COMPONENTS as C } from '../components';

export class RenderSystem implements GwenPlugin<'RenderSystem'> {
  readonly name = 'RenderSystem' as const;
  private ctx!: CanvasRenderingContext2D;

  onInit(api: EngineAPI<GwenServices>): void {
    // renderer est Canvas2DRenderer — typé sans cast grâce à GwenServices
    const renderer: Canvas2DRenderer = api.services.get('renderer');
    this.ctx = renderer.ctx;
  }

  onRender(api: EngineAPI<GwenServices>): void {
    const W = 480;
    const H = 640;
    const ctx = this.ctx;

    // Background — le Canvas2DRenderer fait déjà le clear, on dessine par-dessus
    ctx.fillStyle = '#000814';
    ctx.fillRect(0, 0, W, H);

    // Étoiles de fond (pseudo-random stable)
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    const t = Date.now() / 1000;
    for (let i = 0; i < 50; i++) {
      const sx = (Math.sin(i * 7.3 + 1) * 0.5 + 0.5) * W;
      const sy = ((Math.sin(i * 3.7) * 0.5 + 0.5) * H + t * (20 + i % 20)) % H;
      ctx.fillRect(sx, sy, 1, 1);
    }

    // Entités
    const renderable = api.query([C.POSITION.name, C.TAG.name]);
    for (const id of renderable) {
      const pos = api.getComponent(id, C.POSITION);
      const tag = api.getComponent(id, C.TAG);

      // Guard défensif — log si un composant attendu est manquant
      if (!pos || !tag) {
        console.warn(`[RenderSystem] entity ${id}: pos=${JSON.stringify(pos)} tag=${JSON.stringify(tag)}`);
        continue;
      }

      ctx.save();
      ctx.translate(pos.x, pos.y);

      switch (tag.type) {
        case 'player':
          ctx.fillStyle = '#4fffb0';
          ctx.shadowColor = '#4fffb0';
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.moveTo(0, -18);
          ctx.lineTo(-14, 14);
          ctx.lineTo(0, 8);
          ctx.lineTo(14, 14);
          ctx.closePath();
          ctx.fill();
          break;

        case 'enemy':
          ctx.fillStyle = '#ff6b6b';
          ctx.shadowColor = '#ff6b6b';
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.moveTo(0, -14);
          ctx.lineTo(12, 0);
          ctx.lineTo(0, 14);
          ctx.lineTo(-12, 0);
          ctx.closePath();
          ctx.fill();
          break;

        case 'bullet':
          ctx.fillStyle = '#ffe600';
          ctx.shadowColor = '#ffe600';
          ctx.shadowBlur = 8;
          ctx.fillRect(-2, -7, 4, 14);
          break;

        case 'enemy-bullet':
          ctx.fillStyle = '#ff4444';
          ctx.shadowColor = '#ff4444';
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(0, 0, 4, 0, Math.PI * 2);
          ctx.fill();
          break;
      }
      ctx.restore();
    }
  }
}
