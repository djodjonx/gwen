# GwenErrorBus — Design Spec

> **Status:** Approved  
> **Date:** 2026-04-05  
> **Package:** `@gwenjs/kit`  
> **Affects:** `@gwenjs/core`, all plugin packages

---

## 1. Problem Statement

GWEN currently has no unified error handling infrastructure:

- `gwen-engine.ts` frame loop swallows errors silently (try/finally, no catch)
- `initWasm()` has no fetch timeout — network failures hang the engine forever
- Plugin-level failures (BVH callbacks, audio preload leak) go unreported
- WASM `panic!` causes unrecoverable JS `RuntimeError` with no user-visible message
- Debug overlay (`@gwenjs/debug`) has no error stream to subscribe to
- No structured way for third-party plugins to emit or observe errors

The fix is a **central error bus** — a lightweight publish/subscribe pipeline that:
1. Captures all engine, plugin, and WASM errors in a structured format
2. Routes them to configurable reporters (console, Sentry, webhook, custom)
3. Enforces dev/prod split behavior (loud-fail in dev, isolate in prod)
4. Is composable-first: plugins use `useLogger()`, standalone code uses `createGwenLogger()`

---

## 2. Architecture Overview

```
Engine / Plugin / WASM
        │ emit(GwenErrorEvent)
        ▼
  ┌─────────────────────┐
  │     GwenErrorBus    │  ← ring buffer (500 events)
  │  - sync subscribers │  ← DebugPlugin, internal listeners
  │  - async reporters  │  ← ConsoleReporter, SentryReporter, WebhookReporter
  │  - enricher fn      │  ← adds frameCount, env, appVersion
  └─────────────────────┘
        │ provided as 'errors' service
        ▼
   engine.inject('errors')   →  useErrorBus() composable
   createGwenLogger(source)  →  standalone (WASM init, CLI)
```

**Key invariants:**
- `fatal` always stops the engine, regardless of env
- `error` in **dev** = throw (loud, visible); in **prod** = log + continue (isolation)
- `warning | info | verbose` always logged only
- The bus never blocks the frame loop — async reporters run outside the critical path

---

## 3. Types

```typescript
// packages/kit/src/errors/error-types.ts

export type GwenErrorLevel = 'fatal' | 'error' | 'warning' | 'info' | 'verbose'

export interface GwenErrorEvent {
  id: string                   // nanoid, for dedup and tracking
  level: GwenErrorLevel
  code: string                 // e.g. 'CORE:WASM_TIMEOUT', 'PHYSICS3D:BVH_HANG'
  message: string
  source: string               // module/plugin name, e.g. '@gwenjs/physics3d'
  error?: unknown              // original Error or WASM sentinel
  context?: Record<string, unknown>
  timestamp: number            // Date.now()
  frameCount?: number          // current engine frame if available
  env: 'development' | 'production'
  stack?: string
}

export interface ErrorReporter {
  filter?: (event: GwenErrorEvent) => boolean
  report(event: GwenErrorEvent): void | Promise<void>
}

export interface GwenErrorBusOptions {
  env?: 'development' | 'production'
  historySize?: number         // default 500
  reporters?: ErrorReporter[]
  enricher?: (event: Partial<GwenErrorEvent>) => Partial<GwenErrorEvent>
}
```

---

## 4. Error Codes

Each module defines its own `as const` object — no global registry, tree-shake safe:

```typescript
// packages/core/src/errors/codes.ts
export const CoreErrorCodes = {
  WASM_TIMEOUT:        'CORE:WASM_TIMEOUT',
  WASM_PANIC:          'CORE:WASM_PANIC',
  FRAME_LOOP_ERROR:    'CORE:FRAME_LOOP_ERROR',
  TARGET_FPS_INVALID:  'CORE:TARGET_FPS_INVALID',
} as const

// packages/physics3d/src/errors/codes.ts
export const Physics3DErrorCodes = {
  BVH_CALLBACK_HANG:   'PHYSICS3D:BVH_CALLBACK_HANG',
  MESH_FALLBACK:       'PHYSICS3D:MESH_FALLBACK',
  CONVEX_FALLBACK:     'PHYSICS3D:CONVEX_FALLBACK',
} as const

// packages/audio/src/errors/codes.ts
export const AudioErrorCodes = {
  PRELOAD_FAILED:      'AUDIO:PRELOAD_FAILED',
  DECODE_ERROR:        'AUDIO:DECODE_ERROR',
} as const
```

