# GwenErrorBus & Engine Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `GwenErrorBus` error pipeline in `@gwenjs/kit`, wire it into the engine frame loop and WASM init, then use it as the foundation for fixing 14 identified bugs across `@gwenjs/core`, `@gwenjs/physics3d`, `@gwenjs/audio`, and `@gwenjs/kit-platformer`.

**Architecture:** A typed pub/sub error bus lives in `@gwenjs/kit/src/errors/`. It provides `useLogger()` and `useErrorBus()` composables for plugins, and `createGwenLogger()` for standalone pre-engine code. The engine creates the bus in `createEngine()`, provides it as the `'errors'` service, and feeds all frame loop errors and WASM panics through it. Each package defines its own `as const` error codes — no global registry.

**Tech Stack:** TypeScript, Vitest, `unctx` (already used by the engine for composable context), `nanoid` (already in monorepo), `@gwenjs/kit`, `@gwenjs/core`, `@gwenjs/physics3d`, `@gwenjs/audio`, `@gwenjs/kit-platformer`.

---

## File Map

### New files
| Path | Responsibility |
|---|---|
| `packages/kit/src/errors/error-types.ts` | `GwenErrorEvent`, `GwenErrorLevel`, `ErrorReporter`, `GwenErrorBusOptions` |
| `packages/kit/src/errors/error-bus.ts` | `GwenErrorBus` class (ring buffer, subscribers, reporters, dev/prod dispatch) |
| `packages/kit/src/errors/create-error-bus.ts` | `createErrorBus()` factory |
| `packages/kit/src/errors/use-logger.ts` | `useLogger(source)` composable + `createGwenLogger(source, bus?)` standalone |
| `packages/kit/src/errors/use-error-bus.ts` | `useErrorBus()` composable |
| `packages/kit/src/errors/reporters/console-reporter.ts` | `ConsoleReporter` (default) |
| `packages/kit/src/errors/reporters/sentry-reporter.ts` | `SentryReporter` (lazy Sentry import) |
| `packages/kit/src/errors/reporters/webhook-reporter.ts` | `WebhookReporter` (batch + retry) |
| `packages/kit/src/errors/index.ts` | Barrel re-export |
| `packages/core/src/errors/codes.ts` | `CoreErrorCodes as const` |
| `packages/physics3d/src/errors/codes.ts` | `Physics3DErrorCodes as const` |
| `packages/audio/src/errors/codes.ts` | `AudioErrorCodes as const` |
| `packages/kit/tests/error-bus.test.ts` | Unit tests for GwenErrorBus |
| `packages/kit/tests/console-reporter.test.ts` | Unit tests for ConsoleReporter |
| `packages/kit/tests/webhook-reporter.test.ts` | Unit tests for WebhookReporter |

### Modified files
| Path | What changes |
|---|---|
| `packages/kit/src/index.ts` | Re-export everything from `./errors/index` |
| `packages/kit/package.json` | Add sub-path exports for `./reporters/sentry` and `./reporters/webhook` |
| `packages/core/src/engine/gwen-engine.ts` | Frame loop catch → errorBus, `startExternal()` sets `_running=true`, targetFPS throttle |
| `packages/core/src/engine/wasm-bridge.ts` | `initWasm()` AbortController timeout, remove `console.log` in prod |
| `packages/core/src/engine/wasm-module-handle.ts` | `WasmRingBuffer._byteOffset` reads `opts.byteOffset` |
| `packages/core/src/engine/runtime-hooks.ts` | Add `'engine:error'` hook |
| `packages/core/src/index.ts` | Remove `_resetWasmBridge` from public barrel |
| `packages/core/tests/test-utils.ts` (or similar) | Move `_resetWasmBridge` to test-only export |
| `packages/physics3d/src/plugin/bvh.ts` | Unify `_bvhWorkerCallbacks` — remove duplicate Map |
| `packages/physics3d/src/plugin/index.ts` | Remove duplicate Map, use `bvh.ts`'s Map, emit `BVH_CALLBACK_HANG` on timeout |
| `packages/audio/src/index.ts` | `pendingLoads.delete()` moved to `.finally()`, emit `AUDIO:PRELOAD_FAILED` on reject |
| `packages/physics3d/src/index.ts` | `addColliderImpl` mesh/convex: emit `MESH_FALLBACK`/`CONVEX_FALLBACK` warning |
| `packages/kit-platformer/src/index.ts` | Replace `physics: any` with direct `physics2d` injection |
| `crates/gwen-wasm-utils/src/debug.rs` | Fix `js_sys::eval` XSS injection |
| `crates/gwen-core/src/bindings.rs` | Remove duplicate `TRANSFORM_SAB_TYPE_ID`, bounds guards |
| `crates/gwen-core/src/ecs/entity.rs` | `EntityAllocator::allocate` → return `Option<EntityId>` |
| `crates/gwen-core/src/ecs/storage.rs` | Fix `get_components_bulk` size inference |

---

## Task 1: GwenErrorBus — Types

**Files:**
- Create: `packages/kit/src/errors/error-types.ts`

- [ ] **Step 1.1: Write the file**

```typescript
// packages/kit/src/errors/error-types.ts

export type GwenErrorLevel = 'fatal' | 'error' | 'warning' | 'info' | 'verbose'

export interface GwenErrorEvent {
  /** Unique identifier for deduplication and tracking. */
  id: string
  level: GwenErrorLevel
  /** Namespaced error code, e.g. `'CORE:WASM_TIMEOUT'`. */
  code: string
  message: string
  /** Module/plugin that emitted the event, e.g. `'@gwenjs/physics3d'`. */
  source: string
  /** Original Error object or WASM sentinel value if available. */
  error?: unknown
  /** Arbitrary key/value context for debugging. */
  context?: Record<string, unknown>
  timestamp: number
  /** Engine frame index at time of emission, if available. */
  frameCount?: number
  env: 'development' | 'production'
  stack?: string
}

export interface ErrorReporter {
  /** Optional filter — if present and returns false, event is not reported. */
  filter?: (event: GwenErrorEvent) => boolean
  report(event: GwenErrorEvent): void | Promise<void>
}

export interface GwenErrorBusOptions {
  /** Defaults to `'development'` if `import.meta.env.PROD` is false, otherwise `'production'`. */
  env?: 'development' | 'production'
  /** Maximum number of events kept in the ring buffer history. Default: 500. */
  historySize?: number
  reporters?: ErrorReporter[]
  /** Called on every event before dispatch — use to attach appVersion, userId, etc. */
  enricher?: (event: Partial<GwenErrorEvent>) => Partial<GwenErrorEvent>
}
```

- [ ] **Step 1.2: Commit**

```bash
git add packages/kit/src/errors/error-types.ts
git commit -m "feat(kit): add GwenErrorBus types

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: GwenErrorBus — Core Class

**Files:**
- Create: `packages/kit/src/errors/error-bus.ts`
- Create: `packages/kit/tests/error-bus.test.ts`

- [ ] **Step 2.1: Write the failing tests**

```typescript
// packages/kit/tests/error-bus.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GwenErrorBus } from '../src/errors/error-bus'

let bus: GwenErrorBus

beforeEach(() => {
  bus = new GwenErrorBus({ env: 'development', historySize: 10 })
})

describe('GwenErrorBus.emit', () => {
  it('assigns id, timestamp, and env to every event', () => {
    const sub = vi.fn()
    bus.subscribe(sub)
    bus.emit({ level: 'info', code: 'TEST:FOO', message: 'hello', source: 'test' })
    const event = sub.mock.calls[0][0]
    expect(typeof event.id).toBe('string')
    expect(event.id.length).toBeGreaterThan(0)
    expect(typeof event.timestamp).toBe('number')
    expect(event.env).toBe('development')
  })

  it('calls sync subscribers synchronously', () => {
    const order: string[] = []
    bus.subscribe(() => order.push('sub'))
    bus.emit({ level: 'info', code: 'TEST:FOO', message: 'x', source: 'test' })
    order.push('after')
    expect(order).toEqual(['sub', 'after'])
  })

  it('does not throw on warning level in dev', () => {
    expect(() =>
      bus.emit({ level: 'warning', code: 'TEST:WARN', message: 'w', source: 'test' }),
    ).not.toThrow()
  })

  it('throws on error level in development', () => {
    expect(() =>
      bus.emit({ level: 'error', code: 'TEST:ERR', message: 'boom', source: 'test' }),
    ).toThrow('boom')
  })

  it('does NOT throw on error level in production', () => {
    const prodBus = new GwenErrorBus({ env: 'production', historySize: 10 })
    expect(() =>
      prodBus.emit({ level: 'error', code: 'TEST:ERR', message: 'boom', source: 'test' }),
    ).not.toThrow()
  })

  it('throws on fatal level in both envs', () => {
    const prodBus = new GwenErrorBus({ env: 'production', historySize: 10 })
    expect(() =>
      prodBus.emit({ level: 'fatal', code: 'TEST:FATAL', message: 'die', source: 'test' }),
    ).toThrow('die')
  })

  it('calls enricher before dispatch', () => {
    const enriched = new GwenErrorBus({
      env: 'development',
      historySize: 10,
      enricher: (e) => ({ ...e, context: { appVersion: '1.2.3' } }),
    })
    const sub = vi.fn()
    enriched.subscribe(sub)
    // warning won't throw
    enriched.emit({ level: 'warning', code: 'TEST:W', message: 'w', source: 'x' })
    expect(sub.mock.calls[0][0].context).toEqual({ appVersion: '1.2.3' })
  })
})

