/**
 * Public types for the GWEN debug plugin.
 */

// ── Exposed metrics ───────────────────────────────────────────────────────────

/** Full snapshot of debug metrics for a frame. */
export interface DebugMetrics {
  /** Instantaneous FPS (1 / deltaTime) */
  fps: number;
  /** Rolling average FPS over the configured window (e.g. last 60 frames) */
  rollingFps: number;
  /** Minimum FPS observed over the rolling window */
  minFps: number;
  /** Maximum FPS observed over the rolling window */
  maxFps: number;
  /** Jitter: FPS standard deviation over the rolling window */
  jitter: number;
  /** Current frame duration in milliseconds */
  frameTimeMs: number;
  /** Current frame number */
  frameCount: number;
  /** Number of active entities in the world */
  entityCount: number;
  /** JS memory used in MB (Chrome only, undefined elsewhere) */
  memoryMB: number | undefined;
  /** true if the FPS is below the configured drop threshold */
  isDropping: boolean;
  /** Timestamp of the last detected drop (ms since epoch), or 0 */
  lastDropAt: number;
}

// ── Configuration ─────────────────────────────────────────────────────────────

/** Behaviour triggered when an FPS drop is detected. */
export interface FpsDropConfig {
  /**
   * FPS threshold below which a drop is reported.
   * @default 45
   */
  threshold?: number;
  /**
   * Callback invoked every frame the FPS falls below the threshold.
   * @param currentFps Instantaneous FPS at the time of the drop
   * @param metrics Full metrics snapshot
   */
  onDrop?: (currentFps: number, metrics: DebugMetrics) => void;
  /**
   * Number of consecutive frames below the threshold before triggering the callback.
   * Avoids false positives on an isolated spike.
   * @default 3
   */
  gracePeriodFrames?: number;
}

/** DebugPlugin configuration. */
export interface DebugPluginConfig {
  /**
   * Size of the rolling window used for average FPS calculation.
   * @default 60
   */
  rollingWindowSize?: number;
  /** FPS drop detection and callback. */
  fpsDrop?: FpsDropConfig;
  /**
   * Renders an HTML overlay on top of the viewport with live metrics.
   * @default false
   */
  overlay?: boolean | DebugOverlayConfig;
  /**
   * How many frames between each metrics recalculation/display.
   * Lower for less overhead; higher for more responsiveness.
   * @default 10
   */
  updateInterval?: number;
}

/** HTML overlay options. */
export interface DebugOverlayConfig {
  /**
   * Position of the overlay in the page.
   * @default 'top-left'
   */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /**
   * Text colour in normal state.
   * @default '#00ff88'
   */
  colorNormal?: string;
  /**
   * Text colour when FPS drops.
   * @default '#ff4444'
   */
  colorDrop?: string;
  /** Background opacity (0-1). @default 0.75 */
  backgroundOpacity?: number;
}
