import { describe, it, expectTypeOf } from 'vitest';
import { defineConfig, type GwenPlugin, type GwenConfigServices } from '../src';

const PluginA = {} as GwenPlugin<'A', { a: string }>;
const PluginB = {} as GwenPlugin<'B', { b: number }>;
const PluginC = {} as GwenPlugin<'C', { c: boolean }, { 'c:event': (x: number) => void }>;

describe('defineConfig type inference', () => {
  it('infers services from unified plugins', () => {
    const conf = defineConfig({ plugins: [PluginA, PluginB] });
    expectTypeOf(conf._services).toMatchTypeOf<{ a: string; b: number }>();
  });

  it('infers services from tsPlugins and wasmPlugins', () => {
    const conf = defineConfig({ tsPlugins: [PluginA], wasmPlugins: [PluginB] });
    expectTypeOf(conf._services).toMatchTypeOf<{ a: string; b: number }>();
  });

  it('merges all plugin arrays', () => {
    const conf = defineConfig({ plugins: [PluginA], tsPlugins: [PluginB], wasmPlugins: [PluginC] });
    expectTypeOf(conf._services).toMatchTypeOf<{ a: string; b: number; c: boolean }>();
    expectTypeOf(conf._hooks).toHaveProperty('c:event');
  });

  it('extracts services with GwenConfigServices', () => {
    const conf = defineConfig({ plugins: [PluginA, PluginB] });
    type Services = GwenConfigServices<typeof conf>;
    expectTypeOf<Services>().toMatchTypeOf<{ a: string; b: number }>();
  });

  it('rejects unknown service key', () => {
    const conf = defineConfig({ plugins: [PluginA] });
    // @ts-expect-error unknown key must be rejected
    type _UnknownService = (typeof conf._services)['ghost'];
    expectTypeOf(conf._services.a).toBeString();
  });
});
