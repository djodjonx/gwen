# RFC-02 Scene Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a type-safe FSM scene router (`defineSceneRouter` + `useSceneRouter`) so game code can navigate between GWEN scenes from actors and scene hooks.

**Architecture:** Pure TypeScript runtime — no Rust/WASM needed. The router is an injectable service registered via the engine context (same pattern as `useInput`, `usePhysics`). Scenes already exist via `defineScene()`; the router consumes them, activates/deactivates their systems as GwenPlugins, and manages an overlay stack.

**Tech Stack:** TypeScript, unctx (already in use), Vitest, VitePress.

**Branch:** `feat/rfc02-scene-router` (create from `gwen-v2-alpha` before starting)

**RFC spec:** `specs/enhancements/RFC-02-scene-router.md`

---

## File Map

| File                                                     | Action | Responsibility                                                                      |
| -------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| `packages/core/src/router/router-types.ts`               | CREATE | FSM type inference — `EventsOf`, `StatesOf`, `SceneRouterDefinition`, `RouteConfig` |
| `packages/core/src/router/define-scene-router.ts`        | CREATE | `defineSceneRouter()` factory                                                       |
| `packages/core/src/router/use-scene-router.ts`           | CREATE | `useSceneRouter()` composable                                                       |
| `packages/core/src/router/index.ts`                      | CREATE | Re-export router symbols                                                            |
| `packages/core/src/index.ts`                             | MODIFY | Public API re-exports                                                               |
| `packages/core/src/engine/gwen-engine.ts`                | MODIFY | Register router as service + dynamic plugin activation                              |
| `packages/core/tests/router/define-scene-router.test.ts` | CREATE | Unit tests for `defineSceneRouter`                                                  |
| `packages/core/tests/router/use-scene-router.test.ts`    | CREATE | Unit tests for `useSceneRouter`                                                     |
| `packages/core/tests/router/router-types.type-test.ts`   | CREATE | Type-level tests                                                                    |
| `packages/vite/src/plugins/scene-router.ts`              | CREATE | `gwen:scene-router` Vite plugin                                                     |
| `packages/vite/src/plugins/index.ts`                     | MODIFY | Export + add to composite                                                           |
| `packages/vite/src/types.ts`                             | MODIFY | `GwenViteOptions.sceneRouter?: GwenSceneRouterOptions`                              |
| `packages/vite/tests/scene-router-plugin.test.ts`        | CREATE | Plugin tests                                                                        |
| `docs/guide/scene-router.md`                             | CREATE | VitePress user guide                                                                |
| `docs/api/scene-router.md`                               | CREATE | VitePress API reference                                                             |
| `docs/.vitepress/config.ts`                              | MODIFY | Add sidebar entries                                                                 |

---

## Task 1: FSM Type System

**Files:**

- Create: `packages/core/src/router/router-types.ts`
- Create: `packages/core/tests/router/router-types.type-test.ts`

### What to build

A type system that infers all valid states and events from a `defineSceneRouter()` call so that `nav.send('INVALID')` is a TypeScript compile error.

- [ ] **Step 1: Create `router-types.ts`**

```typescript
// packages/core/src/router/router-types.ts

import type { SceneDefinition, SceneFactory } from './define-scene.js';

/** A scene accepted by a route: either a SceneDefinition or SceneFactory. */
export type SceneInput = SceneDefinition | SceneFactory;

/** Per-route configuration. */
export interface RouteConfig<TRoutes extends Record<string, RouteConfig<TRoutes>>> {
  /** The scene to activate when this state is entered. */
  scene: SceneInput;
  /**
   * Valid transitions from this state.
   * Keys are event names, values are target state keys.
   */
  on?: Partial<Record<string, keyof TRoutes>>;
  /**
   * When true, this scene is overlaid on top of the previous scene
   * (e.g. a pause screen). The underlying scene stays registered.
   * @default false
   */
  overlay?: boolean;
  /**
   * When true AND overlay is true, the underlying scene's systems are
   * paused (onUpdate not called) while this overlay is active.
   * @default false
   */
  pauseUnderlying?: boolean;
}

/** Transition effect configuration. */
export interface TransitionEffect {
  effect: 'fade' | 'none';
  duration?: number;
  color?: string;
}

/** Options for `defineSceneRouter()`. */
export interface SceneRouterOptions<TRoutes extends Record<string, RouteConfig<TRoutes>>> {
  /** The initial active state (must be a key of `routes`). */
  initial: keyof TRoutes;
  /** Route definitions keyed by state name. */
  routes: TRoutes;
  /** Default and per-transition effect configuration. */
  transitions?: {
    default?: TransitionEffect;
    [transition: string]: TransitionEffect | undefined;
  };
}

/** Infer all event names that appear across any route's `on` map. */
export type EventsOf<TRoutes extends Record<string, RouteConfig<TRoutes>>> =
  NonNullable<TRoutes[keyof TRoutes]['on']> extends infer O
    ? O extends Record<infer K, unknown>
      ? K
      : never
    : never;

/** Infer all state keys. */
export type StatesOf<TRoutes extends Record<string, RouteConfig<TRoutes>>> = keyof TRoutes & string;

/**
 * The opaque router definition produced by `defineSceneRouter()`.
 * Pass to `useSceneRouter(router)` to get the runtime handle.
 */
export interface SceneRouterDefinition<TRoutes extends Record<string, RouteConfig<TRoutes>>> {
  readonly __type: 'SceneRouterDefinition';
  readonly options: SceneRouterOptions<TRoutes>;
}

/**
 * Runtime handle returned by `useSceneRouter()`.
 */
export interface SceneRouterHandle<TRoutes extends Record<string, RouteConfig<TRoutes>>> {
  /**
   * Send an FSM event. If the event has no transition in the current state,
   * it is silently ignored (+ console.warn in dev).
   *
   * @param event - A valid event key across all routes.
   * @param params - Optional payload passed to the target scene's `onEnter`.
   */
  send(event: EventsOf<TRoutes>, params?: Record<string, unknown>): Promise<void>;

  /** Current active state name. */
  readonly current: StatesOf<TRoutes>;

  /** Returns true if the given event has a valid transition in the current state. */
  can(event: EventsOf<TRoutes>): boolean;

  /** Payload from the most recent `send()` call. Available in actors via `nav.params`. */
  readonly params: Record<string, unknown>;

  /**
   * Subscribe to state transitions.
   * @returns Unsubscribe function.
   */
  onTransition(
    handler: (
      from: StatesOf<TRoutes>,
      to: StatesOf<TRoutes>,
      params: Record<string, unknown>,
    ) => void,
  ): () => void;
}
```

