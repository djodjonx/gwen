# Plan DEBUG-01 — Logger, Error Isolation & Debug Mode

## Objective

Implement RFC-11 in three sequential phases:
1. **GwenLogger** — structured, scoped logging with a replaceable sink
2. **Error isolation** — per-plugin try/catch in `_runFrame`, WASM panic detection, all error codes used
3. **debug mode** — `debug: true` in engine config activates logging, sentinel checks, phase warnings

All JSDoc in **English**. All tests in **English**. lint + build + tests must pass after each phase.

**Packages touched:** `@gwenjs/core`, `@gwenjs/kit` (minor), `@gwenjs/debug` (minor)

---

## Prerequisites

Read before starting:
- `packages/core/src/engine/gwen-engine.ts` — engine class, `_runFrame`, `CoreErrorCodes`, `EngineErrorBus`
- `packages/core/src/engine/wasm-bridge.ts` — `loadWasmGlue`, `initWasm`
- `packages/core/src/wasm/shared-memory.ts` — `checkSentinels`
- `packages/kit/src/define-plugin.ts` — `GwenPlugin` interface, `definePlugin`
- `packages/debug/src/plugin/index.ts` — existing debug plugin
- `specs/enhancements/RFC-11-debug-error-system.md` — full architecture reference

---

## Compatibility notes — read carefully before coding

The following divergences between this plan and the current codebase must be respected:

### 1. `CoreErrorCodes` — do NOT rename existing keys

Current state:
```typescript
export const CoreErrorCodes = {
  FRAME_LOOP_ERROR:   'CORE:FRAME_LOOP_ERROR',   // actively used
  PLUGIN_SETUP_ERROR: 'CORE:PLUGIN_SETUP_ERROR', // defined, unused
  WASM_LOAD_ERROR:    'CORE:WASM_LOAD_ERROR',    // defined, unused
  WASM_TIMEOUT:       'CORE:WASM_TIMEOUT',       // used in wasm-bridge.ts
  WASM_PANIC:         'CORE:WASM_PANIC',         // defined, unused
} as const;
```

- **Do NOT rename** `WASM_PANIC` → `WASM_PANIC_ERROR`. Use `WASM_PANIC` as-is.
- **Do NOT rename** or remove `WASM_TIMEOUT` — it is used in `wasm-bridge.ts` line ~1095.
- **Only add** `PLUGIN_RUNTIME_ERROR: 'CORE:PLUGIN_RUNTIME_ERROR'` (new key).
- All references in this plan use `WASM_PANIC` consistently.

### 2. Two separate config interfaces — `GwenEngineOptions` vs `EngineConfig`

- `GwenEngineOptions` (`gwen-engine.ts` line 219) — low-level constructor options passed to `new Engine()` and `createEngine()`. **Does NOT have `debug`** — add it here.
- `EngineConfig` (`types/engine-config.ts` line 25) — app-level config used by `defineConfig()`. **Already has `debug?: boolean`** — do not touch it.

### 3. `GwenEngine` interface also needs `debug` and `logger`

`GwenEngine` (the public interface, line ~404) and `Engine` (the class implementation, line ~618)
are separate. Both must be updated:
- Add `readonly debug: boolean` to the `GwenEngine` interface
- Add `readonly logger: GwenLogger` to the `GwenEngine` interface
- Implement both in the `Engine` class constructor

### 4. Sentinel auto-check requires engine wiring

`SharedMemoryManager.checkSentinels()` is internal to the WASM bridge. The engine class
(`Engine`) does not currently hold a reference to it.

For Phase 3.1.B (sentinel auto-check in debug mode), first wire the reference:
- Add a private `_sharedMemory: SharedMemoryManager | null = null` field to the `Engine` class
- Assign it when `SharedMemoryManager` is created (inside `createEngine` or `initWasm` callback)
- Then use it in `_runFrame` as described in Step 3.1.B

If wiring is non-trivial after investigation, **skip sentinel auto-check** and leave a
`// TODO: auto-sentinel check requires _sharedMemory wiring` comment. Do not block the rest
of the plan on this.

---

## Phase 1 — GwenLogger

### Step 1.1 — Create `packages/core/src/logger/types.ts`

