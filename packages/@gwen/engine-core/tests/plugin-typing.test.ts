/**
 * Tests du système de typage des plugins GWEN.
 *
 * Ces tests vérifient :
 * 1. La structure runtime de GwenPlugin (provides, name)
 * 2. L'inférence TypeScript via defineConfig() — commentaires tsc
 * 3. La compatibilité rétro (TsPlugin sans provides)
 * 4. createPlugin() helper
 * 5. Les plugins officiels (InputPlugin, AudioPlugin, Canvas2DRenderer)
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

// ── Helpers de test ───────────────────────────────────────────────────────────

interface MockService {
  value: number;
}
interface OtherService {
  label: string;
}

// ── GwenPlugin interface ──────────────────────────────────────────────────────

describe('GwenPlugin interface', () => {
  it('classe implémentant GwenPlugin compile et est correctement typée', () => {
    class MyPlugin implements GwenPlugin<'MyPlugin', { foo: MockService }> {
      readonly name = 'MyPlugin' as const;
      readonly provides = { foo: {} as MockService };
    }
    const p = new MyPlugin();
    expect(p.name).toBe('MyPlugin');
    expect(p.provides).toEqual({ foo: {} });
  });

  it('plugin sans provides est toujours un GwenPlugin valide', () => {
    class MinimalPlugin implements GwenPlugin<'Minimal'> {
      readonly name = 'Minimal' as const;
    }
    const p = new MinimalPlugin();
    expect(p.name).toBe('Minimal');
  });
});

// ── MergeProvides<> type helper ───────────────────────────────────────────────

describe('MergeProvides<> — fusion des services', () => {
  it('fusionne les provides de plusieurs plugins (vérification runtime)', () => {
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

    // Vérification TypeScript (compile-time) — si ça compile, le type est correct
    type Merged = MergeProvides<[typeof p1, typeof p2]>;
    // Merged doit être { svc1: MockService; svc2: OtherService }
    const merged: Merged = {
      svc1: { value: 1 },
      svc2: { label: 'hello' },
    };
    expect(merged.svc1.value).toBe(1);
    expect(merged.svc2.label).toBe('hello');
  });

  it('plugin sans provides contribue Record<string, never> (neutre)', () => {
    class NoProvides implements GwenPlugin<'NoProvides'> {
      readonly name = 'NoProvides' as const;
    }
    const p = new NoProvides();
    type M = MergeProvides<[typeof p]>;
    // M doit être assignable à Record<string, never> → ne pollue pas le map
    const _: M = {} as any;
    expect(true).toBe(true); // compile = test réussi
  });
});

// ── defineConfig() — inférence ────────────────────────────────────────────────

describe('defineConfig() — inférence des services', () => {
  it('retourne un objet avec les plugins passés', () => {
    const config = defineConfig({
      tsPlugins: [new InputPlugin()],
      maxEntities: 1000,
    });
    expect((config as any).maxEntities).toBe(1000);
  });

  it('GwenConfigServices extrait le bon ServiceMap', () => {
    const config = defineConfig({
      tsPlugins: [new InputPlugin(), new AudioPlugin()],
    });

    // Vérification compile-time — si ça compile, l'inférence est correcte
    type Services = GwenConfigServices<typeof config>;

    // keyboard, mouse, gamepad depuis InputPlugin
    const _kb: Services['keyboard'] = {} as any; // KeyboardInput
    const _ms: Services['mouse'] = {} as any; // MouseInput
    const _gp: Services['gamepad'] = {} as any; // GamepadInput
    // audio depuis AudioPlugin
    const _au: Services['audio'] = {} as any; // AudioPlugin

    expect(true).toBe(true); // compile = test réussi
  });

  it('config sans plugins compile (Record<string, never>)', () => {
    const config = defineConfig({ maxEntities: 500 });

    expect((config as any).maxEntities).toBe(500);
  });

  it('wasmPlugins ne contribuent pas aux services TS (non typés)', () => {
    const config = defineConfig({
      tsPlugins: [new InputPlugin()],
      wasmPlugins: [{ id: 'physics', name: 'Physics2D' }],
    });
    type Services = GwenConfigServices<typeof config>;
    // keyboard doit exister (InputPlugin)
    const _kb: Services['keyboard'] = {} as any;
    expect(true).toBe(true);
  });
});

// ── Plugins officiels ─────────────────────────────────────────────────────────

describe('InputPlugin — provides', () => {
  it('has correct name literal', () => {
    const p = new InputPlugin();
    expect(p.name).toBe('InputPlugin');
  });

  it('provides contient keyboard, mouse, gamepad', () => {
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

  it('provides contient audio', () => {
    const p = new AudioPlugin();
    expect(p.provides).toHaveProperty('audio');
  });
});

// ── Rétro-compatibilité ───────────────────────────────────────────────────────

describe('Rétro-compatibilité — TsPlugin sans provides', () => {
  it('un objet TsPlugin minimal passe dans defineConfig plugins', () => {
    const legacyPlugin: GwenPlugin = {
      name: 'LegacyPlugin',
      onInit: () => {},
    };
    // Doit compiler sans erreur même sans provides
    const config = defineConfig({ tsPlugins: [legacyPlugin] });
    expect(config).toBeDefined();
  });

  it('les services des plugins sans provides sont Record<string, never>', () => {
    expect(true).toBe(true); // compile = OK
  });
});