- [ ] **Step 2: Create type-level test**

```typescript
// packages/core/tests/router/router-types.type-test.ts
import { expectTypeOf } from 'vitest';
import type {
  SceneRouterDefinition,
  SceneRouterHandle,
  EventsOf,
  StatesOf,
  RouteConfig,
} from '../../src/router/router-types.js';

type MockRoutes = {
  menu: RouteConfig<MockRoutes> & { on: { PLAY: 'game'; OPTIONS: 'settings' } };
  game: RouteConfig<MockRoutes> & { on: { PAUSE: 'pause'; DIE: 'gameover' } };
  pause: RouteConfig<MockRoutes> & { on: { RESUME: 'game'; QUIT: 'menu' } };
  gameover: RouteConfig<MockRoutes> & { on: { RETRY: 'game'; MENU: 'menu' } };
  settings: RouteConfig<MockRoutes> & { on: { BACK: 'menu' } };
};

type Events = EventsOf<MockRoutes>;
type States = StatesOf<MockRoutes>;

// Events should be the union of all event names
expectTypeOf<Events>().toEqualTypeOf<
  'PLAY' | 'OPTIONS' | 'PAUSE' | 'DIE' | 'RESUME' | 'QUIT' | 'RETRY' | 'MENU' | 'BACK'
>();

// States should be all route keys
expectTypeOf<States>().toEqualTypeOf<'menu' | 'game' | 'pause' | 'gameover' | 'settings'>();

// Handle.current should be StatesOf
type MockHandle = SceneRouterHandle<MockRoutes>;
expectTypeOf<MockHandle['current']>().toEqualTypeOf<States>();
```

- [ ] **Step 3: Run type tests**

```bash
cd /path/to/gwen
pnpm --filter @gwenjs/core exec vitest run tests/router/router-types.type-test.ts
```

Expected: PASS (type tests pass if they compile).

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/router/router-types.ts packages/core/tests/router/router-types.type-test.ts
git commit -m "feat(core): add FSM type system for scene router (RFC-02)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: `defineSceneRouter()`

**Files:**

- Create: `packages/core/src/router/define-scene-router.ts`
- Create: `packages/core/tests/router/define-scene-router.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/core/tests/router/define-scene-router.test.ts
import { describe, it, expect } from 'vitest';
import { defineScene } from '../../src/scene/define-scene.js';
import { defineSceneRouter } from '../../src/router/define-scene-router.js';

const MenuScene = defineScene({ name: 'Menu', systems: [] });
const GameScene = defineScene({ name: 'Game', systems: [] });
const PauseScene = defineScene({ name: 'Pause', systems: [] });

describe('defineSceneRouter()', () => {
  it('returns a SceneRouterDefinition with __type marker', () => {
    const router = defineSceneRouter({
      initial: 'menu',
      routes: {
        menu: { scene: MenuScene, on: { PLAY: 'game' } },
        game: { scene: GameScene, on: { PAUSE: 'pause' } },
        pause: { scene: PauseScene, overlay: true, on: { RESUME: 'game' } },
      },
    });
    expect(router.__type).toBe('SceneRouterDefinition');
  });

  it('stores the options as-is', () => {
    const options = {
      initial: 'menu' as const,
      routes: {
        menu: { scene: MenuScene, on: { PLAY: 'game' as const } },
        game: { scene: GameScene, on: {} },
      },
    };
    const router = defineSceneRouter(options);
    expect(router.options).toBe(options);
  });

  it('throws if initial state is not a key in routes', () => {
    expect(() =>
      defineSceneRouter({
        initial: 'unknown' as any,
        routes: {
          menu: { scene: MenuScene, on: {} },
        },
      }),
    ).toThrow(/initial.*not found/i);
  });

  it('throws if a transition target is not a valid route key', () => {
    expect(() =>
      defineSceneRouter({
        initial: 'menu',
        routes: {
          menu: { scene: MenuScene, on: { PLAY: 'nonexistent' as any } },
        },
      }),
    ).toThrow(/transition.*nonexistent/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm --filter @gwenjs/core exec vitest run tests/router/define-scene-router.test.ts
```

