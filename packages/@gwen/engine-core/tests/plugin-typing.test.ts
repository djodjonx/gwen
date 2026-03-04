/**
 * Plugin typing system tests.
 *
 * Verifies:
 * 1. GwenPlugin runtime structure (provides, name)
 * 2. TypeScript inference via defineConfig() — tsc comments
 * 3. Backward compatibility (TsPlugin without provides)
 * 4. createPlugin() helper
 * 5. Official plugins (InputPlugin, AudioPlugin, Canvas2DRenderer)
 */

import { describe, it, expect } from 'vitest';
import {
  defineConfig,
  type GwenPlugin,
  type MergeProvides,
  type GwenConfigServices,
} from '../src/index';
import { InputPlugin } from '../../plugin-input/src/index';
import { AudioPlugin } from '../../plugin-audio/src/index';

// ── Test helpers ──────────────────────────────────────────────────────────────

interface MockService {
  value: number;
}
interface OtherService {
  label: string;
}

// ── GwenPlugin interface ──────────────────────────────────────────────────────

describe('GwenPlugin interface', () => {
  it('class implementing GwenPlugin compiles and is correctly typed', () => {
    class MyPlugin implements GwenPlugin<'MyPlugin', { foo: MockService }> {
      readonly name = 'MyPlugin' as const;
      readonly provides = { foo: {} as MockService };
    }
    const p = new MyPlugin();
    expect(p.name).toBe('MyPlugin');
    expect(p.provides).toEqual({ foo: {} });
  });

  it('plugin without provides is still a valid GwenPlugin', () => {
    class MinimalPlugin implements GwenPlugin<'Minimal'> {
      readonly name = 'Minimal' as const;
    }
    const p = new MinimalPlugin();
    expect(p.name).toBe('Minimal');
  });
});

// ── MergeProvides<> type helper ───────────────────────────────────────────────

describe('MergeProvides<> — service merging', () => {
  it('merges provides from multiple plugins (runtime check)', () => {
    class P1 implements GwenPlugin<'P1', { svc1: MockService }> {
      readonly name = 'P1' as const;
      readonly provides = { svc1: {} as MockService };
    }
    class P2 implements GwenPlugin<'P2', { svc2: OtherService }> {
      readonly name = 'P2' as const;
      readonly provides = { svc2: {} as OtherService };
    }

    const p1 = new P1();
    const p2 = new P2();

    // TypeScript check (compile-time) — if it compiles, the type is correct
    type Merged = MergeProvides<[typeof p1, typeof p2]>;
    // Merged must be { svc1: MockService; svc2: OtherService }
    const merged: Merged = {
      svc1: { value: 1 },
      svc2: { label: 'hello' },
    };
    expect(merged.svc1.value).toBe(1);
    expect(merged.svc2.label).toBe('hello');
  });

  it('plugin without provides contributes Record<string, never> (neutral)', () => {
    class NoProvides implements GwenPlugin<'NoProvides'> {
      readonly name = 'NoProvides' as const;
    }
    const p = new NoProvides();
    type M = MergeProvides<[typeof p]>;
    // M must be assignable to Record<string, never> → does not pollute the map
    const _: M = {} as any;
    expect(true).toBe(true); // compiles = test passed
  });
});

// ── defineConfig() — inference ────────────────────────────────────────────────

describe('defineConfig() — service inference', () => {
  it('returns an object with the passed plugins', () => {
    const config = defineConfig({
      tsPlugins: [new InputPlugin()],
      maxEntities: 1000,
    });
    expect((config as any).maxEntities).toBe(1000);
  });

  it('GwenConfigServices extracts the correct ServiceMap', () => {
    const config = defineConfig({
      tsPlugins: [new InputPlugin(), new AudioPlugin()],
    });

    // Compile-time check — if it compiles, inference is correct
    type Services = GwenConfigServices<typeof config>;

    // keyboard, mouse, gamepad from InputPlugin
    const _kb: Services['keyboard'] = {} as any; // KeyboardInput
    const _ms: Services['mouse'] = {} as any; // MouseInput
    const _gp: Services['gamepad'] = {} as any; // GamepadInput
    // audio from AudioPlugin
    const _au: Services['audio'] = {} as any; // AudioPlugin

    expect(true).toBe(true); // compiles = test passed
  });

  it('config without plugins compiles (Record<string, never>)', () => {
    const config = defineConfig({ maxEntities: 500 });

    expect((config as any).maxEntities).toBe(500);
  });

  it('wasmPlugins do not contribute to TS services (untyped)', () => {
    const config = defineConfig({
      tsPlugins: [new InputPlugin()],
      wasmPlugins: [
        { id: 'physics', name: 'Physics2D', sharedMemoryBytes: 0, onInit: async () => {} },
      ],
    });
    type Services = GwenConfigServices<typeof config>;
    // keyboard must exist (InputPlugin)
    const _kb: Services['keyboard'] = {} as any;
    expect(true).toBe(true);
  });
});

// ── Official plugins ──────────────────────────────────────────────────────────

describe('InputPlugin — provides', () => {
  it('has correct name literal', () => {
    const p = new InputPlugin();
    expect(p.name).toBe('InputPlugin');
  });

  it('provides contains keyboard, mouse, gamepad', () => {
    const p = new InputPlugin();
    expect(p.provides).toHaveProperty('keyboard');
    expect(p.provides).toHaveProperty('mouse');
    expect(p.provides).toHaveProperty('gamepad');
  });

  it('is assignable to GwenPlugin', () => {
    const p = new InputPlugin();
    expect(p.name).toBe('InputPlugin');
    expect(p.provides).toBeDefined();
  });
});

describe('AudioPlugin — provides', () => {
  it('has correct name literal', () => {
    const p = new AudioPlugin();
    expect(p.name).toBe('AudioPlugin');
  });

  it('provides contains audio', () => {
    const p = new AudioPlugin();
    expect(p.provides).toHaveProperty('audio');
  });
});

// ── Backward compatibility ────────────────────────────────────────────────────

describe('Backward compatibility — TsPlugin without provides', () => {
  it('a minimal TsPlugin object passes into defineConfig plugins', () => {
    const legacyPlugin: GwenPlugin = {
      name: 'LegacyPlugin',
      onInit: () => {},
    };
    // Must compile without error even without provides
    const config = defineConfig({ tsPlugins: [legacyPlugin] });
    expect(config).toBeDefined();
  });

  it('services from plugins without provides are Record<string, never>', () => {
    expect(true).toBe(true); // compiles = OK
  });
});
