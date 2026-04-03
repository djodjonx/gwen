# Scene Router

The Scene Router is GWEN's declarative state machine for orchestrating scene transitions. It replaces manual boolean flags and ad-hoc state checks with a clean, testable FSM (finite state machine) that coordinates which scene is active, overlays, and transitions. 

**Before:**
```typescript
// Manual state flags
let inBattle = false, inPause = false;
if (inBattle) showBattleScene();
if (inPause) showPauseMenu();
```
**After:**
```typescript
// Declarative router
const router = defineSceneRouter({ ... });
useSceneRouter(router);
```

---

## Defining the Router

Use `defineSceneRouter()` to declare your scene flow. For example, in an RPG:

```typescript
import { defineSceneRouter } from '@gwenjs/core';
import { TownScene, BattleScene, PauseMenu, GameOver } from './scenes';

export const router = defineSceneRouter({
  initial: 'town',
  routes: {
    town: {
      on: {
        ENTER_BATTLE: 'battle',
        PAUSE: { target: 'pause', overlay: true, pauseUnderlying: true },
      },
      scene: TownScene,
    },
    battle: {
      on: {
        WIN: 'town',
        LOSE: 'gameOver',
        PAUSE: { target: 'pause', overlay: true, pauseUnderlying: true },
      },
      scene: BattleScene,
    },
    pause: {
      overlay: true,
      pauseUnderlying: true,
      on: {
        RESUME: { target: 'previous' },
        QUIT: 'town',
      },
      scene: PauseMenu,
    },
    gameOver: {
      scene: GameOver,
      on: {
        RETRY: 'town',
      },
    },
  },
});
```

---

## Navigating

Call `useSceneRouter()` to activate the router. **Where to call:**

- ✅ Inside an `defineActor()` factory (e.g., player controller)
- ✅ Inside scene `onEnter`/`onExit` hooks
- ❌ **Not** directly in `defineSystem()` (systems are reusable features, not orchestrators)

::: tip
Place navigation logic in actors or scene hooks, not in generic systems.
:::

---

## Transitions with Params

You can pass parameters with transitions:

```typescript
router.send('ENTER_BATTLE', { enemyId: 42 });

// In BattleScene's onEnter
onEnter(params) {
  console.log(params.enemyId); // 42
}
```

---

## Overlay Scenes

To show overlays (e.g., pause menu), set `overlay: true` in the route config. Use `pauseUnderlying: true` to pause the underlying scene:

```typescript
pause: {
  overlay: true,
  pauseUnderlying: true,
  scene: PauseMenu,
  on: { RESUME: { target: 'previous' } }
}
```

This allows the pause menu to appear over the current scene, pausing gameplay until resumed.

---

## Checking Transitions

Use `can(event)` to check if a transition is valid (e.g., enable/disable UI buttons):

```typescript
if (router.can('PAUSE')) {
  // Enable pause button
}
```

---

## Listening for Changes

Subscribe to transitions with `onTransition()`:

```typescript
const unsubscribe = router.onTransition(({ from, to, params }) => {
  // Analytics, HUD updates, etc.
});
```

Call the returned function to unsubscribe.

---

## DevTools

In the browser console:

- `window.__GWEN_ROUTER__` — the router definition
- `window.__GWEN_ROUTER_INSTANCE__` — the current router handle

::: info
Use these globals to inspect or debug the router state at runtime.
:::

---

## Use Cases

- **RPG:** Zone portals trigger `router.send('ENTER_DUNGEON', { dungeonId: 'crypt' })`
- **Mario Kart:** Pause, race end, and retry flows are modeled as router transitions
- **Platformer:** Death → retry → level complete transitions are handled declaratively

::: warning
Avoid putting router logic in low-level systems. Keep orchestration in actors or scene hooks for maintainability.
:::
