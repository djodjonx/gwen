/**
 * DebugOverlay — HTML overlay for debug metrics.
 *
 * Creates a fixed-position <div> on the viewport, refreshed on each
 * call to `update()`. Text colour turns red when FPS drops.
 */
import type { DebugMetrics, DebugOverlayConfig } from '../types';

const POSITION_STYLES: Record<NonNullable<DebugOverlayConfig['position']>, string> = {
  'top-left': 'top:8px; left:8px;',
  'top-right': 'top:8px; right:8px;',
  'bottom-left': 'bottom:8px; left:8px;',
  'bottom-right': 'bottom:8px; right:8px;',
};

export class DebugOverlay {
  private el: HTMLDivElement;
  private readonly config: Required<DebugOverlayConfig>;

  constructor(config: DebugOverlayConfig = {}) {
    this.config = {
      position: config.position ?? 'top-left',
      colorNormal: config.colorNormal ?? '#00ff88',
      colorDrop: config.colorDrop ?? '#ff4444',
      backgroundOpacity: config.backgroundOpacity ?? 0.75,
    };

    this.el = document.createElement('div');
    this.applyBaseStyles();
    document.body.appendChild(this.el);
  }

  private applyBaseStyles(): void {
    const { position, backgroundOpacity } = this.config;
    const posStyle = POSITION_STYLES[position];
    const bg = `rgba(0,0,0,${backgroundOpacity})`;

    Object.assign(this.el.style, {
      position: 'fixed',
      zIndex: '99999',
      padding: '8px 12px',
      borderRadius: '6px',
      background: bg,
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '12px',
      lineHeight: '1.6',
      pointerEvents: 'none',
      userSelect: 'none',
      whiteSpace: 'pre',
    });

    // Apply position (top/right/bottom/left)
    posStyle.split(';').forEach((rule) => {
      const [prop, val] = rule.split(':');
      if (prop && val) {
        (this.el.style as unknown as Record<string, string>)[prop.trim()] = val.trim();
      }
    });
  }

  /** Updates the overlay content with the current metrics. */
  update(metrics: DebugMetrics): void {
    const color = metrics.isDropping ? this.config.colorDrop : this.config.colorNormal;
    const dropMarker = metrics.isDropping ? ' ⚠ DROP' : '';

    const lines: string[] = [
      `FPS      ${metrics.fps.toFixed(0).padStart(4)}${dropMarker}`,
      `Avg FPS  ${metrics.rollingFps.toFixed(1).padStart(6)}`,
      `Min/Max  ${metrics.minFps.toFixed(0).padStart(3)} / ${metrics.maxFps.toFixed(0)}`,
      `Jitter   ${metrics.jitter.toFixed(1).padStart(5)} fps`,
      `Frame    ${metrics.frameTimeMs.toFixed(2).padStart(7)} ms`,
      `Entities ${String(metrics.entityCount).padStart(5)}`,
    ];

    if (metrics.memoryMB !== undefined) {
      lines.push(`Memory   ${metrics.memoryMB.toFixed(1).padStart(5)} MB`);
    }

    lines.push(`#Frame   ${String(metrics.frameCount).padStart(7)}`);

    this.el.style.color = color;
    this.el.textContent = lines.join('\n');
  }

  /** Removes the overlay from the DOM. */
  destroy(): void {
    this.el.remove();
  }

  /** Shows/hides the overlay. */
  setVisible(visible: boolean): void {
    this.el.style.display = visible ? 'block' : 'none';
  }
}
