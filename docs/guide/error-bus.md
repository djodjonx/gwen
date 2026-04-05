# Error Bus

Centralized error dispatch is critical for games — errors buried in a console log can't be replayed, reproduced, or analyzed. GWEN's error bus provides a structured, observable, reporter-backed solution: emit typed errors with context, subscribe to them locally, and forward them to external services (Sentry, webhooks, custom handlers) without blocking the frame loop.

The bus maintains a **ring-buffer history** of the last 500 events, splits behavior by environment (throws in dev, silent in prod), and ships with three built-in reporters.

## Quick Start

```typescript
import { createEngine } from '@gwenjs/core'
import { createErrorBus } from '@gwenjs/kit'

const bus = createErrorBus()
const engine = await createEngine({ errorBus: bus })
```

That's it — the engine now routes all internal errors through the bus, and the default `ConsoleReporter` logs them.

## Error Levels

GWEN recognizes five severity levels. Behavior varies by environment:

| Level   | Development       | Production         | Throws? |
| ------- | ----------------- | ------------------ | ------- |
| fatal   | Throws after emit | Throws after emit  | ✓       |
| error   | Throws after emit | Silent (reporters) | dev: ✓  |
| warning | Log (reporters)   | Log (reporters)    | –       |
| info    | Log (reporters)   | Log (reporters)    | –       |
| verbose | Log (reporters)   | Log (reporters)    | –       |

Use **fatal** for unrecoverable engine state (e.g., WASM init failure). Use **error** for runtime failures the app might recover from. Use **warning** for degraded behavior. **Info** and **verbose** are for telemetry and debug output.

## Subscribing to Errors

Call `bus.subscribe()` to react to errors in real time:

```typescript
const bus = createErrorBus()

// Unsubscribe immediately if the subscriber throws (safe; caught internally)
const unsub = bus.subscribe((event) => {
  if (event.level === 'error') {
    console.log(`Error in frame ${event.frameCount}: ${event.message}`)
  }
})

// Later, stop listening:
unsub()
```

Subscribers are called **synchronously** before reporters. Exceptions inside subscribers are caught and do not affect other subscribers or the frame loop.

## Using the Logger in Systems

Inside a plugin or system, use **`useErrorBus()`** to get the bus and **`useLogger()`** to create a scoped logger:

```typescript
import { defineSystem } from '@gwenjs/core'
import { useErrorBus, useLogger } from '@gwenjs/kit'

export const MySystem = defineSystem(() => {
  const bus = useErrorBus()
  const logger = useLogger('@gwenjs/my-plugin', bus)

  return {
    onUpdate() {
      if (badCondition) {
        logger.warn('MY_PLUGIN:BAD_STATE', 'Unexpected state detected', { state })
      }
    },
  }
})
```

The logger methods are:
- **`fatal(code, message, context)`** — logs + throws
- **`error(code, message, context)`** — logs + throws in dev
- **`warn(code, message, context)`** — logs only
- **`info(code, message, context)`** — logs only
- **`verbose(code, message, context)`** — logs only

## Standalone Logger

For code that runs before the engine is ready (WASM init, CLI tools, build scripts), use **`createGwenLogger()`**:

```typescript
import { createGwenLogger } from '@gwenjs/kit'

const logger = createGwenLogger('@gwenjs/core')

// Before engine is initialized — falls back to a console-based no-op if no bus
logger.warn('CORE:FALLBACK', 'SharedArrayBuffer unavailable, using ArrayBuffer')

// Later, wire it to the bus:
const bus = createErrorBus()
const logger2 = createGwenLogger('@gwenjs/core', bus)
logger2.error('CORE:WASM_TIMEOUT', 'WASM module took too long to respond')
```

If no bus is provided, `createGwenLogger()` returns a **no-op logger** that silently discards messages (not suitable for production use — always pass a bus once available).

## Built-in Reporters

### ConsoleReporter

The default reporter. Logs to `console.error` (fatal/error), `console.warn` (warning), or `console.log` (info/verbose). In development, includes full stack traces for error and fatal events.