Error code strings use the format `MODULE:REASON_SCREAMING_SNAKE`.

---

## 5. GwenErrorBus Internals

```typescript
// packages/kit/src/errors/error-bus.ts

export class GwenErrorBus {
  private _history: GwenErrorEvent[]    // ring buffer, max historySize
  private _head = 0
  private _subscribers: Array<(e: GwenErrorEvent) => void> = []
  private _reporters: ErrorReporter[] = []
  private _enricher?: (e: Partial<GwenErrorEvent>) => Partial<GwenErrorEvent>
  private _env: 'development' | 'production'
  private _frameCount = 0

  emit(partial: Omit<GwenErrorEvent, 'id' | 'timestamp' | 'env'>): void
  subscribe(fn: (e: GwenErrorEvent) => void): () => void  // returns unsubscribe
  addReporter(reporter: ErrorReporter): void
  getHistory(): readonly GwenErrorEvent[]
  setFrameCount(n: number): void     // called by engine each frame
  install(): void                    // registers window.onerror + unhandledrejection (prod only)
}
```

**Ring buffer:** fixed-size `GwenErrorEvent[]` with a `_head` pointer that wraps. Avoids unbounded memory growth during long sessions.

**Dispatch flow:**
1. `emit()` builds the full `GwenErrorEvent` (nanoid, timestamp, enricher)
2. Pushes to ring buffer
3. Calls all sync subscribers synchronously (DebugPlugin uses this)
4. Calls all reporters asynchronously (outside frame critical path)
5. Applies dev/prod behavior:
   - `fatal`: calls `engine.stop()` then throws
   - `error` + dev: throws
   - `error` + prod: no throw, event already dispatched
   - others: dispatch only

---

## 6. Composables & Standalone API

```typescript
// In a plugin or system (inside definePlugin / defineSystem):
const logger = useLogger('@gwenjs/physics3d')
logger.error(Physics3DErrorCodes.BVH_CALLBACK_HANG, 'BVH worker callback lost', { entityId })
logger.warn(Physics3DErrorCodes.MESH_FALLBACK, 'Falling back to box collider')

// Standalone (WASM init, CLI, pre-engine):
const logger = createGwenLogger('@gwenjs/core')
logger.fatal(CoreErrorCodes.WASM_TIMEOUT, 'WASM fetch timed out after 10s', { url })

// useErrorBus() — for DebugPlugin or custom monitoring:
const bus = useErrorBus()
bus.subscribe((event) => {
  if (event.level === 'error' || event.level === 'fatal') {
    overlayPanel.show(event)
  }
})
bus.getHistory()  // GwenErrorEvent[]
```

`useLogger` and `useErrorBus` are resolved in the `unctx` context (engine active). `createGwenLogger` accepts an optional bus instance — falls back to a no-op logger if none is provided.

---

## 7. Built-in Reporters

### ConsoleReporter (default, always active)

```typescript
// dev: console.error with full stack + context
// prod: console.warn with code + message only (no stack)
```

### SentryReporter (opt-in, lazy import)

```typescript
import { SentryReporter } from '@gwenjs/kit/reporters/sentry'
// Uses dynamic import('@sentry/browser') — no hard Sentry dep
// Maps GwenErrorLevel → Sentry severity
// Attaches context as Sentry extras
```

### WebhookReporter (opt-in)

```typescript
import { WebhookReporter } from '@gwenjs/kit/reporters/webhook'
// Batches up to 50 events, flushes every 5s or on page unload
// Exponential back-off retry (3 attempts)
// Drops oldest events if queue > 200 (back-pressure)
```

---

## 8. Engine Integration

### `createEngine()` wiring (`gwen-engine.ts`)

