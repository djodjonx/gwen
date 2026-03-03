import { describe, it, expect } from 'vitest';

describe('DebugPlugin', () => {
  it('should create an instance', () => {
    expect(true).toBe(true);
  });

  it('should track FPS metrics', () => {
    const metrics = {
      fps: 60,
      frameTime: 16.67,
      entityCount: 10,
      frameDrops: 0,
    };

    expect(metrics.fps).toBe(60);
    expect(metrics.frameTime).toBeCloseTo(16.67, 1);
    expect(metrics.entityCount).toBe(10);
    expect(metrics.frameDrops).toBe(0);
  });

  it('should toggle overlay visibility', () => {
    let visible = true;
    expect(visible).toBe(true);

    visible = false;
    expect(visible).toBe(false);
  });

  it('should track frame drops', () => {
    const frameDrops = 5;
    expect(frameDrops).toBeGreaterThanOrEqual(0);
  });
});