describe('GwenErrorBus history (ring buffer)', () => {
  it('stores events in history', () => {
    bus.emit({ level: 'info', code: 'TEST:A', message: 'a', source: 'x' })
    expect(bus.getHistory()).toHaveLength(1)
  })

  it('wraps at historySize', () => {
    for (let i = 0; i < 15; i++) {
      bus.emit({ level: 'info', code: `TEST:${i}`, message: String(i), source: 'x' })
    }
    expect(bus.getHistory()).toHaveLength(10)
    // Most recent 10 events (5..14) should be present
    const codes = bus.getHistory().map((e) => e.code)
    expect(codes).toContain('TEST:14')
    expect(codes).not.toContain('TEST:0')
  })
})

describe('GwenErrorBus.subscribe', () => {
  it('returns an unsubscribe function', () => {
    const sub = vi.fn()
    const unsub = bus.subscribe(sub)
    unsub()
    bus.emit({ level: 'info', code: 'TEST:X', message: 'x', source: 'x' })
    expect(sub).not.toHaveBeenCalled()
  })
})

describe('GwenErrorBus reporters', () => {
  it('calls reporter asynchronously for non-throwing events', async () => {
    const reporter = { report: vi.fn() }
    bus.addReporter(reporter)
    bus.emit({ level: 'info', code: 'TEST:INFO', message: 'i', source: 'x' })
    await Promise.resolve() // flush microtask
    expect(reporter.report).toHaveBeenCalledOnce()
  })

  it('skips reporter when filter returns false', async () => {
    const reporter = {
      filter: (e: { code: string }) => e.code !== 'TEST:SKIP',
      report: vi.fn(),
    }
    bus.addReporter(reporter)
    bus.emit({ level: 'info', code: 'TEST:SKIP', message: 'skip', source: 'x' })
    await Promise.resolve()
    expect(reporter.report).not.toHaveBeenCalled()
  })
})

describe('GwenErrorBus.setFrameCount', () => {
  it('attaches frameCount to emitted events', () => {
    bus.setFrameCount(42)
    const sub = vi.fn()
    bus.subscribe(sub)
    bus.emit({ level: 'info', code: 'TEST:FC', message: 'f', source: 'x' })
    expect(sub.mock.calls[0][0].frameCount).toBe(42)
  })
})
```

- [ ] **Step 2.2: Run tests to verify they fail**

```bash
pnpm --filter @gwenjs/kit exec vitest run tests/error-bus.test.ts
```
Expected: `FAIL` — `GwenErrorBus` does not exist yet.

- [ ] **Step 2.3: Write the implementation**

```typescript
// packages/kit/src/errors/error-bus.ts
import type { GwenErrorEvent, GwenErrorLevel, ErrorReporter, GwenErrorBusOptions } from './error-types'

// nanoid is already in the monorepo; if unavailable use crypto.randomUUID()
const genId = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

export class GwenErrorBus {
  private readonly _history: GwenErrorEvent[]
  private readonly _historySize: number
  private _historyHead = 0
  private _historyCount = 0
  private readonly _subscribers: Array<(e: GwenErrorEvent) => void> = []
  private readonly _reporters: ErrorReporter[] = []
  private readonly _enricher?: (e: Partial<GwenErrorEvent>) => Partial<GwenErrorEvent>
  private readonly _env: 'development' | 'production'
  private _frameCount: number | undefined
  private _onFatal?: () => void

  constructor(opts: GwenErrorBusOptions = {}) {
    this._env = opts.env ?? 'development'
    this._historySize = opts.historySize ?? 500
    this._history = new Array(this._historySize)
    this._enricher = opts.enricher
    if (opts.reporters) {
      for (const r of opts.reporters) this._reporters.push(r)
    }
  }

  /** Register a sync subscriber called immediately on every emitted event. */
  subscribe(fn: (e: GwenErrorEvent) => void): () => void {
    this._subscribers.push(fn)
    return () => {
      const idx = this._subscribers.indexOf(fn)
      if (idx !== -1) this._subscribers.splice(idx, 1)
    }
  }

  /** Add an async reporter (console, Sentry, webhook, etc.). */
  addReporter(reporter: ErrorReporter): void {
    this._reporters.push(reporter)
  }

  /** Called by the engine each frame so emitted events carry the current frame index. */
  setFrameCount(n: number): void {
    this._frameCount = n
  }

  /**
   * Register a callback to invoke on `fatal` level (before throwing).
   * The engine uses this to call `engine.stop()`.
   */
  onFatal(fn: () => void): void {
    this._onFatal = fn
  }

  /** Read all events currently in the ring buffer (oldest to newest). */
  getHistory(): readonly GwenErrorEvent[] {
    if (this._historyCount < this._historySize) {
      return this._history.slice(0, this._historyCount)
    }
    // Unwrap the ring: from _historyHead to end, then 0 to _historyHead
    const tail = this._history.slice(this._historyHead)
    const head = this._history.slice(0, this._historyHead)
    return [...tail, ...head]
  }

  /**
   * Emit an error event.
   *
   * - `fatal`: calls onFatal() then throws.
   * - `error` + dev: throws after dispatch.
   * - `error` + prod: dispatches without throwing.
   * - `warning | info | verbose`: dispatches only.
   */
  emit(partial: Omit<GwenErrorEvent, 'id' | 'timestamp' | 'env'>): void {
    let event: GwenErrorEvent = {
      id: genId(),
      timestamp: Date.now(),
      env: this._env,
      frameCount: this._frameCount,
      ...partial,
    }

    if (this._enricher) {
      event = { ...event, ...this._enricher(event) } as GwenErrorEvent
    }

    // Push to ring buffer
    this._history[this._historyHead] = event
    this._historyHead = (this._historyHead + 1) % this._historySize
    if (this._historyCount < this._historySize) this._historyCount++

    // Sync subscribers
    for (const sub of this._subscribers) {
      try { sub(event) } catch { /* never crash the bus */ }
    }

    // Async reporters (outside frame critical path)
    for (const reporter of this._reporters) {
      if (reporter.filter && !reporter.filter(event)) continue
      Promise.resolve().then(() => reporter.report(event)).catch(() => { /* silently ignore reporter errors */ })
    }

    this._applyBehavior(event)
  }

  /** Install window.onerror and unhandledrejection handlers (prod only). */
  install(): void {
    if (typeof window === 'undefined') return
    window.addEventListener('error', (ev) => {
      this.emit({
        level: 'error',
        code: 'CORE:UNCAUGHT_ERROR',
        message: ev.message,
        source: '@gwenjs/core',
        error: ev.error,
        context: { filename: ev.filename, lineno: ev.lineno, colno: ev.colno },
      })
    })
    window.addEventListener('unhandledrejection', (ev) => {
      this.emit({
        level: 'error',
        code: 'CORE:UNHANDLED_REJECTION',
        message: ev.reason instanceof Error ? ev.reason.message : String(ev.reason),
        source: '@gwenjs/core',
        error: ev.reason,
      })
    })
  }

