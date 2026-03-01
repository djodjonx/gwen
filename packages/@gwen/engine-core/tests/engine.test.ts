import { describe, it, expect } from 'vitest';
import { Engine } from '../engine';

describe('Engine', () => {
  it('should create engine instance', () => {
    const engine = new Engine({ maxEntities: 1000 });
    expect(engine).toBeDefined();
  });
});