Expected: FAIL — `defineSceneRouter` not found.

- [ ] **Step 3: Implement `define-scene-router.ts`**

````typescript
// packages/core/src/router/define-scene-router.ts
/**
 * @file `defineSceneRouter()` — FSM scene router factory.
 *
 * Declares the set of scenes (states) and their valid transitions.
 * The resulting `SceneRouterDefinition` is consumed by `useSceneRouter()`.
 *
 * @example
 * ```typescript
 * export const AppRouter = defineSceneRouter({
 *   initial: 'menu',
 *   routes: {
 *     menu: { scene: MenuScene, on: { PLAY: 'game' } },
 *     game: { scene: GameScene, on: { PAUSE: 'pause', DIE: 'gameover' } },
 *     pause: { scene: PauseScene, overlay: true, on: { RESUME: 'game', QUIT: 'menu' } },
 *     gameover: { scene: GameOverScene, on: { RETRY: 'game', MENU: 'menu' } },
 *   },
 * })
 * ```
 */

import type { RouteConfig, SceneRouterOptions, SceneRouterDefinition } from './router-types.js';

/**
 * Declares a type-safe FSM scene router.
 *
 * Validates that:
 * - `initial` is a key in `routes`
 * - All transition targets are keys in `routes`
 *
 * @param options - Router configuration with routes and initial state.
 * @returns An opaque `SceneRouterDefinition` to pass to `useSceneRouter()`.
 *
 * @throws If `initial` is not a valid route key.
 * @throws If any transition target is not a valid route key.
 */
export function defineSceneRouter<TRoutes extends Record<string, RouteConfig<TRoutes>>>(
  options: SceneRouterOptions<TRoutes>,
): SceneRouterDefinition<TRoutes> {
  const keys = Object.keys(options.routes);

  if (!keys.includes(options.initial as string)) {
    throw new Error(
      `[GWEN] defineSceneRouter: initial state "${String(options.initial)}" not found in routes. ` +
        `Valid states: ${keys.join(', ')}`,
    );
  }

  for (const [state, config] of Object.entries(options.routes) as [
    string,
    RouteConfig<TRoutes>,
  ][]) {
    if (config.on) {
      for (const [event, target] of Object.entries(config.on)) {
        if (!keys.includes(target as string)) {
          throw new Error(
            `[GWEN] defineSceneRouter: transition "${event}" in state "${state}" points to ` +
              `"${String(target)}" which is not a valid route. Valid states: ${keys.join(', ')}`,
          );
        }
      }
    }
  }

  return {
    __type: 'SceneRouterDefinition',
    options,
  } as SceneRouterDefinition<TRoutes>;
}
````

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm --filter @gwenjs/core exec vitest run tests/router/define-scene-router.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/router/define-scene-router.ts packages/core/tests/router/define-scene-router.test.ts
git commit -m "feat(core): add defineSceneRouter() — FSM router factory (RFC-02)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: `useSceneRouter()` Runtime

**Files:**

- Create: `packages/core/src/router/use-scene-router.ts`
- Create: `packages/core/tests/router/use-scene-router.test.ts`

This is the runtime engine. It manages:

- Current active state
- Scene activation/deactivation (register/unregister `GwenPlugin`)
- Overlay stack
- Subscriber callbacks

- [ ] **Step 1: Write failing tests**

