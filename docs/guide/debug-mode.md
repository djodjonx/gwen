# Debug Mode

GWEN's debug mode activates verbose logging, per-frame memory checks, and phase
timing warnings with a single option. Enable it during development; disable it
for production builds.

## Enabling debug mode

Pass `debug: true` to `createEngine`:

```typescript
import { createEngine } from '@gwenjs/core'

const engine = await createEngine({ debug: true })
```

## What activates automatically

When `debug: true`, the following behaviors are enabled on every frame:

| Behavior | Description |
|---|---|
| Plugin setup logging | Logs `"plugin registered: <name>"` each time a plugin is registered via `engine.use()` |
| Over-budget phase warnings | Logs a `warn` entry when any frame phase exceeds 50% of the frame budget |
| Verbose logger levels | `debug` and `info` log levels are active (silent by default in production) |
| WASM sentinel checks | If shared memory is active, checks memory sentinels each frame and logs violations |

## Using `engine.logger`

Every engine instance has a structured logger. Call `engine.logger.child(name)` inside a plugin's `setup` to get a source-tagged child logger:

```typescript
import { definePlugin } from '@gwenjs/kit'

export const MyPlugin = definePlugin(() => ({
  name: '@my/plugin',

  setup(engine) {
    const log = engine.logger.child('@my/plugin')
    log.debug('plugin ready', { version: '1.0.0' })
  },

  onUpdate(dt) {
    // use log here if stored in closure
  },
}))
```

### Log levels

| Level | Active when `debug: false` | Active when `debug: true` |
|---|---|---|
| `debug` | ✗ (silent) | ✓ |
| `info` | ✗ (silent) | ✓ |
| `warn` | ✓ | ✓ |
| `error` | ✓ | ✓ |

`warn` and `error` are always active regardless of debug mode.

## Redirecting log output

Use `setSink` to forward all log entries to an external service:

```typescript
engine.logger.setSink((entry) => {
  if (entry.level === 'error') {
    Sentry.captureMessage(entry.message, {
      extra: { ...entry.data, frame: entry.frame },
    })
  }
})
```

`setSink` replaces the sink for the logger and all child loggers that share it.

## The `onError` plugin hook

Plugins can intercept their own lifecycle errors before they reach the error bus:

```typescript
export const MyRenderer = definePlugin(() => ({
  name: '@my/renderer',

  onError(error, context) {
    if (context.phase === 'onRender' && error instanceof DOMException) {
      // Canvas context was lost — recover gracefully
      context.recover()
      reinitCanvas()
    }
    // If recover() is not called, the error is forwarded to the error bus
    // with code CORE:PLUGIN_RUNTIME_ERROR
  },
}))
```

The `context` object includes:
- `context.phase` — the lifecycle phase where the error occurred
- `context.frame` — the frame index
- `context.recover()` — call to suppress error bus forwarding

## Combining with `@gwenjs/debug` overlay

Pair debug mode with the `@gwenjs/debug` overlay for a live HUD showing FPS,
frame time, and per-phase timing:

```typescript
import { createEngine } from '@gwenjs/core'
import { DebugPlugin } from '@gwenjs/debug'

const engine = await createEngine({ debug: true })
await engine.use(DebugPlugin({ overlay: { showPhases: true } }))
engine.start()
```

The `DebugPlugin` uses `engine.logger` internally so its logs flow through the
same sink as the rest of the engine.