```typescript
/**
 * Log severity levels in ascending order.
 * - `debug` / `info` : only active when `engine.debug === true`
 * - `warn` / `error` : always active regardless of debug mode
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * A single structured log entry produced by {@link GwenLogger}.
 */
export interface LogEntry {
  /** Severity level. */
  level: LogLevel;
  /** Source identifier — typically the plugin name, e.g. `'@gwenjs/physics2d'`. */
  source: string;
  /** Human-readable message. */
  message: string;
  /** Optional key-value context data attached to this entry. */
  data?: Record<string, unknown>;
  /**
   * Engine frame index at the time of emission.
   * `undefined` if emitted outside the frame loop (e.g. during setup).
   */
  frame?: number;
  /** Timestamp from `performance.now()` at the moment of emission. */
  ts: number;
}

/**
 * Structured logger provided by the GWEN engine.
 *
 * Obtain a scoped child logger in any plugin via `engine.logger.child(name)`.
 * Use the child logger instead of `console.*` so output can be redirected,
 * filtered, or forwarded to an external telemetry sink.
 *
 * @example
 * ```typescript
 * setup(engine: GwenEngine) {
 *   const log = engine.logger.child('@gwenjs/my-plugin')
 *   log.debug('initialized', { config })
 * }
 * ```
 */
export interface GwenLogger {
  debug(message: string, data?: Record<string, unknown>): void;
  info (message: string, data?: Record<string, unknown>): void;
  warn (message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;

  /**
   * Create a child logger bound to `source`.
   * All entries emitted by the child carry the given source name.
   *
   * @param source - Identifier for the emitting module, e.g. `'@gwenjs/renderer'`.
   */
  child(source: string): GwenLogger;

  /**
   * Replace the underlying output sink.
   *
   * The default sink writes to `console` when debug mode is active and is a
   * no-op for `debug`/`info` levels in production. Use this to forward logs
   * to Sentry, Datadog, a ring buffer, or a test spy.
   *
   * @param sink - Callback receiving every {@link LogEntry} that passes the level filter.
   */
  setSink(sink: (entry: LogEntry) => void): void;
}
```

### Step 1.2 — Create `packages/core/src/logger/console-logger.ts`

Implement `createLogger(source: string, debugMode: boolean): GwenLogger`.

Rules:
- `debugMode === false`: `debug` and `info` calls are silent (no-op sink by default). `warn` and `error` always emit.
- `debugMode === true`: all levels emit.
- Default sink formats entries as: `[source] message  key=value key=value  frame=N`
- `child(name)` returns a new logger sharing the same sink but with `source = name`.
- `setSink` replaces the sink for **this logger and all its children** (shared ref).
- `frame` is populated if a `getFrame` callback is injected at creation: `createLogger(source, debugMode, getFrame?)`.

### Step 1.3 — Create `packages/core/src/logger/index.ts`

Barrel re-export: `GwenLogger`, `LogLevel`, `LogEntry`, `createLogger`.

### Step 1.4 — Wire logger into GwenEngine

**File:** `packages/core/src/engine/gwen-engine.ts`

**A) Add `debug` to `GwenEngineOptions`** (does not exist yet):
```typescript
/**
 * Enable debug mode for the engine and all plugins.
 * When `true`: activates verbose logging, per-frame sentinel checks,
 * phase timing warnings, and plugin setup logs.
 * @default false
 */
debug?: boolean;
```

**B) Add `debug` and `logger` to the `GwenEngine` PUBLIC INTERFACE** (line ~404):
```typescript
export interface GwenEngine {
  // ... existing members ...

  /** Whether debug mode is active. Reflects the `debug` option passed to `createEngine()`. */
  readonly debug: boolean;

  /**
   * Structured logger for this engine instance.
   * Call `engine.logger.child('@my/plugin')` to get a scoped child logger.
   * The logger is also injectable: `engine.inject('logger')`.
   */
  readonly logger: GwenLogger;
}
```

**C) Add `logger` to `GwenProvides`** so it is injectable via `engine.inject('logger')`
and accessible in composables via `useService('logger')`:
```typescript
export interface GwenProvides {
  errors: EngineErrorBus;  // existing
  logger: GwenLogger;      // new
}
```