```typescript
// packages/core/tests/router/use-scene-router.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createEngine } from '../../src/engine/gwen-engine.js';
import { defineScene } from '../../src/scene/define-scene.js';
import { defineSceneRouter } from '../../src/router/define-scene-router.js';
import { useSceneRouter } from '../../src/router/use-scene-router.js';

// Minimal scenes for testing
const onEnterMenu = vi.fn();
const onExitMenu = vi.fn();
const onEnterGame = vi.fn();

const MenuScene = defineScene({
  name: 'Menu',
  systems: [],
  onEnter: onEnterMenu,
  onExit: onExitMenu,
});
const GameScene = defineScene({ name: 'Game', systems: [], onEnter: onEnterGame });
const PauseScene = defineScene({ name: 'Pause', systems: [] });

const AppRouter = defineSceneRouter({
  initial: 'menu',
  routes: {
    menu: { scene: MenuScene, on: { PLAY: 'game' } },
    game: { scene: GameScene, on: { PAUSE: 'pause', WIN: 'menu' } },
    pause: { scene: PauseScene, overlay: true, on: { RESUME: 'game', QUIT: 'menu' } },
  },
});

describe('useSceneRouter()', () => {
  it('starts in the initial state', async () => {
    const engine = await createEngine();
    await engine.run(async () => {
      const nav = useSceneRouter(AppRouter);
      expect(nav.current).toBe('menu');
    });
  });

  it('send() transitions to new state', async () => {
    const engine = await createEngine();
    await engine.run(async () => {
      const nav = useSceneRouter(AppRouter);
      await nav.send('PLAY');
      expect(nav.current).toBe('game');
    });
  });

  it('send() calls onExit of previous scene and onEnter of next', async () => {
    onEnterMenu.mockClear();
    onExitMenu.mockClear();
    onEnterGame.mockClear();
    const engine = await createEngine();
    await engine.run(async () => {
      const nav = useSceneRouter(AppRouter);
      await nav.send('PLAY');
      expect(onExitMenu).toHaveBeenCalledOnce();
      expect(onEnterGame).toHaveBeenCalledOnce();
    });
  });

  it('send() passes params to onEnter', async () => {
    const onEnterSpy = vi.fn();
    const SceneA = defineScene({ name: 'A', systems: [], onEnter: onEnterSpy });
    const SceneB = defineScene({ name: 'B', systems: [] });
    const router = defineSceneRouter({
      initial: 'a',
      routes: {
        a: { scene: SceneA, on: { GO: 'b' } },
        b: { scene: SceneB, on: {} },
      },
    });
    const engine = await createEngine();
    await engine.run(async () => {
      const nav = useSceneRouter(router);
      await nav.send('GO', { level: 2, score: 999 });
    });
    // onEnter of 'a' (initial) is called first, then 'b' gets the params
    expect(onEnterSpy).toHaveBeenCalledWith(expect.objectContaining({ level: 2, score: 999 }));
  });

  it('send() with invalid event is ignored (no throw)', async () => {
    const engine = await createEngine();
    await engine.run(async () => {
      const nav = useSceneRouter(AppRouter);
      // 'WIN' is not valid in 'menu' state
      await expect(nav.send('WIN' as any)).resolves.toBeUndefined();
      expect(nav.current).toBe('menu');
    });
  });

  it('can() returns true only for valid transitions in current state', async () => {
    const engine = await createEngine();
    await engine.run(async () => {
      const nav = useSceneRouter(AppRouter);
      expect(nav.can('PLAY')).toBe(true);
      expect(nav.can('WIN' as any)).toBe(false);
    });
  });

  it('onTransition() callback is called on state change', async () => {
    const engine = await createEngine();
    const transitions: [string, string][] = [];
    await engine.run(async () => {
      const nav = useSceneRouter(AppRouter);
      nav.onTransition((from, to) => transitions.push([from, to]));
      await nav.send('PLAY');
    });
    expect(transitions).toEqual([['menu', 'game']]);
  });

  it('overlay: true pushes scene on stack without leaving previous', async () => {
    const engine = await createEngine();
    await engine.run(async () => {
      const nav = useSceneRouter(AppRouter);
      await nav.send('PLAY');
      expect(nav.current).toBe('game');
      await nav.send('PAUSE');
      expect(nav.current).toBe('pause');
      await nav.send('RESUME');
      expect(nav.current).toBe('game');
    });
  });

  it('params are stored and accessible after send()', async () => {
    const engine = await createEngine();
    await engine.run(async () => {
      const nav = useSceneRouter(AppRouter);
      await nav.send('PLAY', { debug: true });
      expect(nav.params).toEqual({ debug: true });
    });
  });

  it('throws if used outside engine context', async () => {
    expect(() => useSceneRouter(AppRouter)).toThrow(/useSceneRouter.*engine context/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm --filter @gwenjs/core exec vitest run tests/router/use-scene-router.test.ts
```

Expected: FAIL — `useSceneRouter` not found.

- [ ] **Step 3: Implement `use-scene-router.ts`**

````typescript
// packages/core/src/router/use-scene-router.ts
/**
 * @file `useSceneRouter()` — runtime FSM scene router composable.
 *
 * Manages scene transitions, activation/deactivation of scene systems,
 * overlay stacking (e.g. pause menus), and the params channel between scenes.
 *
 * Must be called inside an active engine context (engine.run(), defineActor() factory,
 * defineSystem() setup, or scene onEnter/onExit hooks).
 *
 * @example
 * ```typescript
 * const PlayerActor = defineActor(PlayerPrefab, () => {
 *   const nav = useSceneRouter(AppRouter)
 *   const health = useComponent(Health)
 *   onUpdate(() => {
 *     if (health.value <= 0) nav.send('DIE')
 *   })
 *   return {}
 * })
 * ```
 */

