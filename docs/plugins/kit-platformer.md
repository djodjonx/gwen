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
  jumpForce: 600,
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
| `jumpForce` | `number` | `500` | Jump impulse (depends on `units`) |
| `coyoteMs` | `number` | `110` | Coyote time window |
| `jumpBufferMs` | `number` | `110` | Jump buffer window |
| `maxFallSpeed` | `number` | `600` | Fall speed cap (depends on `units`) |

## Units reference

| Field | `units: 'pixels'` | `units: 'meters'` |
|---|---|---|
| `gravity` | px/s^2, converted to m/s^2 | m/s^2 (no conversion) |
| `speed` | px/s, converted to m/s | m/s (no conversion) |
| `jumpForce` | px/s, converted to m/s | m/s (no conversion) |
| `maxFallSpeed` | px/s, converted to m/s | m/s (no conversion) |
| `colliders` | authored in pixels in kit APIs | authored in pixels in kit APIs |

`colliders` stay pixel-authored in kit APIs for DX and are converted by Physics2D internally.
