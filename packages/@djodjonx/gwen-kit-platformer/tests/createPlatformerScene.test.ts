// packages/@djodjonx/gwen-kit-platformer/tests/createPlatformerScene.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createPlatformerScene } from '../src/scenes/platformer.js';

const getSystemNames = (scene: any): string[] =>
  (scene.systems ?? []).map((s: any) =>
    typeof s === 'function' ? (s.systemName ?? s.name) : s.name,
  );

const makeApi = (overrides: any = {}) => ({
  services: { has: () => false, get: vi.fn() },
  ...overrides,
});

function makeSystemStub(name: string) {
  return { name, onUpdate() {} };
}

describe('createPlatformerScene', () => {
  it('contient PlatformerInputSystem et PlatformerMovementSystem', () => {
    const scene = createPlatformerScene({ name: 'Test' });
    const names = getSystemNames(scene);
    expect(names).toContain('PlatformerInputSystem');
    expect(names).toContain('PlatformerMovementSystem');
  });

  it('systems personnalisés sont append après les systèmes platformer', () => {
    const Spawn = makeSystemStub('SpawnSystem');
    const scene = createPlatformerScene({ name: 'Test', systems: [Spawn as any] });
    const names = getSystemNames(scene);
    expect(names.indexOf('SpawnSystem')).toBeGreaterThan(names.indexOf('PlatformerMovementSystem'));
  });

  it('gravity par défaut = 20', async () => {
    const setGravity = vi.fn();
    const scene = createPlatformerScene({ name: 'Test' });
    await (scene as any).onEnter(
      makeApi({
        services: { has: () => true, get: () => ({ setGravity }) },
      }),
    );
    expect(setGravity).toHaveBeenCalledWith(0, 20);
  });

  it('gravity configurable', async () => {
    const setGravity = vi.fn();
    const scene = createPlatformerScene({ name: 'Test', gravity: 9.8 });
    await (scene as any).onEnter(
      makeApi({
        services: { has: () => true, get: () => ({ setGravity }) },
      }),
    );
    expect(setGravity).toHaveBeenCalledWith(0, 9.8);
  });

  it('appelle onEnter après gravity', async () => {
    const onEnter = vi.fn();
    const scene = createPlatformerScene({ name: 'Test', onEnter });
    const api = makeApi();
    await (scene as any).onEnter(api);
    expect(onEnter).toHaveBeenCalledWith(api);
  });

  it('appelle onExit si fourni', async () => {
    const onExit = vi.fn();
    const scene = createPlatformerScene({ name: 'Test', onExit });
    const api = makeApi();
    await (scene as any).onExit(api);
    expect(onExit).toHaveBeenCalledWith(api);
  });
});