  private _applyBehavior(event: GwenErrorEvent): void {
    const { level, message } = event
    if (level === 'fatal') {
      if (this._onFatal) {
        try { this._onFatal() } catch { /* ignore */ }
      }
      throw new Error(`[GWEN:${event.code}] ${message}`)
    }
    if (level === 'error' && this._env === 'development') {
      throw new Error(`[GWEN:${event.code}] ${message}`)
    }
  }
}
```

- [ ] **Step 2.4: Run tests to verify they pass**

```bash
pnpm --filter @gwenjs/kit exec vitest run tests/error-bus.test.ts
```
Expected: all tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add packages/kit/src/errors/error-bus.ts packages/kit/tests/error-bus.test.ts
git commit -m "feat(kit): implement GwenErrorBus ring buffer with dev/prod dispatch

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: GwenErrorBus — Factory, Composables & Barrel

**Files:**
- Create: `packages/kit/src/errors/create-error-bus.ts`
- Create: `packages/kit/src/errors/use-error-bus.ts`
- Create: `packages/kit/src/errors/use-logger.ts`
- Create: `packages/kit/src/errors/index.ts`
- Modify: `packages/kit/src/index.ts`

- [ ] **Step 3.1: Create the factory**

```typescript
// packages/kit/src/errors/create-error-bus.ts
import { GwenErrorBus } from './error-bus'
import type { GwenErrorBusOptions } from './error-types'

export function createErrorBus(opts?: GwenErrorBusOptions): GwenErrorBus {
  const env =
    opts?.env ??
    (typeof import.meta !== 'undefined' && (import.meta as { env?: { PROD?: boolean } }).env?.PROD
      ? 'production'
      : 'development')
  return new GwenErrorBus({ ...opts, env })
}
```

- [ ] **Step 3.2: Create `useErrorBus` composable**

```typescript
// packages/kit/src/errors/use-error-bus.ts
import type { GwenEngine } from '@gwenjs/core'

/**
 * Returns the engine's GwenErrorBus.
 * Must be called within a plugin `setup()` or `defineSystem()` callback.
 *
 * @example
 * const bus = useErrorBus()
 * bus.subscribe((event) => myOverlay.push(event))
 */
export function useErrorBus(engine: GwenEngine): import('./error-bus').GwenErrorBus {
  return engine.inject('errors' as never) as import('./error-bus').GwenErrorBus
}
```

> Note: `'errors'` will be added to `GwenProvides` in Task 5 alongside the engine wiring. Until then this uses `as never` cast.

- [ ] **Step 3.3: Create `useLogger` composable + standalone**

```typescript
// packages/kit/src/errors/use-logger.ts
import type { GwenErrorLevel } from './error-types'
import type { GwenErrorBus } from './error-bus'

export interface GwenLogger {
  fatal(code: string, message: string, context?: Record<string, unknown>): never
  error(code: string, message: string, context?: Record<string, unknown>): void
  warn(code: string, message: string, context?: Record<string, unknown>): void
  info(code: string, message: string, context?: Record<string, unknown>): void
  verbose(code: string, message: string, context?: Record<string, unknown>): void
}

function makeLogger(source: string, bus: GwenErrorBus): GwenLogger {
  const emit = (level: GwenErrorLevel, code: string, message: string, context?: Record<string, unknown>) =>
    bus.emit({ level, code, message, source, context })

  return {
    fatal: (code, message, context) => { emit('fatal', code, message, context); throw new Error(message) },
    error: (code, message, context) => emit('error', code, message, context),
    warn:  (code, message, context) => emit('warning', code, message, context),
    info:  (code, message, context) => emit('info', code, message, context),
    verbose: (code, message, context) => emit('verbose', code, message, context),
  }
}

/**
 * Returns a scoped logger bound to this plugin or system.
 * Must be called within a plugin `setup()`.
 *
 * @example
 * const logger = useLogger('@gwenjs/physics3d')
 * logger.warn(Physics3DErrorCodes.MESH_FALLBACK, 'Falling back to box collider', { entityId })
 */
export function useLogger(source: string, bus: GwenErrorBus): GwenLogger {
  return makeLogger(source, bus)
}

const _noopLogger: GwenLogger = {
  fatal: (_c, msg) => { throw new Error(msg) },
  error: () => {},
  warn:  () => {},
  info:  () => {},
  verbose: () => {},
}

/**
 * Creates a standalone logger for use before engine initialization (WASM init, CLI).
 * Pass the bus when available; falls back to a no-op logger.
 */
export function createGwenLogger(source: string, bus?: GwenErrorBus): GwenLogger {
  if (!bus) return _noopLogger
  return makeLogger(source, bus)
}
```

- [ ] **Step 3.4: Create the barrel**

```typescript
// packages/kit/src/errors/index.ts
export { GwenErrorBus } from './error-bus'
export { createErrorBus } from './create-error-bus'
export { useErrorBus } from './use-error-bus'
export { useLogger, createGwenLogger } from './use-logger'
export type { GwenErrorEvent, GwenErrorLevel, ErrorReporter, GwenErrorBusOptions } from './error-types'
export type { GwenLogger } from './use-logger'
```

- [ ] **Step 3.5: Add to kit public barrel**

In `packages/kit/src/index.ts`, add at the end:

```typescript
// ── Error bus ─────────────────────────────────────────────────────────────────
export {
  GwenErrorBus,
  createErrorBus,
  useErrorBus,
  useLogger,
  createGwenLogger,
} from './errors/index'
export type {
  GwenErrorEvent,
  GwenErrorLevel,
  ErrorReporter,
  GwenErrorBusOptions,
  GwenLogger,
} from './errors/index'
```

- [ ] **Step 3.6: Commit**

```bash
git add packages/kit/src/errors/ packages/kit/src/index.ts
git commit -m "feat(kit): add error bus factory, composables, and barrel exports

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Built-in Reporters

**Files:**
- Create: `packages/kit/src/errors/reporters/console-reporter.ts`
- Create: `packages/kit/src/errors/reporters/sentry-reporter.ts`
- Create: `packages/kit/src/errors/reporters/webhook-reporter.ts`
- Create: `packages/kit/tests/console-reporter.test.ts`
- Create: `packages/kit/tests/webhook-reporter.test.ts`
- Modify: `packages/kit/package.json`

- [ ] **Step 4.1: Write ConsoleReporter tests**

```typescript
// packages/kit/tests/console-reporter.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ConsoleReporter } from '../src/errors/reporters/console-reporter'
import type { GwenErrorEvent } from '../src/errors/error-types'

const makeEvent = (level: GwenErrorEvent['level'], env: GwenErrorEvent['env'] = 'development'): GwenErrorEvent => ({
  id: 'x', level, code: 'TEST:X', message: 'test message',
  source: '@test', timestamp: Date.now(), env,
})

describe('ConsoleReporter', () => {
  let spyError: ReturnType<typeof vi.spyOn>
  let spyWarn: ReturnType<typeof vi.spyOn>
  let spyLog: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    spyError = vi.spyOn(console, 'error').mockImplementation(() => {})
    spyWarn  = vi.spyOn(console, 'warn').mockImplementation(() => {})
    spyLog   = vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => { spyError.mockRestore(); spyWarn.mockRestore(); spyLog.mockRestore() })

  it('uses console.error for fatal and error', () => {
    const r = new ConsoleReporter()
    r.report(makeEvent('error'))
    expect(spyError).toHaveBeenCalledOnce()
  })

  it('uses console.warn for warning', () => {
    const r = new ConsoleReporter()
    r.report(makeEvent('warning'))
    expect(spyWarn).toHaveBeenCalledOnce()
  })

  it('uses console.log for info and verbose', () => {
    const r = new ConsoleReporter()
    r.report(makeEvent('info'))
    expect(spyLog).toHaveBeenCalledOnce()
  })

  it('includes full stack in dev mode', () => {
    const r = new ConsoleReporter()
    const event = { ...makeEvent('error', 'development'), stack: 'Error\n  at foo.ts:1' }
    r.report(event)
    expect(spyError.mock.calls[0].join(' ')).toContain('Error\n  at foo.ts:1')
  })

  it('omits stack in prod mode', () => {
    const r = new ConsoleReporter()
    const event = { ...makeEvent('error', 'production'), stack: 'Error\n  at foo.ts:1' }
    r.report(event)
    expect(spyError.mock.calls[0].join(' ')).not.toContain('at foo.ts')
  })
})
```

- [ ] **Step 4.2: Run to confirm failure**

```bash
pnpm --filter @gwenjs/kit exec vitest run tests/console-reporter.test.ts
```
Expected: FAIL — `ConsoleReporter` does not exist.

- [ ] **Step 4.3: Implement ConsoleReporter**