**D) Implement in the `Engine` CLASS constructor:**
```typescript
this.debug  = opts.debug ?? false;
this.logger = createLogger('gwen:core', this.debug, () => this._frameCountOwn);
this.provide('logger', this.logger);  // make injectable
```

**E) Export new types from `packages/core/src/index.ts`:**

Add to the existing named export block from `./engine/gwen-engine`:
```typescript
export type {
  // ... existing exports ...
  GwenLogger,
  LogLevel,
  LogEntry,
  PluginErrorContext,   // added in Phase 2
} from './engine/gwen-engine';
```

Also re-export from the logger module barrel:
```typescript
export { createLogger } from './logger/index.js';
export type { GwenLogger, LogLevel, LogEntry } from './logger/index.js';
```

### Step 1.5 — Tests

**File:** `packages/core/tests/logger.test.ts`

Write the following test cases (descriptions in English):

```
describe('GwenLogger')
  describe('sink routing')
    it('does not call the sink for debug/info when debug mode is off')
    it('calls the sink for warn/error regardless of debug mode')
    it('calls the sink for all levels when debug mode is on')

  describe('child()')
    it('child logger uses the provided source name')
    it('child shares the same sink as the parent')
    it('setSink on a child updates the shared sink')

  describe('setSink()')
    it('replaces the sink — subsequent entries go to the new sink')
    it('sink receives correct LogEntry shape (level, source, message, ts)')
    it('frame is included when getFrame callback is provided')

  describe('engine.logger integration')
    it('engine.logger is available after createEngine()')
    it('engine.logger.child() produces a scoped logger')
    it('debug mode off: engine.logger.debug() is silent')
    it('debug mode on: engine.logger.debug() reaches the sink')
```

### Step 1.6 — Verification (Phase 1)

```bash
pnpm --filter @gwenjs/core lint
pnpm --filter @gwenjs/core build
pnpm --filter @gwenjs/core test
```

All must pass with zero errors before moving to Phase 2.

---

## Phase 2 — Error isolation, attribution & all error codes

### Step 2.1 — Add `PLUGIN_RUNTIME_ERROR` to `CoreErrorCodes`

**File:** `packages/core/src/engine/gwen-engine.ts`

Add **only** the new key. Leave all existing keys untouched:

```typescript
export const CoreErrorCodes = {
  FRAME_LOOP_ERROR:     'CORE:FRAME_LOOP_ERROR',     // keep — top-level frame catch
  PLUGIN_SETUP_ERROR:   'CORE:PLUGIN_SETUP_ERROR',   // now used (was unused)
  PLUGIN_RUNTIME_ERROR: 'CORE:PLUGIN_RUNTIME_ERROR', // NEW — per-phase plugin errors
  WASM_LOAD_ERROR:      'CORE:WASM_LOAD_ERROR',      // now used (was unused)
  WASM_TIMEOUT:         'CORE:WASM_TIMEOUT',         // keep as-is — already used
  WASM_PANIC:           'CORE:WASM_PANIC',           // now used (was unused) — keep name
} as const;
```

### Step 2.2 — Add `onError` to `GwenPlugin`

**File:** `packages/core/src/engine/gwen-engine.ts` (GwenPlugin interface)

```typescript
/**
 * Context passed to a plugin's {@link GwenPlugin.onError} hook.
 */
export interface PluginErrorContext {
  /** Frame loop phase in which the error occurred. */
  phase: 'setup' | 'onBeforeUpdate' | 'onUpdate' | 'onAfterUpdate' | 'onRender' | 'teardown';
  /** Engine frame index at the time of the error. */
  frame: number;
  /**
   * Mark this error as handled.
   * When called, the error is **not** forwarded to the engine error bus.
   * The frame continues normally.
   */
  recover(): void;
}

// In GwenPlugin interface — add optional hook:
/**
 * Called when an error is thrown inside this plugin's lifecycle hooks.
 * Implement to handle or recover from plugin-specific errors gracefully.
 *
 * Call `context.recover()` to suppress forwarding to the engine error bus
 * (e.g. to silently handle a recoverable canvas context loss).
 *
 * @example
 * ```typescript
 * onError(error, context) {
 *   if (context.phase === 'onRender' && error instanceof DOMException) {
 *     context.recover() // canvas context lost — handled
 *   }
 * }
 * ```
 */
onError?(error: unknown, context: PluginErrorContext): void;
```