```typescript
// 1. Create bus
const errorBus = createErrorBus({ env, reporters: [new ConsoleReporter()] })

// 2. Provide as service
engine.provide('errors', errorBus)

// 3. Frame loop — feed frameCount, catch errors
try {
  // ... systems tick ...
} catch (err) {
  errorBus.emit({
    level: 'error',
    code: CoreErrorCodes.FRAME_LOOP_ERROR,
    message: err instanceof Error ? err.message : String(err),
    source: '@gwenjs/core',
    error: err,
    frameCount: currentFrame,
  })
}

// 4. WASM panic mapping
// wasm-module-handle.ts onError callback → maps to errorBus.emit(fatal)
```

### `initWasm()` timeout wiring

```typescript
// AbortController with 10s timeout
// On abort → errorBus.emit({ level: 'fatal', code: CoreErrorCodes.WASM_TIMEOUT })
```

### Window global capture (prod only, via `errorBus.install()`)

```typescript
window.onerror = (msg, src, line, col, err) => {
  errorBus.emit({ level: 'error', code: 'CORE:UNCAUGHT', ... })
}
window.addEventListener('unhandledrejection', (e) => {
  errorBus.emit({ level: 'error', code: 'CORE:UNHANDLED_REJECTION', ... })
})
```

---

## 9. File Structure

```
packages/kit/src/errors/
  error-types.ts          ← GwenErrorEvent, ErrorReporter, GwenErrorBusOptions
  error-bus.ts            ← GwenErrorBus class
  create-error-bus.ts     ← factory function createErrorBus()
  use-logger.ts           ← useLogger() composable + createGwenLogger()
  use-error-bus.ts        ← useErrorBus() composable
  reporters/
    console-reporter.ts   ← ConsoleReporter (always included)
    sentry-reporter.ts    ← SentryReporter (lazy Sentry import)
    webhook-reporter.ts   ← WebhookReporter (batch + retry)
  index.ts                ← barrel re-export

packages/core/src/errors/
  codes.ts                ← CoreErrorCodes as const

packages/physics3d/src/errors/
  codes.ts                ← Physics3DErrorCodes as const

packages/audio/src/errors/
  codes.ts                ← AudioErrorCodes as const
```

`@gwenjs/kit/src/errors/index.ts` is re-exported from `@gwenjs/kit/src/index.ts`.  
Reporters are sub-path exports: `@gwenjs/kit/reporters/sentry`, `@gwenjs/kit/reporters/webhook`.

---

## 10. DebugPlugin Integration

`@gwenjs/debug` subscribes to the bus via `useErrorBus()` during `onInit`:

```typescript
const bus = useErrorBus()
bus.subscribe((event) => {
  if (event.level === 'fatal' || event.level === 'error') {
    this._errorPanel.push(event)
  }
})
```

The debug overlay panel shows: level badge, code, message, source, frameCount, expandable context/stack.

---

## 11. Testing Strategy

- `GwenErrorBus`: unit tests in `packages/kit/tests/error-bus.test.ts`
  - emit → subscriber called synchronously
  - emit → reporter called asynchronously
  - ring buffer wraps at historySize
  - fatal level throws
  - dev error throws, prod error does not
- `ConsoleReporter`: mock `console.error/warn`, assert format
- `WebhookReporter`: mock `fetch`, assert batching + retry
- `useLogger` / `useErrorBus`: test with `createTestEngine()` harness
- Per-package error codes: type-level test (`.type-test.ts`) ensuring codes are valid strings

---

## 12. Integration with Existing Fix Plan

This error bus is the **prerequisite infrastructure** for several pending fixes:

| Fix Todo | How the bus is used |
|---|---|
| `ts-engine-error-hook` | Frame loop catch → `errorBus.emit(FRAME_LOOP_ERROR)` |
| `ts-wasm-timeout` | AbortController timeout → `errorBus.emit(WASM_TIMEOUT)` |
| `plugin-bvh-callbacks` | Stale callback → `logger.error(BVH_CALLBACK_HANG)` |
| `plugin-audio-leak` | Failed preload → `logger.warn(AUDIO:PRELOAD_FAILED)` |
| `plugin-fallback-warn` | Mesh/convex fallback → `logger.warn(MESH_FALLBACK)` |
| Rust WASM panic mapping | WASM sentinel → `errorBus.emit(CORE:WASM_PANIC, fatal)` |

The implementation plan will reflect this dependency: error bus is built first, then wired into each fix.