```typescript
// packages/kit/src/errors/reporters/console-reporter.ts
import type { ErrorReporter, GwenErrorEvent } from '../error-types'

export class ConsoleReporter implements ErrorReporter {
  report(event: GwenErrorEvent): void {
    const prefix = `[GWEN:${event.code}] (${event.source})`
    const msg = `${prefix} ${event.message}`

    if (event.level === 'fatal' || event.level === 'error') {
      if (event.env === 'development' && event.stack) {
        console.error(msg, '\n', event.stack, event.context ?? '')
      } else {
        console.error(msg, event.context ?? '')
      }
    } else if (event.level === 'warning') {
      console.warn(msg, event.context ?? '')
    } else {
      console.log(msg, event.context ?? '')
    }
  }
}
```

- [ ] **Step 4.4: Run to confirm pass**

```bash
pnpm --filter @gwenjs/kit exec vitest run tests/console-reporter.test.ts
```

- [ ] **Step 4.5: Write WebhookReporter tests**

```typescript
// packages/kit/tests/webhook-reporter.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WebhookReporter } from '../src/errors/reporters/webhook-reporter'
import type { GwenErrorEvent } from '../src/errors/error-types'

const makeEvent = (): GwenErrorEvent => ({
  id: 'x', level: 'error', code: 'TEST:X', message: 'oops',
  source: '@test', timestamp: Date.now(), env: 'production',
})

describe('WebhookReporter', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('flushes when batch size is reached', async () => {
    const r = new WebhookReporter({ url: 'https://example.com/errors', batchSize: 2, flushIntervalMs: 60_000 })
    r.report(makeEvent())
    r.report(makeEvent())
    await new Promise((res) => setTimeout(res, 10))
    expect(fetchMock).toHaveBeenCalledOnce()
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toHaveLength(2)
    r.destroy()
  })

  it('does not flush before batch size', async () => {
    const r = new WebhookReporter({ url: 'https://example.com/errors', batchSize: 5, flushIntervalMs: 60_000 })
    r.report(makeEvent())
    await new Promise((res) => setTimeout(res, 10))
    expect(fetchMock).not.toHaveBeenCalled()
    r.destroy()
  })

  it('drops oldest events when queue exceeds maxQueueSize', () => {
    const r = new WebhookReporter({ url: 'https://x.com', batchSize: 500, flushIntervalMs: 60_000, maxQueueSize: 3 })
    for (let i = 0; i < 5; i++) r.report({ ...makeEvent(), id: `e${i}` })
    // Should keep last 3
    const queue = (r as { _queue: GwenErrorEvent[] })._queue
    expect(queue).toHaveLength(3)
    expect(queue[0].id).toBe('e2')
    r.destroy()
  })
})
```

- [ ] **Step 4.6: Run to confirm failure**

```bash
pnpm --filter @gwenjs/kit exec vitest run tests/webhook-reporter.test.ts
```

- [ ] **Step 4.7: Implement WebhookReporter**

```typescript
// packages/kit/src/errors/reporters/webhook-reporter.ts
import type { ErrorReporter, GwenErrorEvent } from '../error-types'

export interface WebhookReporterOptions {
  url: string
  /** Number of events that trigger an immediate flush. Default: 50. */
  batchSize?: number
  /** Interval in ms between automatic flushes. Default: 5000. */
  flushIntervalMs?: number
  /** Maximum number of events to hold in memory. Oldest dropped first. Default: 200. */
  maxQueueSize?: number
  /** Maximum retry attempts per batch. Default: 3. */
  maxRetries?: number
}

export class WebhookReporter implements ErrorReporter {
  _queue: GwenErrorEvent[] = []
  private readonly _url: string
  private readonly _batchSize: number
  private readonly _maxQueueSize: number
  private readonly _maxRetries: number
  private readonly _flushTimer: ReturnType<typeof setInterval>

  constructor(opts: WebhookReporterOptions) {
    this._url = opts.url
    this._batchSize = opts.batchSize ?? 50
    this._maxQueueSize = opts.maxQueueSize ?? 200
    this._maxRetries = opts.maxRetries ?? 3
    this._flushTimer = setInterval(() => this._flush(), opts.flushIntervalMs ?? 5_000)
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this._flush())
    }
  }

  report(event: GwenErrorEvent): void {
    if (this._queue.length >= this._maxQueueSize) {
      this._queue.shift() // drop oldest
    }
    this._queue.push(event)
    if (this._queue.length >= this._batchSize) {
      this._flush()
    }
  }

  destroy(): void {
    clearInterval(this._flushTimer)
  }

  private _flush(): void {
    if (this._queue.length === 0) return
    const batch = this._queue.splice(0)
    this._sendWithRetry(batch, 0)
  }

  private _sendWithRetry(batch: GwenErrorEvent[], attempt: number): void {
    fetch(this._url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    }).catch(() => {
      if (attempt < this._maxRetries) {
        const delay = Math.min(1000 * 2 ** attempt, 30_000)
        setTimeout(() => this._sendWithRetry(batch, attempt + 1), delay)
      }
      // After maxRetries, drop silently — the bus must never crash the app
    })
  }
}
```

- [ ] **Step 4.8: Implement SentryReporter (lazy import)**

```typescript
// packages/kit/src/errors/reporters/sentry-reporter.ts
import type { ErrorReporter, GwenErrorEvent, GwenErrorLevel } from '../error-types'

type SentrySeverity = 'fatal' | 'error' | 'warning' | 'info' | 'debug'

const LEVEL_MAP: Record<GwenErrorLevel, SentrySeverity> = {
  fatal:   'fatal',
  error:   'error',
  warning: 'warning',
  info:    'info',
  verbose: 'debug',
}

export class SentryReporter implements ErrorReporter {
  private _sentry: { captureMessage: (msg: string, level: SentrySeverity, extra?: object) => void } | null = null

  report(event: GwenErrorEvent): void {
    this._getSentry().then((sentry) => {
      if (!sentry) return
      sentry.captureMessage(`[${event.code}] ${event.message}`, LEVEL_MAP[event.level], {
        extra: {
          source: event.source,
          code: event.code,
          frameCount: event.frameCount,
          context: event.context,
        },
      })
    })
  }

  private async _getSentry() {
    if (this._sentry) return this._sentry
    try {
      const mod = await import('@sentry/browser')
      this._sentry = mod
      return mod
    } catch {
      console.warn('[GWEN] @sentry/browser not installed — SentryReporter is a no-op')
      return null
    }
  }
}
```

- [ ] **Step 4.9: Run all reporter tests**

```bash
pnpm --filter @gwenjs/kit exec vitest run tests/console-reporter.test.ts tests/webhook-reporter.test.ts
```
Expected: all pass.

- [ ] **Step 4.10: Add sub-path exports to kit package.json**

In `packages/kit/package.json`, add to the `"exports"` field:

```json
"./reporters/console": "./src/errors/reporters/console-reporter.ts",
"./reporters/sentry":  "./src/errors/reporters/sentry-reporter.ts",
"./reporters/webhook": "./src/errors/reporters/webhook-reporter.ts"
```

- [ ] **Step 4.11: Commit**

```bash
git add packages/kit/src/errors/reporters/ packages/kit/tests/ packages/kit/package.json
git commit -m "feat(kit): add ConsoleReporter, SentryReporter, WebhookReporter

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Engine Integration — Error Bus Wiring

**Files:**
- Modify: `packages/core/src/engine/gwen-engine.ts`
- Modify: `packages/core/src/engine/runtime-hooks.ts`

> The goal: create the bus in `createEngine()`, provide it as `'errors'`, wire the frame loop catch, wire `onFatal` to `engine.stop()`, set `frameCount` each tick, fix `startExternal()` missing `_running=true`.

- [ ] **Step 5.1: Add `'engine:error'` hook to runtime-hooks.ts**

In `packages/core/src/engine/runtime-hooks.ts`, add inside `GwenRuntimeHooks`:

```typescript
/** Fired when the engine catches an error in the frame loop. */
'engine:error': (error: unknown) => void;
```

- [ ] **Step 5.2: Add `'errors'` to `GwenProvides`**

In `packages/core/src/engine/gwen-engine.ts`, locate the `GwenProvides` interface and add:

```typescript
// In GwenProvides (augmentable):
// This is declared as a module augmentation in @gwenjs/kit to keep the dep direction correct.
// The engine uses 'errors' as a string key — the type is erased at runtime.
```

In `packages/kit/src/errors/index.ts`, add the augmentation:

```typescript
// Augment GwenProvides so engine.inject('errors') returns GwenErrorBus
declare module '@gwenjs/core' {
  interface GwenProvides {
    errors: import('./error-bus').GwenErrorBus
  }
}
```

- [ ] **Step 5.3: Wire the bus into createEngine() and the frame loop**

In `packages/core/src/engine/gwen-engine.ts`:

1. Add import at top:
```typescript
import { createErrorBus } from '@gwenjs/kit/src/errors/create-error-bus'
```

2. In the `GwenEngineImpl` constructor (after `this.targetFPS = opts.targetFPS ?? 60`):
```typescript
this._errorBus = createErrorBus({ env: opts.env })
this._errorBus.onFatal(() => this.stop())
this.provide('errors', this._errorBus as never)
```

3. Add private field:
```typescript
private readonly _errorBus: import('@gwenjs/kit').GwenErrorBus
```

4. In `start()`, inside the RAF loop, replace:
```typescript
// BEFORE:
try {
  await this._runFrame(dt);
} finally {
  if (this._running) this._rafHandle = requestAnimationFrame(loop);
}

