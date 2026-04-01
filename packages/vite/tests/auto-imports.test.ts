import { describe, it, expect } from 'vitest';
import { generateAutoImportsModule } from '../src/plugins/auto-imports.js';
import type { AutoImport } from '@gwenengine/kit';

describe('generateAutoImportsModule', () => {
  it('returns a comment when entries are empty', () => {
    const result = generateAutoImportsModule([]);
    expect(result).toBe('// no auto-imports registered\n');
  });

  it('generates a single re-export line for one entry', () => {
    const entries: AutoImport[] = [{ name: 'useEngine', from: '@gwenengine/core' }];
    const result = generateAutoImportsModule(entries);
    expect(result).toBe("export { useEngine } from '@gwenengine/core'\n");
  });

  it('groups multiple entries from the same package into one line', () => {
    const entries: AutoImport[] = [
      { name: 'useEngine', from: '@gwenengine/core' },
      { name: 'defineSystem', from: '@gwenengine/core' },
    ];
    const result = generateAutoImportsModule(entries);
    expect(result).toBe("export { useEngine, defineSystem } from '@gwenengine/core'\n");
  });

  it('uses "name as alias" syntax for aliased exports', () => {
    const entries: AutoImport[] = [
      { name: 'usePhysics2D', from: '@gwenengine/physics2d', as: 'usePhysics' },
    ];
    const result = generateAutoImportsModule(entries);
    expect(result).toBe("export { usePhysics2D as usePhysics } from '@gwenengine/physics2d'\n");
  });

  it('generates separate lines for entries from different packages', () => {
    const entries: AutoImport[] = [
      { name: 'useEngine', from: '@gwenengine/core' },
      { name: 'usePhysics2D', from: '@gwenengine/physics2d' },
    ];
    const result = generateAutoImportsModule(entries);
    const lines = result.trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("export { useEngine } from '@gwenengine/core'");
    expect(lines[1]).toBe("export { usePhysics2D } from '@gwenengine/physics2d'");
  });
});