### Step 2.3 — Add `_reportPluginError` to GwenEngine

Private method that:
1. Calls `plugin.onError?.(error, ctx)` if defined, passing a `recover()` callback
2. If `recover()` was NOT called: emits to `this._errorBus` with `PLUGIN_RUNTIME_ERROR` + logs via `this.logger`
3. Never re-throws — the frame continues after a plugin error

```typescript
private _reportPluginError(
  plugin: GwenPlugin,
  phase: PluginErrorContext['phase'],
  error: unknown,
): void {
  let recovered = false;
  const context: PluginErrorContext = {
    phase,
    frame: this._frameCountOwn,
    recover: () => { recovered = true; },
  };

  try {
    plugin.onError?.(error, context);
  } catch {
    // onError itself threw — ignore to avoid infinite loops
  }

  if (!recovered) {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`[${plugin.name}] ${phase} threw: ${message}`, {
      phase,
      frame: this._frameCountOwn,
    });
    this._errorBus?.emit({
      level: 'error',
      code: CoreErrorCodes.PLUGIN_RUNTIME_ERROR,
      message: `[${plugin.name}] ${phase} threw: ${message}`,
      source: plugin.name,
      error,
      context: { phase, frame: this._frameCountOwn },
    });
  }
}
```

### Step 2.4 — Wrap plugin lifecycle phases in `_runFrame`

**File:** `packages/core/src/engine/gwen-engine.ts` — method `_runFrame`

Wrap each per-plugin call. Example for Phase 2 (onBeforeUpdate):

```typescript
// Phase 2 — onBeforeUpdate (all plugins, registration order)
for (const plugin of this._plugins) {
  try {
    plugin.onBeforeUpdate?.(dt);
  } catch (err) {
    this._reportPluginError(plugin, 'onBeforeUpdate', err);
  }
}
```

Apply the same pattern to: `onUpdate`, `onAfterUpdate`, `onRender`.

Do **not** wrap Phase 1 (`engine:tick`) or Phase 8 (`engine:afterTick`) — those are hook-level
errors that should propagate as `FRAME_LOOP_ERROR` (existing behavior).

### Step 2.5 — Wrap plugin setup in `engine.use()`

```typescript
async use(plugin: GwenPlugin): Promise<void> {
  // ...existing dedup check...
  try {
    const result = engineContext.call(this, () => plugin.setup(engineWithScopedHooks));
    if (result instanceof Promise) await result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    this._errorBus?.emit({
      level: 'fatal',
      code: CoreErrorCodes.PLUGIN_SETUP_ERROR,
      message: `[${plugin.name}] setup failed: ${message}`,
      source: plugin.name,
      error: err,
    });
    throw err; // setup failure is fatal — re-throw
  }
  // ...rest of use()...
}
```

### Step 2.6 — Use `WASM_PANIC` in Phase 3

Wrap physics steps in `_runFrame` Phase 3:

```typescript
// Phase 3 — built-in physics step
try {
  if (this.wasmBridge.physics2d.enabled) this.wasmBridge.physics2d.step(dt);
  if (this.wasmBridge.physics3d.enabled) this.wasmBridge.physics3d.step(dt);
} catch (err) {
  const code = err instanceof WebAssembly.RuntimeError
    ? CoreErrorCodes.WASM_PANIC
    : CoreErrorCodes.FRAME_LOOP_ERROR;
  this._errorBus?.emit({
    level: 'fatal',
    code,
    message: `WASM step failed: ${err instanceof Error ? err.message : String(err)}`,
    source: 'gwen_core.wasm',
    error: err,
    context: { frame: this._frameCountOwn },
  });
  // Do not re-throw — let the frame complete so afterTick fires
}
```

Apply the same pattern to Phase 4 (community WASM modules), including the module name
in `source`:

```typescript
for (const [name, entry] of this._wasmModules.entries()) {
  try {
    entry.step?.(entry.handle, dt);
  } catch (err) {
    const code = err instanceof WebAssembly.RuntimeError
      ? CoreErrorCodes.WASM_PANIC
      : CoreErrorCodes.FRAME_LOOP_ERROR;
    this._errorBus?.emit({
      level: 'error',
      code,
      source: `wasm:${name}`,
      error: err,
      context: { frame: this._frameCountOwn },
    });
  }
}
```

### Step 2.7 — Add `plugin:error` hook to `GwenRuntimeHooks`

**File:** `packages/core/src/engine/runtime-hooks.ts`

Add the new hook so any observer can react to plugin errors (analytics, recovery, etc.):

```typescript
export interface GwenRuntimeHooks {
  // ... existing hooks ...
  /**
   * Fired when a plugin lifecycle hook throws and the error is not recovered
   * via `context.recover()`. Payload includes the plugin name, phase, and
   * the original error.
   *
   * @example
   * ```typescript
   * engine.hooks.hook('plugin:error', ({ pluginName, phase, error }) => {
   *   analytics.track('plugin_crash', { pluginName, phase })
   * })
   * ```
   */
  'plugin:error': (payload: {
    pluginName: string;
    phase: PluginErrorContext['phase'];
    error: unknown;
    frame: number;
  }) => void;
}
```

Fire it inside `_reportPluginError` **after** error bus emission (when not recovered):
```typescript
await this.hooks.callHook('plugin:error', {
  pluginName: plugin.name,
  phase,
  error,
  frame: this._frameCountOwn,
});
```

Note: `callHook` is async — `_reportPluginError` must become `async` accordingly.

---

### Step 2.8 — Update `definePlugin` JSDoc in `@gwenjs/kit`

**File:** `packages/kit/src/define-plugin.ts`

No code change needed — `onError` is inferred from `GwenPlugin` in core. Add it to the
JSDoc example to ensure plugin authors discover it:

```typescript
/**
 * @example with error handling
 * ```typescript
 * export const MyPlugin = definePlugin(() => ({
 *   name: '@my/plugin',
 *   setup(engine) { ... },
 *   onError(error, context) {
 *     if (context.phase === 'onRender') {
 *       context.recover() // suppress error bus — handled locally
 *     }
 *   },
 * }))
 * ```
 */
```

---

### Step 2.9 — Use WASM_LOAD_ERROR in `initWasm`

**File:** `packages/core/src/engine/wasm-bridge.ts`

The existing `initWasm` throws generic errors. Tag them with the code:

```typescript
} catch (err) {
  const tagged = err instanceof Error ? err : new Error(String(err));
  (tagged as Error & { code?: string }).code = 'CORE:WASM_LOAD_ERROR';
  throw tagged;
}
```

### Step 2.10 — Tests

**File:** `packages/core/tests/plugin-error-isolation.test.ts`

```
describe('plugin error isolation')

  describe('_reportPluginError / onError hook')
    it('calls plugin.onError when a lifecycle hook throws')
    it('does not emit to error bus when plugin calls recover()')
    it('emits PLUGIN_RUNTIME_ERROR to error bus when recover() is not called')
    it('includes phase and frame in the error context')
    it('continues the frame even if a plugin throws in onBeforeUpdate')
    it('continues the frame even if a plugin throws in onUpdate')
    it('continues the frame even if a plugin throws in onRender')
    it('does not crash if onError itself throws')

  describe('plugin setup error')
    it('emits PLUGIN_SETUP_ERROR to error bus when setup throws')
    it('re-throws after emitting — setup failure is still fatal')
    it('includes plugin name in the error message')

  describe('WASM error codes')
    it('emits WASM_PANIC when physics step throws WebAssembly.RuntimeError')
    it('emits FRAME_LOOP_ERROR when physics step throws a non-WASM error')
    it('emits with source "wasm:<name>" for community WASM module errors')

  describe('plugin:error hook')
    it('fires plugin:error hook when a plugin throws and does not recover')
    it('does not fire plugin:error hook when plugin calls recover()')
    it('hook payload contains pluginName, phase, error, frame')

  describe('logger injectable')
    it('engine.inject("logger") returns the engine logger')
    it('useService("logger") resolves to the engine logger inside a system')
    it('child logger from inject has correct source')

  describe('multiple plugins — isolation')
    it('second plugin still runs when first plugin throws in onBeforeUpdate')
    it('all three phases (onBeforeUpdate, onUpdate, onRender) are independent')
```