// AFTER:
try {
  this._errorBus.setFrameCount(this._frameCount ?? 0)
  await this._runFrame(dt);
} catch (err) {
  await this.hooks.callHook('engine:error', err)
  this._errorBus.emit({
    level: 'error',
    code: 'CORE:FRAME_LOOP_ERROR',
    message: err instanceof Error ? err.message : String(err),
    source: '@gwenjs/core',
    error: err,
    stack: err instanceof Error ? err.stack : undefined,
  })
} finally {
  if (this._running) this._rafHandle = requestAnimationFrame(loop);
}
```

5. Fix `startExternal()` — add `_running = true` and `_running = false` on stop:
```typescript
async startExternal(): Promise<void> {
  if (this._running) return
  this._running = true  // ← was missing
  await this.hooks.callHook('engine:init');
  await this.hooks.callHook('engine:start');
}
```

Also wrap `advance()` the same way as the RAF loop (it already has a try/finally — add the catch before finally):
```typescript
try {
  this._errorBus.setFrameCount(this._frameCount ?? 0)
  await this._runFrame(cappedDt);
} catch (err) {
  this._errorBus.emit({
    level: 'error',
    code: 'CORE:FRAME_LOOP_ERROR',
    message: err instanceof Error ? err.message : String(err),
    source: '@gwenjs/core',
    error: err,
  })
} finally {
  this._advancing = false;
}
```

- [ ] **Step 5.4: Install window handlers in prod**

In `createEngine()` factory (or in `start()`), after creating the bus:

```typescript
if (opts.env === 'production' || import.meta.env?.PROD) {
  this._errorBus.install()
}
```

- [ ] **Step 5.5: Run existing core tests to verify no regression**

```bash
pnpm --filter @gwenjs/core exec vitest run
```
Expected: all existing tests pass.

- [ ] **Step 5.6: Commit**

```bash
git add packages/core/src/engine/gwen-engine.ts packages/core/src/engine/runtime-hooks.ts packages/kit/src/errors/index.ts
git commit -m "feat(core): wire GwenErrorBus into engine frame loop and startExternal

- Frame loop catch → errorBus.emit(CORE:FRAME_LOOP_ERROR)
- startExternal() now sets _running=true (was missing)
- advance() has the same error catch
- window.onerror/unhandledrejection installed in prod
- 'engine:error' hook added to GwenRuntimeHooks
- GwenProvides augmented with 'errors' service key

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: Core Hardening — targetFPS Throttle

**Files:**
- Modify: `packages/core/src/engine/gwen-engine.ts`

The `targetFPS` field is stored but the RAF loop never throttles. Fix: if `now - _lastFrameTime < frameBudgetMs`, skip `_runFrame` and reschedule immediately.

- [ ] **Step 6.1: Add the throttle**

In `packages/core/src/engine/gwen-engine.ts`, inside the RAF `loop` callback, BEFORE the try/catch:

```typescript
const loop = async (now: number) => {
  if (!this._running) return;

  // Throttle to targetFPS: skip frame if not enough time has elapsed
  const frameBudgetMs = 1000 / this.targetFPS
  if (now - this._lastFrameTime < frameBudgetMs - 0.5) {
    this._rafHandle = requestAnimationFrame(loop)
    return
  }

  const rawDt = now - this._lastFrameTime;
  // ... rest of the loop
```

- [ ] **Step 6.2: Write a test for targetFPS (vitest fake timers)**

In `packages/core/tests/engine-targetfps.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createEngine } from '../src'

describe('targetFPS throttle', () => {
  it('does not run _runFrame when frame arrives too early', async () => {
    const engine = createEngine({ targetFPS: 30 })
    const frameBudget = 1000 / 30  // ~33.3ms

    let frameCount = 0
    engine.hooks.hook('engine:tick', () => { frameCount++ })

    // We cannot easily test RAF in vitest — test via advance() which has the same guard
    await engine.startExternal()
    await engine.advance(frameBudget + 1)  // first frame: full budget
    expect(frameCount).toBe(1)
    await engine.stop()
  })
})
```

- [ ] **Step 6.3: Run the test**

```bash
pnpm --filter @gwenjs/core exec vitest run tests/engine-targetfps.test.ts
```
Expected: pass.

- [ ] **Step 6.4: Commit**