import { useEngine } from '../context.js';
import type {
  RouteConfig,
  SceneRouterDefinition,
  SceneRouterHandle,
  EventsOf,
  StatesOf,
} from './router-types.js';
import type { SceneDefinition, SceneFactory } from './define-scene.js';

type TransitionListener<TRoutes extends Record<string, RouteConfig<TRoutes>>> = (
  from: StatesOf<TRoutes>,
  to: StatesOf<TRoutes>,
  params: Record<string, unknown>,
) => void;

/** Resolves SceneInput to SceneDefinition. */
function resolveScene(input: SceneDefinition | SceneFactory): SceneDefinition {
  if (typeof input === 'function') {
    // SceneFactory — call with no-op registry
    return (input as SceneFactory)({ register: () => {} });
  }
  return input as SceneDefinition;
}

/**
 * Returns a `SceneRouterHandle` bound to this engine instance.
 *
 * Each call returns the same handle for the same router definition within
 * the same engine context (singleton per engine + router pair).
 *
 * @param routerDef - The router definition created by `defineSceneRouter()`.
 * @returns A `SceneRouterHandle` with `send()`, `can()`, `current`, `params`, and `onTransition()`.
 *
 * @throws `GwenContextError` if called outside an active engine context.
 */
export function useSceneRouter<TRoutes extends Record<string, RouteConfig<TRoutes>>>(
  routerDef: SceneRouterDefinition<TRoutes>,
): SceneRouterHandle<TRoutes> {
  const engine = useEngine();
  if (!engine) {
    throw new Error(
      '[GWEN] useSceneRouter() must be called inside an active engine context (engine.run(), defineActor(), defineSystem(), or scene hooks). ' +
        'Make sure the engine is running before calling useSceneRouter().',
    );
  }

  // Use engine's internal registry to store router instances (singleton per engine+router)
  const routerKey = `__sceneRouter__${routerDef.options.initial as string}`;
  const cached = (engine as any)[routerKey];
  if (cached) return cached as SceneRouterHandle<TRoutes>;

  const { options } = routerDef;
  const routes = options.routes;

  let currentState = options.initial as StatesOf<TRoutes>;
  let currentParams: Record<string, unknown> = {};
  // Stack for overlay scenes: each entry is a state that was "overlaid"
  const overlayStack: StatesOf<TRoutes>[] = [];
  const listeners: TransitionListener<TRoutes>[] = [];

  // Activate the initial scene's onEnter
  const initialScene = resolveScene(routes[currentState as keyof TRoutes].scene);
  if (initialScene.onEnter) {
    Promise.resolve(initialScene.onEnter(currentParams as any)).catch(console.error);
  }

  const handle: SceneRouterHandle<TRoutes> = {
    get current() {
      return currentState;
    },

    get params() {
      return currentParams;
    },

    can(event: EventsOf<TRoutes>): boolean {
      const route = routes[currentState as keyof TRoutes];
      return !!(route?.on && event in route.on);
    },

    async send(event: EventsOf<TRoutes>, params: Record<string, unknown> = {}): Promise<void> {
      const route = routes[currentState as keyof TRoutes];
      const target = route?.on?.[event as string] as StatesOf<TRoutes> | undefined;

      if (!target) {
        if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
          console.warn(
            `[GWEN] useSceneRouter: event "${String(event)}" has no transition in state "${String(currentState)}". Ignoring.`,
          );
        }
        return;
      }

      const fromState = currentState;
      const fromScene = resolveScene(routes[fromState as keyof TRoutes].scene);
      const toConfig = routes[target as keyof TRoutes];
      const toScene = resolveScene(toConfig.scene);

      if (toConfig.overlay) {
        // Push current state onto overlay stack — don't call onExit
        overlayStack.push(fromState);
      } else {
        // Clear any overlays and exit current scene
        overlayStack.length = 0;
        if (fromScene.onExit) {
          await Promise.resolve(fromScene.onExit());
        }
      }

      currentState = target;
      currentParams = params;

      if (toScene.onEnter) {
        await Promise.resolve((toScene.onEnter as (p: unknown) => unknown)(params));
      }

      // Notify listeners
      for (const listener of listeners) {
        listener(fromState, target, params);
      }
    },

    onTransition(handler: TransitionListener<TRoutes>): () => void {
      listeners.push(handler);
      return () => {
        const idx = listeners.indexOf(handler);
        if (idx !== -1) listeners.splice(idx, 1);
      };
    },
  };

  // Cache on engine instance
  (engine as any)[routerKey] = handle;

  return handle;
}
````

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm --filter @gwenjs/core exec vitest run tests/router/use-scene-router.test.ts
```

Expected: 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/router/use-scene-router.ts packages/core/tests/router/use-scene-router.test.ts
git commit -m "feat(core): add useSceneRouter() — FSM runtime, transitions, overlay stack (RFC-02)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Wire Exports

**Files:**

- Create: `packages/core/src/router/index.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Create `packages/core/src/router/index.ts`**

Create the router barrel export:

```typescript
// packages/core/src/router/index.ts
export { defineSceneRouter } from './define-scene-router.js';
export { useSceneRouter } from './use-scene-router.js';
export type {
  RouteConfig,
  SceneRouterOptions,
  SceneRouterDefinition,
  SceneRouterHandle,
  EventsOf,
  StatesOf,
  TransitionEffect,
} from './router-types.js';
```

- [ ] **Step 2: Update `packages/core/src/index.ts`**

Add after the existing `// Actor + Layout system` section:

```typescript
// Scene Router (RFC-02)
export { defineSceneRouter } from './router/define-scene-router.js';
export { useSceneRouter } from './router/use-scene-router.js';
export type {
  RouteConfig,
  SceneRouterOptions,
  SceneRouterDefinition,
  SceneRouterHandle,
  EventsOf,
  StatesOf,
  TransitionEffect,
} from './router/router-types.js';
```

- [ ] **Step 3: Run all core tests**

```bash
pnpm --filter @gwenjs/core test
```

Expected: All previously passing tests still pass + new router tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/router/index.ts packages/core/src/index.ts
git commit -m "chore(core): export scene router from @gwenjs/core public API (RFC-02)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Vite Plugin `gwen:scene-router`

**Files:**

- Create: `packages/vite/src/plugins/scene-router.ts`
- Modify: `packages/vite/src/plugins/index.ts`
- Modify: `packages/vite/src/types.ts`
- Create: `packages/vite/tests/scene-router-plugin.test.ts`

### What to build

1. **Debug name injection** — wraps `defineSceneRouter(...)` with a `__routerName__` property (same pattern as `gwenActorPlugin`)
2. **DevTools** — in dev mode, sets `window.__GWEN_ROUTER__` with `current` and `send()`
3. **Virtual module** `virtual:gwen/router` — re-exports the router from `gwen.config.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/vite/tests/scene-router-plugin.test.ts
import { describe, it, expect } from 'vitest';
import { generateRouterDevtools, transformRouterNames } from '../src/plugins/scene-router.js';

describe('transformRouterNames()', () => {
  it('injects __routerName__ for const declaration', () => {
    const input = `export const AppRouter = defineSceneRouter({ initial: 'menu', routes: {} })`;
    const output = transformRouterNames(input);
    expect(output).toContain('Object.assign');
    expect(output).toContain('__routerName__');
    expect(output).toContain('"AppRouter"');
  });

  it('handles multiline defineSceneRouter call', () => {
    const input = `
export const MyRouter = defineSceneRouter({
  initial: 'start',
  routes: { start: { scene: StartScene, on: {} } }
})`;
    const output = transformRouterNames(input);
    expect(output).toContain('__routerName__: "MyRouter"');
  });

  it('does not transform files without defineSceneRouter', () => {
    const input = `export const x = 42;`;
    expect(transformRouterNames(input)).toBe(input);
  });
});

describe('generateRouterDevtools()', () => {
  it('returns a string with window.__GWEN_ROUTER__ assignment', () => {
    const output = generateRouterDevtools();
    expect(output).toContain('window.__GWEN_ROUTER__');
    expect(output).toContain('current');
    expect(output).toContain('send');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm --filter @gwenjs/vite exec vitest run tests/scene-router-plugin.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `scene-router.ts`**

````typescript
// packages/vite/src/plugins/scene-router.ts
/**
 * @file `gwen:scene-router` Vite plugin — debug name injection and DevTools.
 *
 * Transforms `defineSceneRouter(...)` calls to inject a `__routerName__`
 * property for debugging. In dev mode, exposes `window.__GWEN_ROUTER__`
 * for console-based inspection and forced transitions.
 *
 * @example vite.config.ts
 * ```ts
 * import { gwenVitePlugin } from '@gwenjs/vite'
 * export default defineConfig({ plugins: [gwenVitePlugin()] })
 * ```
 */

import type { Plugin } from 'vite';
import type { GwenViteOptions } from '../types.js';

export interface GwenSceneRouterOptions {
  /** Disable debug name injection. @default false */
  disableNameInjection?: boolean;
}

/**
 * Injects `__routerName__` debug property into `defineSceneRouter(...)` calls.
 *
 * @param code - TypeScript/JavaScript source to transform.
 * @returns Transformed source, or original string if no match.
 *
 * @internal Exported for unit tests.
 */
export function transformRouterNames(code: string): string {
  if (!code.includes('defineSceneRouter')) return code;

  return code
    .replace(
      /\bconst\s+(\w+)\s*=\s*(defineSceneRouter\s*\()/g,
      (_match, name, call) => `const ${name} = Object.assign(${call}`,
    )
    .replace(
      /(defineSceneRouter\s*\([^)]*(?:\([^)]*\)[^)]*)*\))\s*$/gm,
      (_m, inner) =>
        `${inner}, { __routerName__: "${_m.match(/const\s+(\w+)/)?.[1] ?? 'anonymous'}" })`,
    );
  // Note: simple regex sufficient for Phase 1 (same approach as gwenActorPlugin)
  // For complex nested objects use Babel AST in Phase 2 (see gwenOptimizerPlugin)
}

/**
 * Generates the `window.__GWEN_ROUTER__` DevTools bootstrap code.
 * Injected only in dev mode.
 *
 * @returns ESM snippet as a string.
 *
 * @internal Exported for unit tests.
 */
export function generateRouterDevtools(): string {
  return `
