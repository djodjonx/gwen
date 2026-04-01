# API - gwen-plugin-sprite-anim

## Service `animator`

- `attach(uiName, entityId, extension)` - bind manual extension data.
- `detach(entityId)` - cleanup one entity.
- `has(entityId)` - runtime presence check.
- `tick(deltaTime, options?)` - advance internal simulation.
- `draw(ctx, entityId, x, y, options?)` - draw current sampled frame.
- `play(entityId, clip, options?)` - force a clip.
- `setState(entityId, state, options?)` - force a controller state.
- `setParam(entityId, name, value)` - set bool/int/float parameter.
- `getParam(entityId, name)` - read current parameter value.
- `setTrigger(entityId, name)` - trigger-style one-shot parameter.
- `resetTrigger(entityId, name)` - clear trigger manually.
- `pause(entityId)` / `resume(entityId)` / `stop(entityId)`.
- `setSpeed(entityId, speed)` - per-entity speed multiplier.
- `setVisible(entityId, visible)` - soft visibility toggle.
- `getState(entityId)` - read sampled state snapshot.
- `clear()` - clear whole runtime cache.

## UI extension `extensions.spriteAnim`

- `atlas` - spritesheet URL.
- `frame` - fixed grid info (`width`, `height`, optional margins/spacing/columns).
- `clips` - named clip map.
- `initial` - fallback clip if no controller.
- `controller` - optional state machine (parameters, states, transitions).

### Clip declaration note

You can define clips using:

- row/range syntax: `{ row, from, to }`
- explicit frame list: `{ frames: number[] }`

Row/range loops may produce visible wrap jumps (`last -> first`) depending on art layout.
For full control over playback order, prefer explicit `frames` arrays (for example ping-pong patterns).

## Performance knobs

- Plugin config `fixedDelta`, `maxSubSteps`, `maxFrameAdvancesPerEntity`.
- Draw option `cullRect` to skip off-screen draws.
- Draw option `pixelSnap` for stable pixel art rendering.