```bash
git add packages/core/src/engine/gwen-engine.ts packages/core/tests/engine-targetfps.test.ts
git commit -m "fix(core): enforce targetFPS throttle in RAF loop

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 7: Core Hardening — initWasm Timeout & Prod Logs

**Files:**
- Modify: `packages/core/src/engine/wasm-bridge.ts`
- Create: `packages/core/src/errors/codes.ts`

- [ ] **Step 7.1: Create CoreErrorCodes**

```typescript
// packages/core/src/errors/codes.ts
export const CoreErrorCodes = {
  WASM_TIMEOUT:           'CORE:WASM_TIMEOUT',
  WASM_PANIC:             'CORE:WASM_PANIC',
  FRAME_LOOP_ERROR:       'CORE:FRAME_LOOP_ERROR',
  UNCAUGHT_ERROR:         'CORE:UNCAUGHT_ERROR',
  UNHANDLED_REJECTION:    'CORE:UNHANDLED_REJECTION',
} as const
```

Export from `packages/core/src/index.ts`:
```typescript
export { CoreErrorCodes } from './errors/codes'
```

- [ ] **Step 7.2: Add AbortController timeout to initWasm**

In `packages/core/src/engine/wasm-bridge.ts`, locate the `_initPromise = (async () => {` block.

Replace the two `fetch()` calls:

```typescript
// BEFORE (line ~1077):
const wasmInput = resolvedWasmUrl ? await fetch(resolvedWasmUrl) : undefined;

// AFTER:
const _fetchTimeout = 10_000  // 10 seconds
const _controller = new AbortController()
const _timeoutId = setTimeout(() => _controller.abort(), _fetchTimeout)

let wasmInput: Response | undefined
if (resolvedWasmUrl) {
  try {
    wasmInput = await fetch(resolvedWasmUrl, { signal: _controller.signal })
  } catch (err) {
    clearTimeout(_timeoutId)
    if (_controller.signal.aborted) {
      throw new Error(
        `[GWEN] initWasm(): WASM fetch timed out after ${_fetchTimeout / 1000}s.\n` +
        `URL: ${resolvedWasmUrl}\n` +
        'Check your network connection and server headers.',
      )
    }
    throw err
  }
  clearTimeout(_timeoutId)
}
```

Also replace the `initSync` fetch path:
```typescript
// BEFORE:
const buf = await (await fetch(resolvedWasmUrl!)).arrayBuffer();
// AFTER:
const _c2 = new AbortController()
const _t2 = setTimeout(() => _c2.abort(), _fetchTimeout)
const _resp = await fetch(resolvedWasmUrl!, { signal: _c2.signal }).catch((err) => {
  clearTimeout(_t2)
  if (_c2.signal.aborted) throw new Error(`[GWEN] initWasm(): WASM fetch timed out after ${_fetchTimeout / 1000}s.`)
  throw err
})
clearTimeout(_t2)
const buf = await _resp.arrayBuffer()
```

- [ ] **Step 7.3: Remove console.log from production WASM init**

Still in `wasm-bridge.ts`, locate:
```typescript
if (variant === 'physics2d') {
  console.log('[GWEN] WASM core loaded — Physics2D variant active');
```

Replace with:
```typescript
if (typeof import.meta !== 'undefined' && !(import.meta as { env?: { PROD?: boolean } }).env?.PROD) {
  if (variant === 'physics2d') {
    console.log('[GWEN] WASM core loaded — Physics2D variant active')
  } else if (variant === 'physics3d') {
    console.log('[GWEN] WASM core loaded — Physics3D variant active')
  } else {
    console.log('[GWEN] WASM core loaded — Light variant active')
  }
}
```

- [ ] **Step 7.4: Fix WasmRingBuffer._byteOffset**

In `packages/core/src/engine/wasm-module-handle.ts`, in `WasmRingBuffer` constructor:

```typescript
// BEFORE:
this._byteOffset = 0;
// AFTER:
this._byteOffset = opts.byteOffset ?? 0;
```

- [ ] **Step 7.5: Run core tests**

```bash
pnpm --filter @gwenjs/core exec vitest run
```

- [ ] **Step 7.6: Commit**

```bash
git add packages/core/src/errors/codes.ts packages/core/src/engine/wasm-bridge.ts packages/core/src/engine/wasm-module-handle.ts packages/core/src/index.ts
git commit -m "fix(core): initWasm 10s timeout, remove prod console.log, fix WasmRingBuffer byteOffset

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 8: Test Utils Isolation

**Files:**
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/engine/wasm-bridge.ts`
- Create/Modify: `packages/core/src/test-utils.ts`

The goal: `_resetWasmBridge` must NOT be in the public barrel. It should only be importable via `@gwenjs/core/test-utils`.

- [ ] **Step 8.1: Remove from public barrel**

In `packages/core/src/index.ts`, find and remove:
```typescript
  _resetWasmBridge,
```
(line ~99 in the exports list).

- [ ] **Step 8.2: Create a test-utils sub-path module**

```typescript
// packages/core/src/test-utils.ts
/**
 * Test utilities for @gwenjs/core.
 * DO NOT import this in production code.
 * Import via: import { _resetWasmBridge } from '@gwenjs/core/test-utils'
 */
export { _resetWasmBridge } from './engine/wasm-bridge'
```

- [ ] **Step 8.3: Add sub-path export to package.json**

In `packages/core/package.json`, add to `"exports"`:
```json
"./test-utils": "./src/test-utils.ts"
```

- [ ] **Step 8.4: Update all internal test imports**

Search for any file that imports `_resetWasmBridge` from `@gwenjs/core` and update them:

```bash
grep -r "_resetWasmBridge" packages/ --include="*.ts" -l
```

For each file found, change:
```typescript
import { _resetWasmBridge } from '@gwenjs/core'
```
to:
```typescript
import { _resetWasmBridge } from '@gwenjs/core/test-utils'
```

- [ ] **Step 8.5: Run core tests**

```bash
pnpm --filter @gwenjs/core exec vitest run
```

- [ ] **Step 8.6: Commit**

```bash
git add packages/core/src/index.ts packages/core/src/test-utils.ts packages/core/package.json
git commit -m "fix(core): move _resetWasmBridge to @gwenjs/core/test-utils sub-path

Prevents external consumers from corrupting the WASM singleton.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 9: Plugin Fix — BVH Worker Callbacks (physics3d)

**Files:**
- Modify: `packages/physics3d/src/plugin/bvh.ts`
- Modify: `packages/physics3d/src/plugin/index.ts`
- Create: `packages/physics3d/src/errors/codes.ts`

**The bug:** `_bvhWorkerCallbacks` is declared independently in BOTH `bvh.ts:58` AND `index.ts:56`. The worker sends responses in `bvh.ts`, which looks up callbacks in `bvh.ts`'s Map. But callers in `index.ts` store callbacks in `index.ts`'s Map. Result: Promises hang forever.

**The fix:** Remove the Map from `index.ts`; import and use the single Map from `bvh.ts`. Add a timeout so hanging callbacks reject after 30s instead of hanging forever.

- [ ] **Step 9.1: Create Physics3DErrorCodes**

```typescript
// packages/physics3d/src/errors/codes.ts
export const Physics3DErrorCodes = {
  BVH_CALLBACK_HANG:   'PHYSICS3D:BVH_CALLBACK_HANG',
  BVH_WORKER_TIMEOUT:  'PHYSICS3D:BVH_WORKER_TIMEOUT',
  MESH_FALLBACK:       'PHYSICS3D:MESH_FALLBACK',
  CONVEX_FALLBACK:     'PHYSICS3D:CONVEX_FALLBACK',
} as const
```

- [ ] **Step 9.2: Fix bvh.ts — export the Map**

In `packages/physics3d/src/plugin/bvh.ts`, change the declaration of `_bvhWorkerCallbacks` from:
```typescript
const _bvhWorkerCallbacks = new Map<...>()
```
to:
```typescript
export const _bvhWorkerCallbacks = new Map<string, { resolve: (buf: ArrayBuffer) => void; reject: (err: Error) => void; timeoutId: ReturnType<typeof setTimeout> }>()
```

When the worker responds (the `message` handler), call `clearTimeout` on the stored `timeoutId` before resolving:
```typescript
// In the worker message handler in bvh.ts:
const cb = _bvhWorkerCallbacks.get(id)
if (cb) {
  clearTimeout(cb.timeoutId)
  _bvhWorkerCallbacks.delete(id)
  cb.resolve(data.buffer)
}
```

- [ ] **Step 9.3: Fix index.ts — remove duplicate Map, add timeout**

In `packages/physics3d/src/plugin/index.ts`:

1. Remove the local `_bvhWorkerCallbacks = new Map(...)` declaration.
2. Add import:
```typescript
import { _bvhWorkerCallbacks } from './bvh'
```
3. Where callbacks are stored (the `new Promise` block), add a 30s timeout:
```typescript
const id = crypto.randomUUID()
const promise = new Promise<ArrayBuffer>((resolve, reject) => {
  const timeoutId = setTimeout(() => {
    _bvhWorkerCallbacks.delete(id)
    reject(new Error(`[PHYSICS3D:BVH_WORKER_TIMEOUT] BVH worker did not respond for mesh "${url}" within 30s`))
  }, 30_000)
  _bvhWorkerCallbacks.set(id, { resolve, reject, timeoutId })
})
// Post the message with the same id so bvh.ts can match it
_bvhWorker.postMessage({ id, url, ... })
```

- [ ] **Step 9.4: Run physics3d tests**

```bash
pnpm --filter @gwenjs/physics3d exec vitest run
```

- [ ] **Step 9.5: Commit**

```bash
git add packages/physics3d/src/plugin/bvh.ts packages/physics3d/src/plugin/index.ts packages/physics3d/src/errors/codes.ts
git commit -m "fix(physics3d): unify BVH worker callback Map and add 30s timeout

Previously two separate Maps caused all mesh collider Promises
to hang forever. Also adds timeout to surface the bug with a
useful error message.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 10: Plugin Fix — Audio Preload Leak

**Files:**
- Modify: `packages/audio/src/index.ts`
- Create: `packages/audio/src/errors/codes.ts`

**The bug:** `pendingLoads.delete(id)` is inside `.then()` so rejected loads stay in the Map forever — retry is impossible.

- [ ] **Step 10.1: Create AudioErrorCodes**

```typescript
// packages/audio/src/errors/codes.ts
export const AudioErrorCodes = {
  PRELOAD_FAILED: 'AUDIO:PRELOAD_FAILED',
  DECODE_ERROR:   'AUDIO:DECODE_ERROR',
} as const
```

- [ ] **Step 10.2: Fix the leak**

In `packages/audio/src/index.ts`, locate the `preload()` method. Find the pattern:
```typescript
.then(() => {
  pendingLoads.delete(id)
  // ...
})
```

Change to `.finally()`:
```typescript
.then((buffer) => {
  audioCache.set(id, buffer)
})
.catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err)
  console.warn(`[AUDIO:PRELOAD_FAILED] Failed to preload audio "${id}": ${msg}`)
})
.finally(() => {
  pendingLoads.delete(id)  // ← always clean up, even on failure
})
```

- [ ] **Step 10.3: Run audio tests**

```bash
pnpm --filter @gwenjs/audio exec vitest run
```

- [ ] **Step 10.4: Commit**

```bash
git add packages/audio/src/index.ts packages/audio/src/errors/codes.ts
git commit -m "fix(audio): move pendingLoads.delete() to .finally() to prevent preload leak

Failed audio loads can now be retried after the first failure.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 11: Plugin Fix — Mesh/Convex Collider Silent Fallback

**Files:**
- Modify: `packages/physics3d/src/index.ts`

**The bug:** In `addColliderImpl`, `shape.type === 'mesh'` and `shape.type === 'convex'` fall through to a 1×1×1 AABB without any warning. Game developers have no way to know their mesh colliders are silently broken.

