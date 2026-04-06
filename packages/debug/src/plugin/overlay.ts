/**
 * DebugOverlay — HTML overlay for debug metrics.
 *
 * Creates a fixed-position <div> on the viewport, refreshed on each
 * call to `update()`. Text colour turns red when FPS drops.
 * When `showPhases` is enabled, renders a per-phase timing bar chart.
 */
import type { DebugMetrics, DebugOverlayConfig } from '../types';
import type { EngineFramePhaseMs } from '@gwenjs/core';

const POSITION_STYLES: Record<NonNullable<DebugOverlayConfig['position']>, string> = {
  'top-left': 'top:8px; left:8px;',
  'top-right': 'top:8px; right:8px;',
  'bottom-left': 'bottom:8px; left:8px;',
  'bottom-right': 'bottom:8px; right:8px;',
};

/** Unicode block elements for fractional bar chart rendering. */
const BLOCK_CHARS = [' ', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'] as const;

/**
 * Render a proportional bar using unicode block elements.
 * @param ms      - Value in milliseconds.
 * @param budget  - Frame budget in milliseconds (= full bar width).
 * @param maxCols - Maximum number of character columns for the bar.
 */
function miniBar(ms: number, budget: number, maxCols = 8): string {
  const ratio = Math.min(ms / budget, 1);
  const total = ratio * maxCols;
  const full = Math.floor(total);
  const frac = total - full;
  const fracChar = BLOCK_CHARS[Math.round(frac * 8)];
  return '█'.repeat(full) + (full < maxCols ? fracChar : '');
}

/**
 * Build a single overlay row as an HTML string.
 * Label is left-padded to 9 chars for alignment.
 */
function row(label: string, value: string, color: string): string {
  const paddedLabel = label.padEnd(9);
  return `<span style="color:${color}">${paddedLabel}${value}</span>`;
}

/** Phase labels shown in the overlay (name + display label). */
const PHASES: ReadonlyArray<{ key: keyof EngineFramePhaseMs; label: string }> = [
  { key: 'tick', label: 'tick    ' },
  { key: 'plugins', label: 'plugins ' },
  { key: 'physics', label: 'physics ' },
  { key: 'wasm', label: 'wasm    ' },
  { key: 'update', label: 'update  ' },
  { key: 'render', label: 'render  ' },
  { key: 'afterTick', label: 'aftertick' },
];

export class DebugOverlay {
  private el: HTMLDivElement;
  private readonly config: Required<DebugOverlayConfig>;

  constructor(config: DebugOverlayConfig = {}) {
    this.config = {
      position: config.position ?? 'top-left',
      colorNormal: config.colorNormal ?? '#00ff88',
      colorDrop: config.colorDrop ?? '#ff4444',
      colorWarn: config.colorWarn ?? '#ffaa00',
      backgroundOpacity: config.backgroundOpacity ?? 0.75,
      showPhases: config.showPhases ?? false,
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
    const { colorNormal, colorDrop, colorWarn, showPhases } = this.config;
    const color = metrics.isDropping ? colorDrop : colorNormal;

    const dropSpan = metrics.isDropping ? ` <span style="color:${colorDrop}">⚠ DROP</span>` : '';
    const budgetSpan = metrics.overBudget ? ` <span style="color:${colorWarn}">⚠ OB</span>` : '';

    // Build HTML lines — all values are numeric/engine-internal, no XSS risk.
    const rows: string[] = [
      row('FPS', `${metrics.fps.toFixed(0).padStart(4)}${dropSpan}`, color),
      row('Avg FPS', metrics.rollingFps.toFixed(1).padStart(6), color),
      row(
        'Min/Max',
        `${metrics.minFps.toFixed(0).padStart(3)} / ${metrics.maxFps.toFixed(0)}`,
        color,
      ),
      row('Jitter', `${metrics.jitter.toFixed(1).padStart(5)} fps`, color),
      row('Frame', `${metrics.frameTimeMs.toFixed(2).padStart(7)} ms${budgetSpan}`, color),
      row('Budget', `${metrics.budgetMs.toFixed(2).padStart(7)} ms`, color),
      row('Entities', String(metrics.entityCount).padStart(5), color),
    ];

    if (metrics.memoryMB !== undefined) {
      rows.push(row('Memory', `${metrics.memoryMB.toFixed(1).padStart(5)} MB`, color));
    }

    rows.push(row('#Frame', String(metrics.frameCount).padStart(7), color));

    if (showPhases) {
      rows.push(`<span style="color:${color};opacity:0.4">${'─'.repeat(24)}</span>`);
      rows.push(
        `<span style="color:${color};opacity:0.7">Phases   budget ${metrics.budgetMs.toFixed(1)} ms</span>`,
      );

      for (const { key, label } of PHASES) {
        const ms = metrics.phaseMs[key];
        if (ms < 0.01) continue; // skip negligible phases
        const isHot = ms > metrics.budgetMs * 0.3; // warn if phase > 30% of budget
        const phaseColor = isHot ? colorWarn : color;
        const bar = miniBar(ms, metrics.budgetMs);
        rows.push(
          `<span style="color:${phaseColor}">${label} ${ms.toFixed(2).padStart(5)} ms ${bar}</span>`,
        );
      }
    }

    this.el.style.color = color;
    this.el.innerHTML = rows.join('\n');
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