```typescript
import { createErrorBus } from '@gwenjs/kit'
import { ConsoleReporter } from '@gwenjs/kit/reporters/console'

// Registered automatically by default:
const bus = createErrorBus() // already includes ConsoleReporter
```

### SentryReporter

Forwards events to Sentry via `@sentry/browser`. If Sentry is not installed, this reporter silently becomes a no-op.

```typescript
import { createErrorBus } from '@gwenjs/kit'
import { SentryReporter } from '@gwenjs/kit/reporters/sentry'

const bus = createErrorBus({
  reporters: [new SentryReporter()],
})
```

The reporter maps GWEN error levels to Sentry levels and includes the event's context and stack trace.

### WebhookReporter

Batches events and POSTs them to a webhook endpoint. Flushes when the batch size is reached, the flush interval elapses, or the page is about to unload.

```typescript
import { createErrorBus } from '@gwenjs/kit'
import { WebhookReporter } from '@gwenjs/kit/reporters/webhook'

const bus = createErrorBus({
  reporters: [
    new WebhookReporter({
      url: 'https://errors.example.com/ingest',
      batchSize: 50,           // flush when 50 events accumulate
      flushIntervalMs: 5000,   // or every 5 seconds
      maxQueueSize: 200,       // drop oldest if buffer exceeds 200 events
      maxRetries: 3,           // retry up to 3 times on network failure
    }),
  ],
})
```

On network failure, batches are retried with **exponential backoff** (1s, 2s, 4s, ..., capped at 30s). After `maxRetries` attempts, the batch is silently dropped to prevent unbounded memory growth.

Call **`destroy()`** to stop the flush interval when the reporter is no longer needed:

```typescript
const reporter = new WebhookReporter({ url: '...' })
bus.addReporter(reporter)

// Later:
reporter.destroy()
```

## Error History

Access the last N events via **`bus.getHistory()`**:

```typescript
const bus = createErrorBus({ historySize: 500 }) // default

const events = bus.getHistory() // readonly array, oldest to newest
for (const event of events) {
  console.log(`[${event.level}] ${event.code}: ${event.message}`)
}
```

Each event includes:
- **`id`** — unique identifier for deduplication
- **`level`** — severity (fatal, error, warning, info, verbose)
- **`code`** — namespaced error code (e.g., `'CORE:WASM_TIMEOUT'`)
- **`message`** — human-readable description
- **`source`** — emitting module (e.g., `'@gwenjs/physics3d'`)
- **`timestamp`** — Unix timestamp (Date.now())
- **`frameCount`** — engine frame index at emission
- **`context`** — arbitrary key/value pairs for debugging
- **`stack`** — stack trace (dev only, for error/fatal)
- **`env`** — runtime environment ('development' or 'production')

## Per-Module Error Codes

Define error codes as a module-level `const` object using **`as const`**. This pattern allows TypeScript to infer exact code strings and makes refactoring easier:

```typescript
// core.ts
export const CoreErrorCodes = {
  FRAME_LOOP_ERROR: 'CORE:FRAME_LOOP_ERROR',
  PLUGIN_SETUP_ERROR: 'CORE:PLUGIN_SETUP_ERROR',
  WASM_LOAD_ERROR: 'CORE:WASM_LOAD_ERROR',
  WASM_TIMEOUT: 'CORE:WASM_TIMEOUT',
  WASM_PANIC: 'CORE:WASM_PANIC',
} as const
```

Then emit using the code:

```typescript
logger.error(CoreErrorCodes.WASM_TIMEOUT, 'WASM module did not respond in time')
```

The engine itself defines `CoreErrorCodes` in `@gwenjs/core` for all internal errors. Your plugins should define their own:

```typescript
// my-plugin.ts
export const MyPluginErrorCodes = {
  MESH_FALLBACK: 'MY_PLUGIN:MESH_FALLBACK',
  BUFFER_OVERFLOW: 'MY_PLUGIN:BUFFER_OVERFLOW',
} as const
```

## Integration with GwenEngine

When you pass `errorBus` to `createEngine()`, the engine:
1. Registers itself as a **subscriber** to watch for errors
2. Exposes the bus via **`engine.inject('errors')`** so plugins can access it
3. Calls **`engine.stop()`** when a fatal error is emitted

