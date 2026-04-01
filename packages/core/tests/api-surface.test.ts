import { describe, it, expect } from 'vitest';
import * as core from '../src/index';
import { Engine } from '../src/engine/engine';

describe('API surface (RFC-V2-013)', () => {
  it('exports stable runtime entrypoints', () => {
    expect(typeof core.createEngine).toBe('function');
    expect(typeof core.initWasm).toBe('function');
    expect(typeof core.getWasmBridge).toBe('function');
    expect(typeof core.defineSystem).toBe('function');
    expect(typeof core.defineScene).toBe('function');
    expect(typeof core.definePrefab).toBe('function');
    expect(typeof core.detectCoreVariant).toBe('function');
    expect(typeof core.detectSharedMemoryRequired).toBe('function');
  });

  it('exposes only modern engine methods (legacy path removed)', () => {
    const engine = new Engine();
    expect(typeof engine.registerSystem).toBe('function');
    expect(typeof engine.getSystem).toBe('function');
    expect(typeof engine.hasSystem).toBe('function');
    expect(typeof engine.removeSystem).toBe('function');

    expect('loadPlugin' in (engine as any)).toBe(false);
    expect('getPlugin' in (engine as any)).toBe(false);
    expect('hasPlugin' in (engine as any)).toBe(false);
    expect('on' in (engine as any)).toBe(false);
    expect('off' in (engine as any)).toBe(false);
    expect('emit' in (engine as any)).toBe(false);
  });
});
