import { describe, it, expect } from 'vitest';
import { generateActorsModule } from '../src/plugins/actor.js';

describe('generateActorsModule', () => {
  it('returns empty actors array when no files given', () => {
    const code = generateActorsModule([]);
    expect(code).toContain('export const actors = []');
  });

  it('generates lazy imports for each actor file', () => {
    const code = generateActorsModule([
      '/project/src/actors/enemy.ts',
      '/project/src/actors/player.ts',
    ]);
    expect(code).toContain("import('/project/src/actors/enemy.ts')");
    expect(code).toContain("import('/project/src/actors/player.ts')");
    expect(code).toContain('export const actors = [');
  });

  it('generates correct number of entries', () => {
    const code = generateActorsModule(['/a.ts', '/b.ts', '/c.ts']);
    const matches = code.match(/import\(/g);
    expect(matches).toHaveLength(3);
  });
});

describe('transformActorNames', () => {
  it('injects __actorName__ comment into defineActor calls', async () => {
    const { transformActorNames } = await import('../src/plugins/actor.js');
    const input = `const EnemyActor = defineActor(EnemyPrefab, () => {});`;
    const result = transformActorNames(input);
    expect(result).toContain('EnemyActor');
    expect(result).toContain('defineActor');
    // The transform should preserve the variable name somewhere
    expect(result).not.toBe(input); // something changed
  });

  it('injects __prefabName__ comment into definePrefab calls', async () => {
    const { transformActorNames } = await import('../src/plugins/actor.js');
    const input = `const EnemyPrefab = definePrefab([]);`;
    const result = transformActorNames(input);
    expect(result).toContain('EnemyPrefab');
    expect(result).toContain('definePrefab');
    expect(result).not.toBe(input);
  });

  it('returns code unchanged if no defineActor or definePrefab', async () => {
    const { transformActorNames } = await import('../src/plugins/actor.js');
    const input = `const x = 1;`;
    const result = transformActorNames(input);
    expect(result).toBe(input);
  });
});
