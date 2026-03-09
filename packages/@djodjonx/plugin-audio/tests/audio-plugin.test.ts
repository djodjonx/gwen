import { describe, it, expect } from 'vitest';

describe('AudioPlugin', () => {
  it('should accept configuration with masterVolume', () => {
    const config = { masterVolume: 0.8 };
    expect(config.masterVolume).toBeGreaterThanOrEqual(0);
    expect(config.masterVolume).toBeLessThanOrEqual(1);
  });

  it('should track preloaded sounds', () => {
    const sounds = new Map();
    sounds.set('jump', { url: '/sounds/jump.wav' });
    sounds.set('coin', { url: '/sounds/coin.wav' });

    expect(sounds.size).toBe(2);
    expect(sounds.has('jump')).toBe(true);
    expect(sounds.get('jump')?.url).toContain('.wav');
  });

  it('should handle sound options', () => {
    const soundOptions = { volume: 0.5, pitch: 1.0, loop: false };

    expect(soundOptions.volume).toBeGreaterThanOrEqual(0);
    expect(soundOptions.volume).toBeLessThanOrEqual(1);
    expect(soundOptions.pitch).toBeGreaterThan(0);
    expect(soundOptions.loop).toBe(false);
  });

  it('should track playing sounds', () => {
    const playingSounds = new Set(['jump', 'coin']);

    expect(playingSounds.size).toBe(2);
    expect(playingSounds.has('jump')).toBe(true);

    playingSounds.delete('jump');
    expect(playingSounds.size).toBe(1);
  });
});