### Step 2.9 — Verification (Phase 2)

```bash
pnpm --filter @gwenjs/core lint
pnpm --filter @gwenjs/core build
pnpm --filter @gwenjs/core test
```

---

## Phase 3 — debug mode activation

### Step 3.1 — Activate debug behaviors in the engine

**File:** `packages/core/src/engine/gwen-engine.ts`

When `this.debug === true`:

**A) Plugin setup logging** — in `engine.use()`, after successful setup:
```typescript
if (this.debug) {
  this.logger.debug(`plugin registered: ${plugin.name}`);
}
```

**B) Sentinel auto-check in `_runFrame`** — after Phase 4 (WASM step), if
`this._sharedMemory` exists:
```typescript
if (this.debug && this._sharedMemory) {
  try {
    this._sharedMemory.checkSentinels(this._wasmBridge);
  } catch (err) {
    this.logger.error('WASM memory sentinel violation', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
```

**C) Over-budget phase warning** — at the end of `_runFrame`, after updating
`_lastPhaseMs`, if a phase exceeds 50% of the frame budget:
```typescript
if (this.debug) {
  const budget = 1000 / this.targetFPS;
  for (const [phase, ms] of Object.entries(this._lastPhaseMs)) {
    if (phase === 'total') continue;
    if ((ms as number) > budget * 0.5) {
      this.logger.warn(`phase "${phase}" exceeded 50% of frame budget`, {
        phase,
        ms: (ms as number).toFixed(2),
        budgetMs: budget.toFixed(2),
        frame: this._frameCountOwn,
      });
    }
  }
}
```

### Step 3.2 — Update `@gwenjs/debug` plugin to use `engine.logger`

**File:** `packages/debug/src/plugin/index.ts`

Replace direct `console.warn` / `console.error` calls with:
```typescript
setup(engine: GwenEngine) {
  const log = engine.logger.child('@gwenjs/debug')
  // use log.warn / log.info etc. throughout
}
```

### Step 3.3 — Tests

**File:** `packages/core/tests/debug-mode.test.ts`

```
describe('debug mode')

  describe('engine.debug flag')
    it('engine.debug is false by default')
    it('engine.debug is true when createEngine({ debug: true })')
    it('engine.debug is accessible on the engine instance')

  describe('logger activation')
    it('debug/info are silent when debug mode is off')
    it('debug/info reach the sink when debug mode is on')
    it('warn/error always reach the sink regardless of debug mode')

  describe('plugin setup logging')
    it('logs "plugin registered" for each plugin when debug mode is on')
    it('does not log plugin registration when debug mode is off')

  describe('over-budget phase warning')
    it('emits a warn log when a phase exceeds 50% of the frame budget')
    it('does not emit a warning when all phases are within budget')
    it('does not emit warnings when debug mode is off')
```

### Step 3.4 — Verification (Phase 3)

```bash
pnpm --filter @gwenjs/core lint
pnpm --filter @gwenjs/core build
pnpm --filter @gwenjs/core test
pnpm --filter @gwenjs/debug lint
pnpm --filter @gwenjs/debug build
pnpm --filter @gwenjs/debug test
```

---

## Documentation

### Internal doc

**File:** `internals-docs/debug-error-system.md` (new)

Write an internal reference covering:
1. **Architecture overview** — three pillars: GwenLogger, error isolation, debug mode
2. **GwenLogger internals** — sink sharing between parent/child, level filtering, frame injection
3. **Error isolation design** — why per-plugin try/catch, not frame-level; `_reportPluginError` flow
4. **`onError` contract** — how `recover()` prevents error bus emission; what happens if `onError` itself throws
5. **debug mode behaviors** — full list of what activates at `debug: true`
6. **Adding a new error code** — step-by-step for contributors
7. **Custom telemetry** — how to use `setSink()` to forward to Sentry/Datadog

### VitePress doc — update existing `docs/guide/error-bus.md`

Add a new section **"Engine Logger"** after the existing Quick Start:

```markdown
## Engine Logger

Every engine instance exposes a structured logger accessible in any plugin:

```typescript
setup(engine: GwenEngine) {
  const log = engine.logger.child('@my/plugin')
  log.debug('initialized', { config })
  log.warn('canvas not found')
}
```

The logger is a no-op for `debug` and `info` levels by default. Enable verbose
output by passing `debug: true` to `createEngine`:

```typescript
const engine = createEngine({ debug: true })
```

### Redirecting logs to an external service

```typescript
engine.logger.setSink((entry) => {
  if (entry.level === 'error') {
    Sentry.captureMessage(entry.message, { extra: entry.data })
  }
})
```
```

Add a new section **"Plugin Error Handling"**:

```markdown
## Plugin Error Handling

By default, an error thrown inside a plugin's lifecycle hook is caught, reported
to the error bus, and the frame continues. Other plugins are unaffected.

To handle an error inside your own plugin:

```typescript
definePlugin(() => ({
  name: '@my/renderer',

  onError(error, context) {
    if (context.phase === 'onRender' && error instanceof DOMException) {
      context.recover() // mark as handled — error bus is not notified
      reinitCanvas()
    }
  },
}))
```

`context.recover()` suppresses error bus emission. If you don't call it, the
error is forwarded with code `CORE:PLUGIN_RUNTIME_ERROR` and the plugin name
as source.
```

### VitePress doc — new `docs/guide/debug-mode.md`

Create this file covering:
1. Enabling debug mode (`createEngine({ debug: true })`)
2. What activates automatically (logging, sentinel checks, over-budget warnings)
3. Using `engine.logger` and `engine.logger.child()`
4. Redirecting log output (`setSink`)
5. The `onError` plugin hook with a recovery example
6. Combining with `@gwenjs/debug` overlay (`DebugPlugin({ overlay: { showPhases: true } })`)

---

## Final verification checklist

Run in this exact order:

```bash
# Core
pnpm --filter @gwenjs/core lint
pnpm --filter @gwenjs/core build
pnpm --filter @gwenjs/core test

# Kit (check no breakage from GwenPlugin interface extension)
pnpm --filter @gwenjs/kit lint
pnpm --filter @gwenjs/kit build
pnpm --filter @gwenjs/kit test

# Debug plugin
pnpm --filter @gwenjs/debug lint
pnpm --filter @gwenjs/debug build
pnpm --filter @gwenjs/debug test

# Full workspace build (catches cross-package type issues)
pnpm build
```

All commands must exit with code 0. No skipped tests.

---

## New files summary

| File | Package | Purpose |
|---|---|---|
| `src/logger/types.ts` | core | `GwenLogger`, `LogLevel`, `LogEntry` interfaces |
| `src/logger/console-logger.ts` | core | Default console implementation |
| `src/logger/index.ts` | core | Barrel re-export |
| `tests/logger.test.ts` | core | GwenLogger unit tests |
| `tests/plugin-error-isolation.test.ts` | core | Error isolation unit tests |
| `tests/debug-mode.test.ts` | core | debug mode behavior tests |
| `internals-docs/debug-error-system.md` | — | Internal architecture reference |
| `docs/guide/debug-mode.md` | — | VitePress user guide |

## Modified files summary

| File | Package | Change |
|---|---|---|
| `src/engine/gwen-engine.ts` | core | `engine.debug`, `engine.logger`, `GwenEngine` interface, `GwenProvides.logger`, `GwenEngineOptions.debug`, `CoreErrorCodes`, `onError` hook, `PluginErrorContext`, `_reportPluginError`, phase wrapping, debug behaviors |
| `src/engine/runtime-hooks.ts` | core | Add `plugin:error` hook to `GwenRuntimeHooks` |
| `src/index.ts` | core | Export `GwenLogger`, `LogLevel`, `LogEntry`, `PluginErrorContext`, `createLogger` |
| `src/define-plugin.ts` | kit | JSDoc `onError` example added |
| `src/plugin/index.ts` | debug | Use `engine.logger` instead of direct console |
| `docs/guide/error-bus.md` | — | Add "Engine Logger" + "Plugin Error Handling" sections |
