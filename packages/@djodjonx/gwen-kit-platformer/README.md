# @djodjonx/gwen-kit-platformer

Platformer kit for GWEN — player physics, movement system, grounded detection, and scene helpers.

Requires `@djodjonx/gwen-plugin-physics2d` to be registered as a plugin.

## Quick start

```ts
import { createPlayerPrefab, createPlatformerScene } from '@djodjonx/gwen-kit-platformer';

const PlayerPrefab = createPlayerPrefab({ speed: 300, jumpForce: 500 });
```

## Import migration (subpath-first)

Since `@djodjonx/gwen-plugin-physics2d` exposes tree-shakable subpaths, the kit
uses targeted imports internally. If you reference physics types in your own code:

```ts
// Old (full bundle — still works but pulls more code)
import { SENSOR_ID_FOOT } from '@djodjonx/gwen-plugin-physics2d';
import type { Physics2DAPI } from '@djodjonx/gwen-plugin-physics2d';

// New (subpath — tree-shaking safe)
import { SENSOR_ID_FOOT } from '@djodjonx/gwen-plugin-physics2d/core';
import type { Physics2DAPI } from '@djodjonx/gwen-plugin-physics2d/core';

// Helpers domain (e.g. reading body state)
import { getBodySnapshot, isSensorActive } from '@djodjonx/gwen-plugin-physics2d/helpers/queries';
import { applyDirectionalImpulse } from '@djodjonx/gwen-plugin-physics2d/helpers/movement';
```

## API

### `createPlayerPrefab(options?)`

Creates a full player prefab with movement, physics colliders, and foot sensor.

### `createPlatformerScene(options)`

Creates a basic scene with a floor and optional ceiling/walls.

## Documentation index

- CHANGELOG: `CHANGELOG.md`
