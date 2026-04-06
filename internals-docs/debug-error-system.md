# Debug & Error System — Internal Reference

This document describes the internals of the three-pillar debug and error system
introduced in RFC-11: GwenLogger, per-plugin error isolation, and debug mode.

---

## 1. Architecture Overview

RFC-11 adds three orthogonal pillars to the engine:

| Pillar | Purpose | Files |
|---|---|---|
| **GwenLogger** | Structured, scoped, sink-based logging | `packages/core/src/logger/` |
| **Error isolation** | Per-plugin try/catch in the frame loop | `gwen-engine.ts` — `_reportPluginError`, `use()` |
| **debug mode** | Opt-in verbose behaviors at `debug: true` | `gwen-engine.ts` — `_runFrame`, `use()` |

---

## 2. GwenLogger Internals

### Sink sharing between parent and child

All loggers created via `child()` share a single `{ fn: sink }` wrapper object.
When `setSink(newSink)` is called on any logger in the family, it mutates
`sinkRef.fn` in-place, which all children observe immediately.

```
createLogger('gwen:core', debugMode)
  └─ sinkRef = { fn: defaultConsoleSink }
       └─ createChildLogger('@gwenjs/physics2d', ..., sinkRef)
       └─ createChildLogger('@gwenjs/renderer', ..., sinkRef)

engine.logger.setSink(mySink)
  → sinkRef.fn = mySink  ← observed by all children
```

### Level filtering

Level filtering is applied **before** the sink is called. The check is:

```typescript
if ((level === 'debug' || level === 'info') && !debugMode) return;
```

There is no per-level threshold stored at runtime — the `debugMode` boolean is
captured at `createLogger` call time via closure. If you need dynamic level
filtering, implement it inside the sink callback.

### Frame injection

Pass a `getFrame?: () => number` callback to `createLogger`. It is called
synchronously each time an entry is emitted. The value appears as `entry.frame`
in the `LogEntry`. If no callback is supplied, `entry.frame` is `undefined`.

The engine wires this as `() => this._frameCountOwn`, which reflects the last
**completed** frame count (incremented at the end of `_runFrame`).

---

## 3. Error Isolation Design

### Why per-plugin try/catch, not frame-level

A single top-level `try/catch` around all of `_runFrame` would stop all further
plugins from running the moment one throws. Per-plugin wrapping keeps the other
plugins alive and only isolates the failing one.

Phases 1 and 8 (`engine:tick` / `engine:afterTick`) remain unwrapped — errors
there propagate as `FRAME_LOOP_ERROR` because they are not plugin-specific.

### `_reportPluginError` flow

```
plugin.onBeforeUpdate() throws err
  ↓
_reportPluginError(plugin, 'onBeforeUpdate', err)
  ↓
  try { plugin.onError?.(err, ctx) }
  catch { /* ignore — onError itself threw */ }
  ↓
  if (ctx.recover() was called):
    → return (error silently absorbed by plugin)
  else:
    → this.logger.error(...)
    → this._errorBus?.emit({ code: PLUGIN_RUNTIME_ERROR, ... })
    → this.hooks.callHook('plugin:error', { pluginName, phase, error, frame })
```

---

## 4. `onError` Contract

- `onError` receives the **raw thrown value** (`unknown`) — always check type before casting.
- `context.recover()` is a synchronous flag — calling it after `_reportPluginError` returns has no effect.
- If `onError` itself throws, the throw is silently swallowed to avoid infinite loops. The original error **is not** re-reported.
- `onError` is called for all phases: `'setup' | 'onBeforeUpdate' | 'onUpdate' | 'onAfterUpdate' | 'onRender' | 'teardown'`.
- For `'setup'` failures, `recover()` has no effect — setup failures are always re-thrown after error bus emission (they are fatal).

---

## 5. debug mode — Full Behavior List

All of the following activate when `GwenEngineOptions.debug === true`:

| Trigger | What happens |
|---|---|
| `engine.use(plugin)` called | `this.logger.debug('plugin registered: <name>')` |
| Any `_runFrame` phase completes | Phase ms checked; if `> budget * 0.5`, `this.logger.warn(...)` |
| `_sharedMemory` is set and active | `checkSentinels()` called each frame; violations logged as `error` |
| `engine.logger.debug()` called | Entry reaches the sink (silent when `debug === false`) |
| `engine.logger.info()` called | Entry reaches the sink (silent when `debug === false`) |

`warn` and `error` log levels are **always active**, regardless of debug mode.

---

## 6. Adding a New Error Code

1. Open `packages/core/src/engine/gwen-engine.ts`.
2. Add a new key to `CoreErrorCodes`:
   ```typescript
   export const CoreErrorCodes = {
     // ... existing keys — DO NOT rename or remove ...
     MY_NEW_ERROR: 'CORE:MY_NEW_ERROR',
   } as const;
   ```
3. Use it in `this._errorBus?.emit({ code: CoreErrorCodes.MY_NEW_ERROR, ... })`.
4. Add a test in `packages/core/tests/plugin-error-isolation.test.ts` verifying the code is emitted.

**Rules:**
- Never rename existing keys — they are part of the public API.
- Always prefix with `CORE:` for engine-level errors.
- Plugin packages use their own prefix, e.g. `PHYSICS2D:BODY_NOT_FOUND`.

---

## 7. Custom Telemetry via `setSink`

```typescript
// Forward all engine logs to Datadog
engine.logger.setSink((entry) => {
  datadogLogs.logger.log(entry.message, {
    level: entry.level,
    source: entry.source,
    frame: entry.frame,
    ...entry.data,
  })
})
```

**Tips:**
- Call `setSink` after `createEngine` but before `engine.start()` so setup logs are captured.
- Use `entry.source` to filter by plugin — e.g. only forward `'@gwenjs/physics3d'` logs.
- The default sink (`defaultConsoleSink` in `console-logger.ts`) is replaced entirely — you are responsible for all output once you call `setSink`.
- To restore the default, call `setSink(defaultConsoleSink)` (import it from `@gwenjs/core`'s internal logger if needed, or keep a reference before replacing).
