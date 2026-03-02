/**
 * Types publics du plugin de debug GWEN.
 */

// ── Métriques exposées ────────────────────────────────────────────────────────

/** Snapshot complet des métriques de debug pour une frame. */
export interface DebugMetrics {
  /** FPS instantané (1 / deltaTime) */
  fps: number;
  /** FPS moyen glissant sur la fenêtre configurée (ex: 60 dernières frames) */
  rollingFps: number;
  /** FPS minimum observé sur la fenêtre glissante */
  minFps: number;
  /** FPS maximum observé sur la fenêtre glissante */
  maxFps: number;
  /** Gigue : écart-type du FPS sur la fenêtre glissante */
  jitter: number;
  /** Durée de la frame courante en millisecondes */
  frameTimeMs: number;
  /** Numéro de la frame courante */
  frameCount: number;
  /** Nombre d'entités actives dans le monde */
  entityCount: number;
  /** Mémoire JS utilisée en Mo (Chrome uniquement, undefined ailleurs) */
  memoryMB: number | undefined;
  /** true si le FPS est en dessous du seuil de chute configuré */
  isDropping: boolean;
  /** Horodatage de la dernière chute détectée (ms depuis epoch), ou 0 */
  lastDropAt: number;
}

// ── Configuration ─────────────────────────────────────────────────────────────

/** Comportement déclenché lors d'une chute de FPS. */
export interface FpsDropConfig {
  /**
   * Seuil en FPS en dessous duquel une chute est signalée.
   * @default 45
   */
  threshold?: number;
  /**
   * Callback appelé à chaque frame où le FPS passe sous le seuil.
   * @param currentFps FPS instantané au moment de la chute
   * @param metrics Snapshot complet des métriques
   */
  onDrop?: (currentFps: number, metrics: DebugMetrics) => void;
  /**
   * Nombre de frames consécutives sous le seuil avant de déclencher le callback.
   * Évite les faux-positifs sur un pic isolé.
   * @default 3
   */
  gracePeriodFrames?: number;
}

/** Configuration du DebugPlugin. */
export interface DebugPluginConfig {
  /**
   * Taille de la fenêtre glissante pour le calcul du FPS moyen.
   * @default 60
   */
  rollingWindowSize?: number;
  /** Détection et callback de chute de FPS. */
  fpsDrop?: FpsDropConfig;
  /**
   * Affiche un overlay HTML en surimpression avec les métriques.
   * @default false
   */
  overlay?: boolean | DebugOverlayConfig;
  /**
   * Tous les combien de frames les métriques sont-elles recalculées/affichées.
   * Réduire pour moins de charge ; augmenter pour plus de réactivité.
   * @default 10
   */
  updateInterval?: number;
}

/** Options de l'overlay HTML. */
export interface DebugOverlayConfig {
  /**
   * Position de l'overlay dans la page.
   * @default 'top-left'
   */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /**
   * Couleur du texte en état normal.
   * @default '#00ff88'
   */
  colorNormal?: string;
  /**
   * Couleur du texte quand le FPS chute.
   * @default '#ff4444'
   */
  colorDrop?: string;
  /** Opacité du fond (0-1). @default 0.75 */
  backgroundOpacity?: number;
}

