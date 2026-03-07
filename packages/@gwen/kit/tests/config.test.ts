import { describe, expect, it, expectTypeOf } from 'vitest';
import { defineConfig, type GwenPlugin } from '../src';

const PluginA = {} as GwenPlugin<'A', { a: string }>;
const PluginB = {} as GwenPlugin<'B', { b: number }, { 'b:tick': (dt: number) => void }>;

describe('@gwen/kit defineConfig', () => {
  it('keeps runtime payload unchanged', () => {
    const conf = defineConfig({
      engine: { maxEntities: 10_000 },
      plugins: [PluginA, PluginB],
      html: { title: 'Game', background: '#000000' },
    });

    expect(conf.engine?.maxEntities).toBe(10_000);
    expect((conf.plugins ?? []).length).toBe(2);
  });

  it('infers services from declared plugins', () => {
    const conf = defineConfig({ plugins: [PluginA, PluginB] });
    expectTypeOf(conf._services).toMatchTypeOf<{ a: string; b: number }>();
  });

  it('infers hooks from declared plugins', () => {
    const conf = defineConfig({ plugins: [PluginB] });
    expectTypeOf(conf._hooks).toHaveProperty('b:tick');
    expectTypeOf(conf._hooks).toHaveProperty('engine:tick');
  });
});
