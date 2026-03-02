/**
 * DebugPlugin — Plugin GWEN de debug et monitoring des performances.
 *
 * Expose un service `'debug'` dans `api.services` avec les métriques courantes.
 * Optionnellement affiche un overlay HTML en surimpression.
 *
 * @example
 * ```typescript
 * import { DebugPlugin } from '@gwen/plugin-debug';
 *
 * // Dans gwen.config.ts :
 * new DebugPlugin({
 *   overlay: true,
 *   fpsDrop: {
 *     threshold: 45,
 *     onDrop: (fps, metrics) => console.warn(`FPS drop: ${fps}`, metrics),
 *   },
 * })
 *
 * // Dans n'importe quel système :
 * const debug = api.services.get<DebugService>('debug');
 * console.log(debug.getMetrics());
 * ```
 */

import type { EngineAPI, GwenPlugin } from '@gwen/engine-core';
import { FpsTracker } from './fps-tracker';
import { DebugOverlay } from './overlay';
import type {
  DebugMetrics,
  DebugPluginConfig,
  DebugOverlayConfig,
  FpsDropConfig,
} from './types';

export type { DebugMetrics, DebugPluginConfig, DebugOverlayConfig, FpsDropConfig };

// ── DebugService ──────────────────────────────────────────────────────────────

/**
 * Service exposé par DebugPlugin dans `api.services.get('debug')`.
 * Lecture seule pour les consommateurs.
 */
export interface DebugService {
  /** Dernier snapshot de métriques calculé. */
  getMetrics(): DebugMetrics;
  /** Réinitialise le ring buffer FPS (utile après un chargement long). */
  reset(): void;
  /** Affiche ou masque l'overlay (si activé). */
  setOverlayVisible(visible: boolean): void;
}

// ── DebugPluginServices ───────────────────────────────────────────────────────

export interface DebugPluginServices {
  debug: DebugService;
  [key: string]: unknown;
}

// ── DebugPlugin ───────────────────────────────────────────────────────────────

export class DebugPlugin implements GwenPlugin<'DebugPlugin', DebugPluginServices> {
  readonly name = 'DebugPlugin' as const;

  readonly provides = {
    debug: {} as DebugService,
  };

  // ─── Config résolue ───────────────────────────────────────────────────────
  private readonly windowSize:      number;
  private readonly updateInterval:  number;
  private readonly dropThreshold:   number;
  private readonly dropGrace:       number;
  private readonly dropCallback:    FpsDropConfig['onDrop'];
  private readonly overlayConfig:   DebugOverlayConfig | false;

  // ─── État interne ─────────────────────────────────────────────────────────
  private tracker!: FpsTracker;
  private overlay: DebugOverlay | null = null;
  private metrics: DebugMetrics = DebugPlugin.emptyMetrics();
  private consecutiveDropFrames = 0;
  private lastDropAt = 0;
  private framesSinceUpdate = 0;

  constructor(config: DebugPluginConfig = {}) {
    this.windowSize     = config.rollingWindowSize ?? 60;
    this.updateInterval = config.updateInterval    ?? 10;
    this.dropThreshold  = config.fpsDrop?.threshold        ?? 45;
    this.dropGrace      = config.fpsDrop?.gracePeriodFrames ?? 3;
    this.dropCallback   = config.fpsDrop?.onDrop;

    if (config.overlay === true) {
      this.overlayConfig = {};
    } else if (config.overlay && typeof config.overlay === 'object') {
      this.overlayConfig = config.overlay;
    } else {
      this.overlayConfig = false;
    }
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  onInit(api: EngineAPI): void {
    this.tracker = new FpsTracker(this.windowSize);

    if (this.overlayConfig !== false && typeof document !== 'undefined') {
      this.overlay = new DebugOverlay(this.overlayConfig);
    }

    const self = this;

    const service: DebugService = {
      getMetrics()                    { return self.metrics; },
      reset()                         { self.tracker.reset(); self.consecutiveDropFrames = 0; },
      setOverlayVisible(v: boolean)   { self.overlay?.setVisible(v); },
    };

    api.services.register('debug', service);
  }

  onBeforeUpdate(api: EngineAPI, dt: number): void {
    // 1. Alimenter le ring buffer
    this.tracker.push(dt);
    this.framesSinceUpdate++;

    const instant = this.tracker.instantFps();

    // 2. Détection de chute (grace period)
    if (instant < this.dropThreshold) {
      this.consecutiveDropFrames++;
    } else {
      this.consecutiveDropFrames = 0;
    }

    const isDropping = this.consecutiveDropFrames >= this.dropGrace;

    // 3. Callback de chute — déclenché à chaque frame sous seuil (après grace period)
    //    Indépendant de l'intervalle de recalcul des métriques.
    if (isDropping) {
      this.lastDropAt = Date.now();
      if (this.dropCallback) {
        this.dropCallback(instant, this.metrics);
      }
    }

    // 4. Recalcul complet des métriques selon l'intervalle
    if (this.framesSinceUpdate >= this.updateInterval) {
      this.framesSinceUpdate = 0;

      this.metrics = {
        fps:         instant,
        rollingFps:  this.tracker.rollingFps(),
        minFps:      this.tracker.minFps(),
        maxFps:      this.tracker.maxFps(),
        jitter:      this.tracker.jitter(),
        frameTimeMs: dt * 1000,
        frameCount:  api.frameCount,
        entityCount: this.countEntities(api),
        memoryMB:    this.readMemoryMB(),
        isDropping,
        lastDropAt:  isDropping ? this.lastDropAt : this.metrics.lastDropAt,
      };

      // 5. Rafraîchir l'overlay si actif
      this.overlay?.update(this.metrics);
    }
  }

  onDestroy(): void {
    this.overlay?.destroy();
    this.overlay = null;
    this.tracker.reset();
  }

  // ─── Helpers privés ───────────────────────────────────────────────────────

  /**
   * Lit l'usage mémoire JS si disponible (Chrome uniquement).
   * `performance.memory` n'est pas dans les specs W3C → fallback undefined.
   */
  private readMemoryMB(): number | undefined {
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    if (!mem) return undefined;
    return mem.usedJSHeapSize / (1024 * 1024);
  }

  /**
   * Compte les entités actives via l'API ECS.
   * On query toutes les entités ayant n'importe quel composant — si le monde
   * est vide ou que l'API ne le supporte pas, retourne 0.
   */
  private countEntities(api: EngineAPI): number {
    try {
      // Utilise api.frameCount comme proxy si la query vide n'est pas supportée
      return api.query([]).length;
    } catch {
      return 0;
    }
  }

  private static emptyMetrics(): DebugMetrics {
    return {
      fps: 0, rollingFps: 0, minFps: 0, maxFps: 0,
      jitter: 0, frameTimeMs: 0, frameCount: 0,
      entityCount: 0, memoryMB: undefined,
      isDropping: false, lastDropAt: 0,
    };
  }
}

