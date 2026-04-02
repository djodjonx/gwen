# @gwenjs/kit-platformer

Platformer kit for GWEN — player physics, movement system, grounded detection, and scene helpers.

Requires `@gwenjs/physics2d` to be registered as a plugin.

## Quick start

```ts
import { createPlayerPrefab, createPlatformerScene } from '@gwenjs/kit-platformer';

const PlayerPrefab = createPlayerPrefab({
  speed: 300,
  jumpVelocity: 500,
  jumpCoyoteMs: 110,
  jumpBufferWindowMs: 110,
});
```

Legacy aliases still work (`jumpForce`, `coyoteMs`, `jumpBufferMs`) but are deprecated.

## Import migration (subpath-first)

Since `@gwenjs/physics2d` exposes tree-shakable subpaths, the kit
uses targeted imports internally. If you reference physics types in your own code:

```ts
// Old (full bundle — still works but pulls more code)
import { SENSOR_ID_FOOT } from '@gwenjs/physics2d';
import type { Physics2DAPI } from '@gwenjs/physics2d';

// New (subpath — tree-shaking safe)
import { SENSOR_ID_FOOT } from '@gwenjs/physics2d/core';
import type { Physics2DAPI } from '@gwenjs/physics2d/core';

// Helpers domain (e.g. reading body state)
import { getBodySnapshot, isSensorActive } from '@gwenjs/physics2d/helpers/queries';
import { applyDirectionalImpulse } from '@gwenjs/physics2d/helpers/movement';
```

## API

### `createPlayerPrefab(options?)`

Creates a full player prefab with movement, physics colliders, and foot sensor.

Key movement options:

- `jumpVelocity`
- `jumpCoyoteMs`
- `jumpBufferWindowMs`
- `groundEnterFrames`
- `groundExitFrames`
- `postJumpLockMs`

`PlatformerMovementSystem` resolves jump deterministically with grounded hysteresis + jump gating.

### `createPlatformerScene(options)`

Creates a basic scene with a floor and optional ceiling/walls.

### `createPlatformerStaticGeometry(physics, buildOptions, loadOptions?)`

Builds and loads merged static level colliders from pixel-authored blocks.

```ts
import { createPlatformerStaticGeometry } from '@gwenjs/kit-platformer';

const level = createPlatformerStaticGeometry(physics, {
  blocks: [{ x: 640, y: 550, w: 1280, h: 64 }],
  worldWidthPx: 1280,
  worldHeightPx: 640,
  tileSizePx: 16,
});

// On scene exit:
level.unload();
```

Related low-level variants:

- `buildPlatformerStaticGeometry(options)`
- `loadPlatformerStaticGeometry(physics, chunkMap, options?)`

## Documentation index

- CHANGELOG: `CHANGELOG.md`
- Migration: `../../docs/plugins/kit-platformer-migration.md`