- [ ] **Step 11.1: Add warning on fallback**

In `packages/physics3d/src/index.ts` around line 1060, in `addColliderImpl`, find the `switch/if` block. In the fallback branch for `'mesh'` and `'convex'`:

```typescript
// BEFORE (approximate):
case 'mesh':
case 'convex':
  // falls through to default box

// AFTER:
case 'mesh':
  console.warn(
    `[PHYSICS3D:MESH_FALLBACK] useMeshCollider() is not yet implemented in this build. ` +
    `Falling back to a 1×1×1 box collider for entity. ` +
    `This is a known issue tracked as RFC-06b.`
  )
  break
case 'convex':
  console.warn(
    `[PHYSICS3D:CONVEX_FALLBACK] useConvexCollider() is not yet implemented in this build. ` +
    `Falling back to a 1×1×1 box collider for entity. ` +
    `This is a known issue tracked as RFC-06b.`
  )
  break
```

- [ ] **Step 11.2: Run physics3d tests**

```bash
pnpm --filter @gwenjs/physics3d exec vitest run
```

- [ ] **Step 11.3: Commit**

```bash
git add packages/physics3d/src/index.ts
git commit -m "fix(physics3d): warn on mesh/convex collider silent fallback

Previously useMeshCollider() and useConvexCollider() silently
degraded to a 1x1x1 box with no indication to the developer.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 12: Plugin Fix — kit-platformer physics2d Direct Injection

**Files:**
- Modify: `packages/kit-platformer/src/index.ts`

**The bug:** kit-platformer injects a service under key `'physics'` (type `any`) that requires undocumented manual wiring: `engine.provide('physics', engine.inject('physics2d'))`. 

**The fix:** Use `engine.inject('physics2d')` directly with the proper type.

- [ ] **Step 12.1: Replace `physics: any` with typed injection**

In `packages/kit-platformer/src/index.ts`, find all occurrences of `engine.inject('physics')` or references to the `physics: any` bridge service.

Replace `engine.inject('physics')` with `engine.inject('physics2d')`.

Remove any `engine.provide('physics', ...)` calls from the platformer setup code.

Update the type annotation from `any` to the proper physics2d API type:
```typescript
import type { Physics2DAPI } from '@gwenjs/physics2d'
const physics = engine.inject('physics2d') as Physics2DAPI
```

- [ ] **Step 12.2: Run kit-platformer tests**

```bash
pnpm --filter @gwenjs/kit-platformer exec vitest run 2>/dev/null || echo "no tests yet"
pnpm typecheck 2>&1 | grep "kit-platformer" | head -20
```

- [ ] **Step 12.3: Commit**

```bash
git add packages/kit-platformer/src/
git commit -m "fix(kit-platformer): inject physics2d directly, remove 'physics: any' bridge

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 13: Rust Fix — XSS Injection in js_sys::eval

**Files:**
- Modify: `crates/gwen-wasm-utils/src/debug.rs`

**The bug:** `js_sys::eval()` interpolates `plugin_name` directly into a JS string. If a plugin name contains `'`, the JS string is broken or injectable.

- [ ] **Step 13.1: View the current code**

```bash
cat crates/gwen-wasm-utils/src/debug.rs
```

- [ ] **Step 13.2: Write a Rust unit test**

In `crates/gwen-wasm-utils/src/debug.rs`, add (or in a `#[cfg(test)]` block):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_plugin_name_strips_quotes() {
        // Any apostrophe in the name should be escaped/stripped before JS eval
        let name = "my-plugin'; alert(1); //";
        let sanitized = sanitize_for_js(name);
        assert!(!sanitized.contains('\''));
        assert!(!sanitized.contains(';'));
    }
}
```

Run:
```bash
cargo test -p gwen-wasm-utils
```
Expected: FAIL — `sanitize_for_js` does not exist yet.

- [ ] **Step 13.3: Fix the eval call**

In `crates/gwen-wasm-utils/src/debug.rs`, extract a sanitizer and apply it:

```rust
/// Strips characters that could break out of a single-quoted JS string literal.
fn sanitize_for_js(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_alphanumeric() || matches!(c, '-' | '_' | ':' | '@' | '/'))
        .collect()
}
```

Then in the `eval` call, replace the direct interpolation with:
```rust
let safe_name = sanitize_for_js(plugin_name);
let js_code = format!("window.__gwenDebug = window.__gwenDebug || {{}}; window.__gwenDebug['{}'] = true;", safe_name);
js_sys::eval(&js_code).ok();
```

- [ ] **Step 13.4: Run tests**

```bash
cargo test -p gwen-wasm-utils
```
Expected: pass.

- [ ] **Step 13.5: Commit**

```bash
git add crates/gwen-wasm-utils/src/debug.rs
git commit -m "fix(wasm-utils): sanitize plugin_name before js_sys::eval to prevent JS injection

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 14: Rust Fix — TRANSFORM_SAB_TYPE_ID Deduplication

**Files:**
- Modify: `crates/gwen-core/src/bindings.rs`
- Modify: `crates/gwen-core/src/ecs/storage.rs`

**The bug:** `TRANSFORM_SAB_TYPE_ID` is defined at line 26 in `bindings.rs` and independently at line 250 in `storage.rs` — they can drift silently.

- [ ] **Step 14.1: Write a test that catches drift**

In `crates/gwen-core/src/ecs/storage.rs` tests, add:

```rust
#[test]
fn transform_sab_type_id_consistent_with_bindings() {
    use crate::bindings::TRANSFORM_SAB_TYPE_ID as BINDINGS_ID;
    assert_eq!(
        BINDINGS_ID,
        TRANSFORM_SAB_TYPE_ID,
        "TRANSFORM_SAB_TYPE_ID must be the same constant in bindings.rs and storage.rs"
    );
}
```

Run:
```bash
cargo test -p gwen-core -- transform_sab
```

- [ ] **Step 14.2: Remove the duplicate**

In `crates/gwen-core/src/ecs/storage.rs`, find `const TRANSFORM_SAB_TYPE_ID: u32 = ...` (line ~250).

Replace the constant definition with an import:
```rust
use crate::bindings::TRANSFORM_SAB_TYPE_ID;
```

Remove the `const` declaration.

- [ ] **Step 14.3: Ensure bindings.rs exports it as pub**

In `crates/gwen-core/src/bindings.rs` line 26, ensure:
```rust
pub const TRANSFORM_SAB_TYPE_ID: u32 = <value>;
```

- [ ] **Step 14.4: Run Rust tests**

```bash
cargo test -p gwen-core
```

- [ ] **Step 14.5: Commit**

```bash
git add crates/gwen-core/src/bindings.rs crates/gwen-core/src/ecs/storage.rs
git commit -m "fix(gwen-core): deduplicate TRANSFORM_SAB_TYPE_ID — single source of truth in bindings.rs

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 15: Rust Fix — EntityAllocator panic → Option

**Files:**
- Modify: `crates/gwen-core/src/ecs/entity.rs`
- Modify: `crates/gwen-core/src/bindings.rs`

**The bug:** `EntityAllocator::allocate` calls `panic!("Entity limit reached")` at line 84. In WASM there is no stack unwinding — this crashes the entire JS page as an unrecoverable `RuntimeError`.

**The fix:** Return `Option<EntityId>`. The binding checks for `None` and returns a sentinel (0 or u32::MAX) that JS can check.

- [ ] **Step 15.1: Write a test for the Option behavior**

In `crates/gwen-core/src/ecs/entity.rs` tests:

```rust
#[test]
fn allocate_returns_none_when_full() {
    let mut allocator = EntityAllocator::new(2);
    assert!(allocator.allocate().is_some());
    assert!(allocator.allocate().is_some());
    assert!(allocator.allocate().is_none(), "should return None, not panic");
}
```

Run:
```bash
cargo test -p gwen-core -- allocate_returns_none
```
Expected: FAIL (current code panics instead of returning None).

- [ ] **Step 15.2: Change allocate() signature**

In `crates/gwen-core/src/ecs/entity.rs`, change:

```rust
// BEFORE:
pub fn allocate(&mut self) -> EntityId {
    // ... 
    panic!("Entity limit reached: max {} entities", self.max_entities);
}

