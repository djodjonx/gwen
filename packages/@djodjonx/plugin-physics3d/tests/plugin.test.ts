import { describe, it, expect } from 'vitest';
import Physics3DPlugin, { Physics3DPlugin as NamedPhysics3DPlugin, pluginMeta } from '../src/index';

describe('Physics3DPlugin foundation', () => {
  it('exports default and named plugin class', () => {
    expect(Physics3DPlugin).toBeDefined();
    expect(NamedPhysics3DPlugin).toBeDefined();
  });

  it('instantiates with expected plugin name', () => {
    const plugin = new Physics3DPlugin();
    expect(plugin.name).toBe('Physics3D');
  });

  it('exposes metadata for physics3d service typing', () => {
    expect(pluginMeta.serviceTypes?.physics3d?.exportName).toBe('Physics3DAPI');
  });
});
