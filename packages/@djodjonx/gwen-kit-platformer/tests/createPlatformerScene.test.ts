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
  it('includes PlatformerInputSystem and PlatformerMovementSystem', () => {
    const scene = createPlatformerScene({ name: 'Test' });
    const names = getSystemNames(scene);
    expect(names).toContain('PlatformerInputSystem');
    expect(names).toContain('PlatformerMovementSystem');
  });

  it('appends custom systems after platformer systems', () => {
    const Spawn = makeSystemStub('SpawnSystem');
    const scene = createPlatformerScene({ name: 'Test', systems: [Spawn as any] });
    const names = getSystemNames(scene);
    expect(names.indexOf('SpawnSystem')).toBeGreaterThan(names.indexOf('PlatformerMovementSystem'));
  });

  it('uses default gravity in pixels and converts to meters', async () => {
    const setGravity = vi.fn();
    const scene = createPlatformerScene({ name: 'Test' });
    await (scene as any).onEnter(
      makeApi({
        services: { has: () => true, get: () => ({ setGravity }) },
      }),
    );
    expect(setGravity).toHaveBeenCalledWith(0, 0.4);
  });

  it('converts custom gravity when units is pixels', async () => {
    const setGravity = vi.fn();
    const scene = createPlatformerScene({ name: 'Test', gravity: 35, units: 'pixels' });
    await (scene as any).onEnter(
      makeApi({
        services: { has: () => true, get: () => ({ setGravity }) },
      }),
    );
    expect(setGravity).toHaveBeenCalledWith(0, 0.7);
  });

  it('keeps gravity unchanged when units is meters', async () => {
    const setGravity = vi.fn();
    const scene = createPlatformerScene({ name: 'Test', gravity: 9.8, units: 'meters' });
    await (scene as any).onEnter(
      makeApi({
        services: { has: () => true, get: () => ({ setGravity }) },
      }),
    );
    expect(setGravity).toHaveBeenCalledWith(0, 9.8);
  });

  it('uses custom pixelsPerMeter for gravity conversion', async () => {
    const setGravity = vi.fn();
    const scene = createPlatformerScene({
      name: 'Test',
      gravity: 20,
      units: 'pixels',
      pixelsPerMeter: 100,
    });
    await (scene as any).onEnter(
      makeApi({
        services: { has: () => true, get: () => ({ setGravity }) },
      }),
    );
    expect(setGravity).toHaveBeenCalledWith(0, 0.2);
  });

  it('calls onEnter after applying gravity', async () => {
    const onEnter = vi.fn();
    const scene = createPlatformerScene({ name: 'Test', onEnter });
    const api = makeApi();
    await (scene as any).onEnter(api);
    expect(onEnter).toHaveBeenCalledWith(api);
  });

  it('calls onExit when provided', async () => {
    const onExit = vi.fn();
    const scene = createPlatformerScene({ name: 'Test', onExit });
    const api = makeApi();
    await (scene as any).onExit(api);
    expect(onExit).toHaveBeenCalledWith(api);
  });
});