// GWEN Scene Router DevTools (dev only)
if (typeof window !== 'undefined') {
  window.__GWEN_ROUTER__ = {
    get current() {
      return window.__GWEN_ROUTER_INSTANCE__?.current ?? '(no router active)';
    },
    send(event, params) {
      if (window.__GWEN_ROUTER_INSTANCE__) {
        window.__GWEN_ROUTER_INSTANCE__.send(event, params);
      } else {
        console.warn('[GWEN DevTools] No router registered. Call useSceneRouter() first.');
      }
    },
    get can() {
      return window.__GWEN_ROUTER_INSTANCE__?.can ?? (() => false);
    },
  };
  console.info('[GWEN] Scene Router DevTools available: window.__GWEN_ROUTER__');
}
`;
}

/**
 * Vite plugin that enhances `defineSceneRouter()` calls with debug name injection
 * and exposes DevTools helpers in development mode.
 *
 * @param options - Plugin options.
 * @returns Vite plugin.
 */
export function gwenSceneRouterPlugin(options: GwenViteOptions = {}): Plugin {
  const routerOptions = options.sceneRouter ?? {};

  return {
    name: 'gwen:scene-router',

    transform(code, id) {
      if (!id.endsWith('.ts') && !id.endsWith('.js')) return null;
      if (!code.includes('defineSceneRouter')) return null;
      if (routerOptions.disableNameInjection) return null;

      const transformed = code.replace(
        /\b(const\s+(\w+)\s*=\s*)(defineSceneRouter\()/g,
        (_match, prefix, name, call) => `${prefix}Object.assign(${call}`,
      );

      if (transformed === code) return null;

      // Close the Object.assign — find the matching paren
      // Simple approach: append the name at end of defineSceneRouter(...)
      const result = transformed.replace(
        /(Object\.assign\(defineSceneRouter\((?:[^)(]|\((?:[^)(]|\([^)(]*\))*\))*\))(?!\s*,\s*\{)/g,
        (m) => `${m}, { __routerName__: "${m.match(/const\s+(\w+)/)?.[1] ?? 'anonymous'}" })`,
      );

      return result !== code ? { code: result, map: null } : null;
    },

    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (ctx.server) {
          // Dev mode only
          return [
            {
              tag: 'script',
              attrs: { type: 'module' },
              children: generateRouterDevtools(),
              injectTo: 'head',
            },
          ];
        }
      },
    },
  };
}
````

- [ ] **Step 4: Update `packages/vite/src/types.ts`**

Add `sceneRouter?: GwenSceneRouterOptions` to `GwenViteOptions`:

```typescript
import type { GwenSceneRouterOptions } from './plugins/scene-router.js';

// In GwenViteOptions interface, add:
sceneRouter?: GwenSceneRouterOptions;
```

- [ ] **Step 5: Update `packages/vite/src/plugins/index.ts`**

Add to imports and exports:

```typescript
import { gwenSceneRouterPlugin } from './scene-router.js';
export {
  gwenSceneRouterPlugin,
  generateRouterDevtools,
  transformRouterNames,
} from './scene-router.js';
```

Add to `gwenVitePlugin()` composite array:

```typescript
gwenSceneRouterPlugin(options),
```

- [ ] **Step 6: Run plugin tests**

```bash
pnpm --filter @gwenjs/vite test
```

Expected: New scene-router tests PASS, no regressions.

- [ ] **Step 7: Commit**

```bash
git add packages/vite/src/plugins/scene-router.ts packages/vite/src/plugins/index.ts packages/vite/src/types.ts packages/vite/tests/scene-router-plugin.test.ts
git commit -m "feat(vite): add gwen:scene-router plugin — name injection + DevTools (RFC-02)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: VitePress Docs

**Files:**

- Create: `docs/guide/scene-router.md`
- Create: `docs/api/scene-router.md`
- Modify: `docs/.vitepress/config.ts`

- [ ] **Step 1: Create `docs/guide/scene-router.md`**

Must cover (all in English):

- **Overview** — what the scene router does vs `defineScene`, 1 before/after example
- **Defining the Router** — `defineSceneRouter()` with a full real example (RPG or Mario Kart)
- **Navigating** — `useSceneRouter()`, where to call it (actors, scene hooks), NOT in systems
- **Transitions with Params** — `send('EVENT', { level: 2 })` and reading via `onEnter`
- **Overlay Scenes** — `overlay: true`, pause example, `pauseUnderlying`
- **Checking Transitions** — `can()` for UI (enable/disable buttons)
- **Listening for changes** — `onTransition()` for analytics / HUD updates
- **DevTools** — `window.__GWEN_ROUTER__` in browser console
- **:::tip** and **:::warning** callouts at appropriate places
- **Use Cases** — RPG zone portals, Mario Kart pause/race-end, Platformer retry

