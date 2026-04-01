/**
 * FpsTracker — Ring buffer pour le calcul du FPS glissant.
 *
 * Stocke les `N` derniers deltatimes (en secondes) dans un buffer circulaire
 * et calcule la moyenne, le min, le max et la gigue (écart-type) à la demande.
 */
export class FpsTracker {
  private readonly buffer: Float32Array;
  private readonly size: number;
  private head = 0;
  private count = 0;

  constructor(windowSize = 60) {
    this.size = Math.max(2, windowSize);
    this.buffer = new Float32Array(this.size);
  }

  /** Enregistre un nouveau delta (en secondes). */
  push(deltaSeconds: number): void {
    // Ignorer les deltas aberrants (pause de l'onglet, etc.)
    const clamped = Math.max(0.001, Math.min(1.0, deltaSeconds));
    this.buffer[this.head] = clamped;
    this.head = (this.head + 1) % this.size;
    if (this.count < this.size) this.count++;
  }

  /** FPS instantané basé sur le dernier delta enregistré. */
  instantFps(): number {
    if (this.count === 0) return 0;
    const lastIdx = (this.head - 1 + this.size) % this.size;
    const last = this.buffer[lastIdx];
    return last > 0 ? 1 / last : 0;
  }

  /** FPS moyen sur la fenêtre glissante. */
  rollingFps(): number {
    if (this.count === 0) return 0;
    let sum = 0;
    for (let i = 0; i < this.count; i++) {
      sum += this.buffer[i];
    }
    const avgDelta = sum / this.count;
    return avgDelta > 0 ? 1 / avgDelta : 0;
  }

  /** FPS minimum observé dans la fenêtre. */
  minFps(): number {
    if (this.count === 0) return 0;
    let maxDelta = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.buffer[i] > maxDelta) maxDelta = this.buffer[i];
    }
    return maxDelta > 0 ? 1 / maxDelta : 0;
  }

  /** FPS maximum observé dans la fenêtre. */
  maxFps(): number {
    if (this.count === 0) return 0;
    let minDelta = Infinity;
    for (let i = 0; i < this.count; i++) {
      if (this.buffer[i] < minDelta) minDelta = this.buffer[i];
    }
    return minDelta < Infinity ? 1 / minDelta : 0;
  }

  /**
   * Gigue : écart-type du FPS (en FPS) sur la fenêtre.
   * Une valeur élevée indique un rendu irrégulier (stuttering).
   */
  jitter(): number {
    if (this.count < 2) return 0;
    const avg = this.rollingFps();
    let variance = 0;
    for (let i = 0; i < this.count; i++) {
      const fps = this.buffer[i] > 0 ? 1 / this.buffer[i] : 0;
      const diff = fps - avg;
      variance += diff * diff;
    }
    return Math.sqrt(variance / this.count);
  }

  /** Réinitialise le buffer. */
  reset(): void {
    this.head = 0;
    this.count = 0;
    this.buffer.fill(0);
  }
}
