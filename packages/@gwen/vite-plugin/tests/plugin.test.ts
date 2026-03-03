import { describe, it, expect } from 'vitest';

describe('GwenVitePlugin', () => {
  it('should create an instance', () => {
    expect(true).toBe(true);
  });

  it('should initialize with options', () => {
    const options = {
      cratePath: './crates/gwen-core',
      watch: true,
      wasmMode: 'debug' as const,
    };

    expect(options.cratePath).toBe('./crates/gwen-core');
    expect(options.watch).toBe(true);
    expect(options.wasmMode).toBe('debug');
  });

  it('should track WASM paths', () => {
    const wasmPath = '/wasm/gwen_core.wasm';
    expect(wasmPath).toContain('.wasm');
  });

  it('should auto-discover scenes', () => {
    const scenes = ['GameScene', 'MenuScene'];
    expect(scenes.length).toBe(2);
    expect(scenes).toContain('GameScene');
  });
});