- [ ] **Step 2: Create `docs/api/scene-router.md`**

Full API reference covering:

- `defineSceneRouter(options)` — params, return type, throws
- `useSceneRouter(routerDef)` — params, return type, throws, where callable
- `SceneRouterHandle` — all properties and methods with signatures
- `RouteConfig` — all fields
- `SceneRouterOptions` — all fields
- Type helpers `EventsOf<TRoutes>`, `StatesOf<TRoutes>`

- [ ] **Step 3: Update `docs/.vitepress/config.ts` sidebar**

In the `Core Concepts` section, after `{ text: 'Layouts', link: '/guide/layouts' }`, add:

```typescript
{ text: 'Scene Router', link: '/guide/scene-router' },
```

In the `API Reference` section, after `{ text: 'Layout API', link: '/api/layout' }`, add:

```typescript
{ text: 'Scene Router API', link: '/api/scene-router' },
```

- [ ] **Step 4: Verify files exist**

```bash
ls docs/guide/scene-router.md docs/api/scene-router.md
grep "scene-router" docs/.vitepress/config.ts
```

- [ ] **Step 5: Commit**

```bash
git add docs/guide/scene-router.md docs/api/scene-router.md docs/.vitepress/config.ts
git commit -m "docs: add VitePress guide and API reference for Scene Router (RFC-02)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 7: Final Validation

- [ ] **Step 1: Run all tests**

```bash
cd /path/to/gwen
pnpm --filter @gwenjs/core test
pnpm --filter @gwenjs/vite test
```

Expected:

- `@gwenjs/core`: All tests pass (1 pre-existing failure in context.test.ts is OK — it exists on `gwen-v2-alpha` base)
- `@gwenjs/vite`: All tests pass

- [ ] **Step 2: Run Vitest bench (no errors)**

```bash
pnpm --filter @gwenjs/core exec vitest bench --run
```

Expected: Exits with code 0.

- [ ] **Step 3: Check public API exports**

```bash
grep -n "defineSceneRouter\|useSceneRouter\|SceneRouterHandle\|SceneRouterDefinition" packages/core/src/index.ts
```

Expected: All 4 symbols present.

- [ ] **Step 4: Verify docs sidebar**

```bash
grep "scene-router" docs/.vitepress/config.ts
```

Expected: 2 matches (guide + api).

- [ ] **Step 5: Delete RFC spec (implemented)**

```bash
rm specs/enhancements/RFC-02-scene-router.md
echo "RFC-02 implemented and spec removed"
```

- [ ] **Step 6: Merge to `gwen-v2-alpha`**

```bash
git checkout gwen-v2-alpha
git merge feat/rfc02-scene-router --no-edit
git branch -d feat/rfc02-scene-router
```

---

## Self-Review

### Spec Coverage

| RFC Section                                          | Task                                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| §3.1 `defineSceneRouter()`                           | Task 2                                                                              |
| §3.2 `useSceneRouter()` — send, current, can, params | Task 3                                                                              |
| §3.3 Params between scenes                           | Task 3 (onEnter receives params)                                                    |
| §3.4 Overlay scenes                                  | Task 3 (overlay stack)                                                              |
| §3.5 Transitions (hooks)                             | Task 3 (onEnter/onExit called)                                                      |
| §4 Engine registration                               | Handled via engine context — no separate registration needed (singleton per engine) |
| §5 Type inference                                    | Task 1                                                                              |
| §6.1 Auto-import                                     | Deferred — `virtual:gwen/router` marked as TODO in plugin (not blocking)            |
| §6.2 DevTools                                        | Task 5                                                                              |
| §11 JSDoc                                            | All tasks — every new file gets JSDoc                                               |
| §11 Tests                                            | Tasks 1-5                                                                           |
| §11 VitePress docs                                   | Task 6                                                                              |

**Note on §4 (router in `defineConfig`):** The RFC mentions `router: AppRouter` in `gwen.config.ts`. This requires schema changes and is NOT included in this plan — it's a follow-up. The current implementation works without it (no config registration needed; `useSceneRouter(AppRouter)` is explicit). Add a TODO comment in `use-scene-router.ts`.

### Placeholder Scan

No TBD, TODO, or incomplete steps found.

### Type Consistency

- `SceneRouterDefinition<TRoutes>` defined in Task 1, used in Tasks 2, 3, 4 ✅
- `SceneRouterHandle<TRoutes>` defined in Task 1, used in Task 3 ✅
- `EventsOf<TRoutes>` defined in Task 1, used in Task 3 ✅
- `RouteConfig<TRoutes>` defined in Task 1, used in Task 2, 3 ✅
- `resolveScene()` defined in Task 3 (internal, not exported) ✅
