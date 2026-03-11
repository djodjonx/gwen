import { bench, describe } from 'vitest';
import type { EntityId } from '@djodjonx/gwen-engine-core';
import { SpriteAnimRuntime } from '../src/runtime';
import type { SpriteAnimUIExtension } from '../src/types';

const CLIP_ONLY_EXT: SpriteAnimUIExtension = {
  atlas: '/sprites/player.png',
  frame: { width: 32, height: 32, columns: 8 },
  clips: {
    idle: { row: 0, from: 0, to: 3, fps: 8, loop: true },
    run: { row: 1, from: 0, to: 5, fps: 12, loop: true },
  },
  initial: 'idle',
};

const CONTROLLER_EXT: SpriteAnimUIExtension = {
  atlas: '/sprites/player.png',
  frame: { width: 32, height: 32, columns: 8 },
  clips: {
    idle: { row: 0, from: 0, to: 3, fps: 8, loop: true },
    run: { row: 1, from: 0, to: 5, fps: 12, loop: true },
    shoot: { row: 2, from: 0, to: 2, fps: 18, loop: false, next: 'idle' },
  },
  controller: {
    initial: 'idle',
    parameters: {
      moving: { type: 'bool', default: false },
      shoot: { type: 'trigger' },
    },
    states: {
      idle: { clip: 'idle' },
      run: { clip: 'run' },
      shoot: { clip: 'shoot' },
    },
    transitions: [
      { from: 'idle', to: 'run', conditions: [{ param: 'moving', op: '==', value: true }] },
      { from: 'run', to: 'idle', conditions: [{ param: 'moving', op: '==', value: false }] },
      { from: '*', to: 'shoot', priority: 1, conditions: [{ param: 'shoot' }] },
      { from: 'shoot', to: 'idle', hasExitTime: true, exitTime: 0.95 },
    ],
  },
};

function entityIdOf(index: number): EntityId {
  return BigInt(index) as EntityId;
}

function seed(runtime: SpriteAnimRuntime, count: number, ext: SpriteAnimUIExtension): EntityId[] {
  const ids: EntityId[] = [];
  for (let i = 0; i < count; i += 1) {
    const id = entityIdOf(i + 1);
    runtime.attach('BenchUI', id, ext);
    ids.push(id);
  }
  return ids;
}

describe('sprite-anim runtime benchmarks', () => {
  bench(
    'tick clip-only x2k entities (120 frames)',
    () => {
      const runtime = new SpriteAnimRuntime();
      seed(runtime, 2_000, CLIP_ONLY_EXT);

      for (let f = 0; f < 120; f += 1) {
        runtime.tick(1 / 60);
      }
    },
    { iterations: 20 },
  );

  bench(
    'tick controller x2k entities + param churn (120 frames)',
    () => {
      const runtime = new SpriteAnimRuntime();
      const ids = seed(runtime, 2_000, CONTROLLER_EXT);

      for (let f = 0; f < 120; f += 1) {
        const moving = f % 2 === 0;
        for (let i = 0; i < ids.length; i += 1) {
          const id = ids[i];
          runtime.setParam(id, 'moving', moving);
          if (i % 10 === 0 && f % 12 === 0) runtime.setTrigger(id, 'shoot');
        }
        runtime.tick(1 / 60);
      }
    },
    { iterations: 15 },
  );

  bench(
    'tick controller x10k entities (60 frames)',
    () => {
      const runtime = new SpriteAnimRuntime();
      const ids = seed(runtime, 10_000, CONTROLLER_EXT);

      for (let i = 0; i < ids.length; i += 1) {
        runtime.setParam(ids[i], 'moving', true);
      }

      for (let f = 0; f < 60; f += 1) {
        runtime.tick(1 / 60);
      }
    },
    { iterations: 8 },
  );

  bench(
    'attach/detach churn x2k entities (pooling)',
    () => {
      const runtime = new SpriteAnimRuntime({}, { maxFrameAdvancesPerEntity: 16 });

      for (let round = 0; round < 20; round += 1) {
        const ids = seed(runtime, 2_000, CLIP_ONLY_EXT);
        for (let i = 0; i < ids.length; i += 1) {
          runtime.detach(ids[i]);
        }
      }
    },
    { iterations: 10 },
  );
});