### Accessing the Bus from a Plugin

```typescript
export const MyPlugin: GwenPlugin = {
  name: 'my-plugin',
  setup(engine) {
    const errorBus = engine.inject('errors')
    const logger = useLogger('@gwenjs/my-plugin', errorBus)

    engine.on('error', (payload) => {
      // Emitted whenever any error is dispatched (can be used to pause, reset state, etc.)
      console.log('Error caught:', payload)
    })
  },
}
```

### Engine Hooks

The engine emits **`engine:error`** hook for every dispatched event:

```typescript
engine.hooks.hook('error', (payload) => {
  // Triggers on every error (before subscribers/reporters)
  console.log('Error emitted:', payload)
})
```

## Custom Reporters

Implement the **`ErrorReporter`** interface to create custom reporters:

```typescript
import { ErrorReporter, GwenErrorEvent } from '@gwenjs/kit'

const myReporter: ErrorReporter = {
  // Optional: filter events (return false to skip reporting)
  filter: (event) => event.level === 'error' || event.level === 'fatal',

  // Required: async or sync report function
  async report(event: GwenErrorEvent) {
    await fetch('/my-error-endpoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: event.code,
        message: event.message,
        context: event.context,
        timestamp: event.timestamp,
      }),
    })
  },
}

const bus = createErrorBus({ reporters: [myReporter] })
```

Reporters are called **asynchronously** after all synchronous subscribers, so they never block the frame loop.

## Environment Detection

By default, the error bus detects the environment from `import.meta.env.PROD`:

```typescript
// Automatically production mode when bundled with Vite:
const bus = createErrorBus() // env: 'production'

// Override:
const bus = createErrorBus({ env: 'development' })
```

In development, **`error`** level events throw to surface problems immediately. In production, they are dispatched to reporters silently.

## Event Enrichment

Attach application-level metadata (app version, user ID, session ID, etc.) to every event:

```typescript
const bus = createErrorBus({
  enricher: (event) => ({
    ...event,
    context: {
      ...event.context,
      appVersion: '1.2.3',
      userId: 'user-abc-123',
      sessionId: sessionStorage.getItem('sessionId'),
    },
  }),
})
```

The enricher is called **synchronously** on every event before dispatch, so it's the perfect place to attach global context.

## Global Error Handlers

Call **`bus.install()`** to wire up global `window.onerror` and `unhandledrejection` listeners. Any uncaught error or unhandled promise rejection is emitted as an **`error`** level event:

```typescript
const bus = createErrorBus()
bus.install() // registers global handlers

// Later, an uncaught error:
throw new Error('Something went wrong')
// → Caught by window.onerror, emitted as bus event with level: 'error'
```

This is a **no-op in non-browser environments** (Node.js, SSR, etc.), so it's safe to call unconditionally.

## API Reference

| Method                                        | Description                                                         |
| --------------------------------------------- | ------------------------------------------------------------------- |
| `subscribe(fn)`                               | Register a sync subscriber callback; returns unsubscribe function   |
| `addReporter(reporter)`                       | Add an async reporter (Sentry, webhook, etc.)                       |
| `emit(event)`                                 | Emit an error event (id, timestamp, env auto-assigned)              |
| `getHistory()`                                | Get all events in the ring buffer (readonly, oldest to newest)      |
| `setFrameCount(n)`                            | Update the current engine frame count (called by engine each frame) |
| `onFatal(fn)`                                 | Register a callback invoked before fatal errors are thrown          |
| `install()`                                   | Install global `window.onerror` / `unhandledrejection` handlers     |
| `useErrorBus(engine)`                         | Get the engine's error bus inside a plugin                          |
| `useLogger(source, bus)`                      | Create a scoped logger bound to a module                            |
| `createGwenLogger(source, bus?)`              | Create a standalone logger (for pre-engine code)                    |
| `createErrorBus(opts?)`                       | Create a new error bus instance                                     |
| `ConsoleReporter`                             | Built-in reporter for console output                                |
| `SentryReporter`                              | Built-in reporter for Sentry (if @sentry/browser is installed)     |
| `WebhookReporter`                             | Built-in reporter for batched webhook delivery                      |
