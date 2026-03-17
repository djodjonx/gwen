# gwen-kit-platformer

Opinionated kit for 2D platformer games. It provides DX-friendly factories that wire GWEN plugins
(physics, input) into ready-to-use platformer behavior.

## Prerequisites

```bash
pnpm add @djodjonx/gwen-kit-platformer
```

In `gwen.config.ts`:

```ts
import { Physics2DPlugin } from '@djodjonx/gwen-plugin-physics2d';
import { InputPlugin } from '@djodjonx/gwen-plugin-input';
import { PlatformerDefaultInputMap } from '@djodjonx/gwen-kit-platformer';

export default defineConfig({
  plugins: [new Physics2DPlugin(), new InputPlugin({ actionMap: PlatformerDefaultInputMap })],
});
```

---

## Level 1 - Turnkey Scene

`createPlatformerScene` wires input and movement systems.

### `createPlatformerScene` options

| Option | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | `'Main'` | Unique scene name |
| `gravity` | `number` | `20` | Vertical gravity (interpreted with `units`) |
| `units` | `'pixels' \| 'meters'` | `'pixels'` | Unit for gravity |
| `pixelsPerMeter` | `number` | `50` | Conversion ratio used when `units='pixels'` |
| `systems` | `PluginEntry[]` | `[]` | Additional scene systems |
| `onEnter` | `(api) => void` | — | Enter callback |
| `onExit` | `(api) => void` | — | Exit callback |

---

## Level 2 - Player Prefab

`createPlayerPrefab` creates a `PrefabDefinition` with physics + platformer components.

```ts
const PlayerPrefab = createPlayerPrefab({
  units: 'pixels',
  pixelsPerMeter: 50,
  speed: 400,
  jumpVelocity: 600,
  maxFallSpeed: 700,
});
```

### `createPlayerPrefab` options

| Option | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | `'PlatformerPlayer'` | Prefab name |
| `units` | `'pixels' \| 'meters'` | `'pixels'` | Unit for movement values |
| `pixelsPerMeter` | `number` | `50` | Conversion ratio used when `units='pixels'` |
| `speed` | `number` | `300` | Max horizontal speed (depends on `units`) |
| `jumpVelocity` | `number` | `500` | Jump launch velocity (depends on `units`) |
| `jumpCoyoteMs` | `number` | `110` | Coyote time window |
| `jumpBufferWindowMs` | `number` | `110` | Jump input buffer window |
| `groundEnterFrames` | `number` | `1` | Frames required to confirm grounded from sensor |
| `groundExitFrames` | `number` | `4` | Frames required to confirm airborne after sensor loss |
| `postJumpLockMs` | `number` | `80` | Short post-jump lock to avoid jitter double-jumps |
| `maxFallSpeed` | `number` | `600` | Fall speed cap (depends on `units`) |

Deprecated aliases still accepted for migration:

| Deprecated option | Replacement |
|---|---|
| `jumpForce` | `jumpVelocity` |
| `coyoteMs` | `jumpCoyoteMs` |
| `jumpBufferMs` | `jumpBufferWindowMs` |

## Units reference

| Field | `units: 'pixels'` | `units: 'meters'` |
|---|---|---|
| `gravity` | px/s^2, converted to m/s^2 | m/s^2 (no conversion) |
| `speed` | px/s, converted to m/s | m/s (no conversion) |
| `jumpVelocity` | px/s, converted to m/s | m/s (no conversion) |
| `maxFallSpeed` | px/s, converted to m/s | m/s (no conversion) |
| `colliders` | authored in pixels in kit APIs | authored in pixels in kit APIs |

`colliders` stay pixel-authored in kit APIs for DX and are converted by Physics2D internally.

## Deterministic jump model

`PlatformerMovementSystem` now resolves jump in two explicit phases:

1. **Ground resolver** with frame hysteresis (`groundEnterFrames`, `groundExitFrames`).
2. **Jump resolver** with deterministic gating (`jumpBufferWindowMs`, `jumpCoyoteMs`, `postJumpLockMs`).

This makes jump behavior stable under foot-sensor flicker while keeping input responsiveness.

---

## Level 3 - Static Level Geometry Helpers

Use kit-level helpers to author level collision in pixels while relying on Physics2D merged chunks.

```ts
import { createPlatformerStaticGeometry } from '@djodjonx/gwen-kit-platformer';

const handle = createPlatformerStaticGeometry(physics, {
  blocks: [
    { x: 640, y: 550, w: 1280, h: 64 },
    { x: 300, y: 420, w: 128, h: 32 },
  ],
  worldWidthPx: 1280,
  worldHeightPx: 640,
  tileSizePx: 16,
  chunkSizeTiles: 16,
});

// Scene teardown
handle.unload();
```

### Geometry helper API

| Helper | Description |
|---|---|
| `buildPlatformerStaticGeometry(options)` | Build merged chunk map from pixel blocks |
| `loadPlatformerStaticGeometry(physics, chunkMap, options?)` | Load a pre-built chunk map and get a disposable handle |
| `createPlatformerStaticGeometry(physics, buildOptions, loadOptions?)` | Build + load in one call |

