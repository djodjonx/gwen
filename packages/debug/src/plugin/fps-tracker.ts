/**
 * FpsTracker — Ring buffer for rolling FPS calculation.
 *
 * Stores the last `N` delta times (in seconds) in a circular buffer
 * and computes the average, min, max and jitter (standard deviation) on demand.
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

  /** Records a new delta (in seconds). */
  push(deltaSeconds: number): void {
    // Ignore outlier deltas (tab pause, etc.)
    const clamped = Math.max(0.001, Math.min(1.0, deltaSeconds));
    this.buffer[this.head] = clamped;
    this.head = (this.head + 1) % this.size;
    if (this.count < this.size) this.count++;
  }

  /** Instantaneous FPS based on the last recorded delta. */
  instantFps(): number {
    if (this.count === 0) return 0;
    const lastIdx = (this.head - 1 + this.size) % this.size;
    const last = this.buffer[lastIdx];
    return last > 0 ? 1 / last : 0;
  }

  /** Average FPS over the rolling window. */
  rollingFps(): number {
    if (this.count === 0) return 0;
    let sum = 0;
    for (let i = 0; i < this.count; i++) {
      sum += this.buffer[i];
    }
    const avgDelta = sum / this.count;
    return avgDelta > 0 ? 1 / avgDelta : 0;
  }

  /** Minimum FPS observed in the window. */
  minFps(): number {
    if (this.count === 0) return 0;
    let maxDelta = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.buffer[i] > maxDelta) maxDelta = this.buffer[i];
    }
    return maxDelta > 0 ? 1 / maxDelta : 0;
  }

  /** Maximum FPS observed in the window. */
  maxFps(): number {
    if (this.count === 0) return 0;
    let minDelta = Infinity;
    for (let i = 0; i < this.count; i++) {
      if (this.buffer[i] < minDelta) minDelta = this.buffer[i];
    }
    return minDelta < Infinity ? 1 / minDelta : 0;
  }

  /**
   * Jitter: FPS standard deviation (in FPS) over the window.
   * A high value indicates irregular rendering (stuttering).
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

  /** Resets the buffer. */
  reset(): void {
    this.head = 0;
    this.count = 0;
    this.buffer.fill(0);
  }
}