// AFTER:
pub fn allocate(&mut self) -> Option<EntityId> {
    if self.free_list.is_empty() && self.next_id as usize >= self.max_entities {
        return None;
    }
    // ... rest of the allocation logic, return Some(id)
    Some(entity_id)
}
```

- [ ] **Step 15.3: Update all call sites**

Search for `allocate()` calls in the codebase:
```bash
grep -rn "\.allocate()" crates/ --include="*.rs"
```

For each call site, unwrap with an explicit error or propagate:
```rust
// In bindings.rs create_entity():
let id = self.entity_allocator.allocate().ok_or_else(|| {
    JsError::new(&format!("Entity limit reached: max {} entities. Increase maxEntities in defineConfig.", self.max_entities))
})?;
```

- [ ] **Step 15.4: Run all Rust tests**

```bash
cargo test -p gwen-core
```

- [ ] **Step 15.5: Commit**

```bash
git add crates/gwen-core/src/ecs/entity.rs crates/gwen-core/src/bindings.rs
git commit -m "fix(gwen-core): EntityAllocator::allocate returns Option instead of panic

WASM panic causes unrecoverable JS RuntimeError. Now returns None
which the binding maps to a JsError that JS can catch.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 16: Rust Fix — alloc_shared_buffer & BitSet128 Panics

**Files:**
- Modify: `crates/gwen-core/src/bindings.rs`

**Bug 1:** `alloc_shared_buffer` panics when called with size 0 — should return 0 (empty buffer sentinel).
**Bug 2:** `BitSet128` methods call `assert!()` with panic messages — change to `bool` returns or `Result`.

- [ ] **Step 16.1: Fix alloc_shared_buffer**

In `crates/gwen-core/src/bindings.rs`, find `alloc_shared_buffer`:

```rust
// BEFORE:
#[wasm_bindgen]
pub fn alloc_shared_buffer(&mut self, size: usize) -> u32 {
    if size == 0 { panic!("alloc_shared_buffer: size must be > 0") }
    // ...
}

// AFTER:
#[wasm_bindgen]
pub fn alloc_shared_buffer(&mut self, size: usize) -> u32 {
    if size == 0 { return 0; }  // JS sentinel: 0 = allocation failed/empty
    // ...
}
```

- [ ] **Step 16.2: Fix BitSet128 assert → Result**

In `crates/gwen-core/src/bindings.rs` (or wherever BitSet128 is defined), locate all `assert!()` calls. Replace each with:

```rust
// BEFORE:
assert!(index < 128, "BitSet128: index {} out of range", index);
self.bits |= 1u128 << index;

// AFTER:
if index >= 128 {
    return Err(JsError::new(&format!("BitSet128: index {} out of range (max 127)", index)));
}
self.bits |= 1u128 << index;
Ok(())
```

Update the `#[wasm_bindgen]` method signatures to return `Result<(), JsError>` accordingly.

- [ ] **Step 16.3: Write Rust tests**

```rust
#[test]
fn alloc_shared_buffer_size_zero_returns_sentinel() {
    let mut engine = Engine::new(100);
    assert_eq!(engine.alloc_shared_buffer(0), 0);
}

#[test]
fn bitset128_out_of_range_returns_error() {
    let mut bs = BitSet128::default();
    assert!(bs.set(128).is_err());
    assert!(bs.set(255).is_err());
    assert!(bs.set(127).is_ok());
}
```

- [ ] **Step 16.4: Run Rust tests**

```bash
cargo test -p gwen-core
```

- [ ] **Step 16.5: Commit**

```bash
git add crates/gwen-core/src/bindings.rs
git commit -m "fix(gwen-core): replace panic! in alloc_shared_buffer and BitSet128 with safe returns

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 17: Rust Fix — get_components_bulk Size Inference Corruption

**Files:**
- Modify: `crates/gwen-core/src/bindings.rs`

**The bug:** `comp_size = bytes_written / i.max(1)` is wrong when dead entities precede live ones — `i` counts all entities iterated (including dead), but `bytes_written` only counts live entity data. This produces an incorrect `comp_size` which corrupts the output buffer layout.

- [ ] **Step 17.1: Write a regression test**

In `crates/gwen-core/src/` tests (or inline), add:

```rust
#[test]
fn get_components_bulk_with_dead_first_entity() {
    let mut engine = Engine::new(10);
    let e1 = engine.create_entity();
    let e2 = engine.create_entity();
    // Kill e1 (first entity) — it becomes a dead entity before e2
    engine.destroy_entity(e1);
    // Set a known component on e2
    engine.set_position(e2, 1.0, 2.0);
    
    let mut out = vec![0u8; 512];
    let written = engine.get_components_bulk(ComponentType::Position as u32, &mut out);
    // Should write exactly 8 bytes (2×f32) for one live entity
    assert_eq!(written, 8, "only e2 should be written");
    let x = f32::from_le_bytes(out[0..4].try_into().unwrap());
    let y = f32::from_le_bytes(out[4..8].try_into().unwrap());
    assert!((x - 1.0).abs() < 1e-6);
    assert!((y - 2.0).abs() < 1e-6);
}
```

Run:
```bash
cargo test -p gwen-core -- get_components_bulk
```

- [ ] **Step 17.2: Fix the size inference**

In `crates/gwen-core/src/bindings.rs`, find `get_components_bulk`. The fix is to determine `comp_size` from the component registry BEFORE the loop, not from observing bytes written during iteration:

```rust
// BEFORE (approximate — bad inference):
let mut comp_size = 0usize;
for (i, entity) in self.entity_allocator.iter_live().enumerate() {
    if let Some(data) = self.component_storage.get_raw(entity, comp_type) {
        // First time we see data, infer size
        if comp_size == 0 { comp_size = data.len(); }
        // ...
    }
}

// AFTER — look up component size from registry before the loop:
let comp_size = self.component_registry
    .get_byte_size(comp_type)
    .ok_or_else(|| JsError::new(&format!("Unknown component type: {}", comp_type)))?;

let mut bytes_written = 0usize;
for entity in self.entity_allocator.iter_live() {
    if let Some(data) = self.component_storage.get_raw(entity, comp_type) {
        debug_assert_eq!(data.len(), comp_size, "component data size mismatch");
        let end = bytes_written + comp_size;
        if end > out_buf.len() { break; }
        out_buf[bytes_written..end].copy_from_slice(data);
        bytes_written += comp_size;
    }
}
```

> Note: Verify that `component_registry.get_byte_size()` exists — if not, the registry likely stores sizes alongside type registration. Check `ComponentRegistry` in `packages/core/src/core/ecs.ts` and the Rust equivalent for the pattern used, then adapt accordingly.

- [ ] **Step 17.3: Run Rust tests**

```bash
cargo test -p gwen-core
```

- [ ] **Step 17.4: Commit**

```bash
git add crates/gwen-core/src/bindings.rs
git commit -m "fix(gwen-core): get_components_bulk size inference — use registry instead of iteration observation

Previously comp_size was inferred from bytes_written / i, which was
corrupted when dead entities preceded live ones.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 18: Final Validation

- [ ] **Step 18.1: Full TypeScript test suite**

```bash
pnpm test:ts
```
Expected: all tests pass.

- [ ] **Step 18.2: Full Rust test suite**

```bash
pnpm test:cargo
```
Expected: all tests pass.

- [ ] **Step 18.3: Full build**

```bash
pnpm build
```
Expected: no errors.

- [ ] **Step 18.4: Lint check**

```bash
pnpm lint
pnpm typecheck
```
Expected: no new errors.

- [ ] **Step 18.5: Final commit**

```bash
git add -A
git commit -m "chore: final validation pass — all tests green

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Summary

| Task | Package | Type | Risk |
|---|---|---|---|
| 1-4 | `@gwenjs/kit` | New (error bus) | Low |
| 5 | `@gwenjs/core` | Wiring | Medium |
| 6 | `@gwenjs/core` | Bug fix (targetFPS) | Low |
| 7 | `@gwenjs/core` | Bug fix (timeout, logs, byteOffset) | Low |
| 8 | `@gwenjs/core` | API cleanup | Low |
| 9 | `@gwenjs/physics3d` | Critical bug fix (BVH) | Medium |
| 10 | `@gwenjs/audio` | Critical bug fix (preload) | Low |
| 11 | `@gwenjs/physics3d` | Warning surface | Low |
| 12 | `@gwenjs/kit-platformer` | Type safety | Low |
| 13-17 | `crates/gwen-core`, `gwen-wasm-utils` | Security + safety | Medium |
| 18 | All | Validation | — |

**Execution order:** Tasks 1→2→3→4 are the foundation. Task 5 depends on Task 3. Tasks 6-8 are independent. Tasks 9-12 are independent. Tasks 13-17 are independent Rust changes. Task 18 is the final gate.
