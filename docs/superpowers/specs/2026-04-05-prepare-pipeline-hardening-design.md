# RFC-011: Prepare Pipeline Hardening

**Date:** 2026-04-05  
**Status:** Approved  
**Branch target:** `gwen-v2-alpha`

---

## Problem

`gwen prepare` silently generates empty `.gwen/` output (no auto-imports, no type templates) even
when the project's `gwen.config.ts` lists modules like `@gwenjs/physics2d`, `@gwenjs/input`, etc.

The same root cause makes `gwen info` display `modules: []` regardless of what's in the config.
All module Vite-config extensions are also skipped, meaning module-contributed Vite plugins and
resolve aliases never apply.

---

## Root Cause: CJS/ESM Interop Double-wrapping

### How the CLI loads TypeScript

`packages/cli/bin.js` registers jiti as a Node.js module loader hook globally via
`register(jitiHooksUrl, import.meta.url)` before any other code runs. This lets all subsequent
`import()` calls resolve `.ts` files.

### What goes wrong with c12

`resolveGwenConfig` (in `@gwenjs/app`) and `loadGwenConfig` (in the CLI) both use c12's
`loadConfig` to read `gwen.config.ts`. c12 internally does:

```js
// c12 source (4.0.0-beta.3)
const _resolveModule = options.resolveModule || ((mod) => mod.default || mod);
res.config = await import(res.configFile).then(_resolveModule, /* jiti fallback */);
```

Because the jiti hook is registered, `await import('gwen.config.ts')` **succeeds** — jiti
transpiles the TypeScript to CJS on the fly:

```js
// jiti CJS output for: export default defineConfig({ modules: [...] })
Object.defineProperty(exports, '__esModule', { value: true });
exports.default = { modules: ['@gwenjs/physics2d', ...] };
```

Node.js wraps this CJS `exports` object as an ESM namespace:

```
{ default: { __esModule: true, default: { modules: [...] } } }
```

c12's `_resolveModule` returns `mod.default`:

```
{ __esModule: true, default: { modules: [...] } }
```

The final `config` that callers receive is effectively `{ default: { modules: [...] } }` (the
`__esModule` flag is non-enumerable and invisible to JSON.stringify). So `config.modules` is
`undefined`, and all module setup is silently skipped.

### Why tests did not catch this

The existing integration tests write bare `export default { ... }` configs without imports. These
configs are simpler CJS objects that don't trigger the double-wrapping pattern. The bug only
manifests when the config imports from another package (e.g., `import { defineConfig } from
'@gwenjs/app'`).

---

## Design

### 1. Shared Config Loader (`packages/app/src/config-loader.ts`)

A new internal module provides one function used by both config paths:

```ts
export interface RawGwenConfig {
  config: GwenUserConfig;
  configFile: string;
}

export async function loadRawGwenConfig(cwd: string): Promise<RawGwenConfig>
```

It calls c12's `loadConfig` with a custom `resolveModule` that correctly handles all interop cases:

```ts
resolveModule: (mod: unknown) => {
  // Handle CJS-to-ESM double-wrapping from jiti register hook:
  // jiti transforms `export default X` → CJS `exports.default = X`
  // Node.js wraps CJS exports as ESM: { default: { __esModule: true, default: X } }
  // c12's default _resolveModule then returns { __esModule: true, default: X }
  // We need to unwrap one more level.
  const first = (mod as Record<string, unknown>)?.default ?? mod;
  const second = (first as Record<string, unknown>)?.default ?? first;
  return second as GwenUserConfig;
}
```

This handles three cases:
- No wrapping (plain CJS module): returns the module itself
- Single wrapping (direct jiti or c12's own jiti): returns `mod.default`
- Double wrapping (jiti register hook + CJS interop): returns `mod.default.default`

Errors thrown by c12 or jiti are caught and re-thrown as a `GwenConfigLoadError` that includes
the `configFile` path and original cause, enabling clear error messages in the CLI.

### 2. Update `resolveGwenConfig` (`packages/app/src/config.ts`)

Replace the inline `loadConfig` call with `loadRawGwenConfig`:

```ts
export async function resolveGwenConfig(rootDir?: string): Promise<ResolvedGwenConfig> {
  const { config: userConfig } = await loadRawGwenConfig(rootDir ?? process.cwd());
  return defu(
    { ...userConfig, modules: userConfig.modules ?? [], engine: userConfig.engine ?? {} },
    { modules: [], engine: DEFAULT_ENGINE },
  ) as ResolvedGwenConfig;
}
```

### 3. Update `loadGwenConfig` (`packages/cli/src/core/config.ts`)

Replace the inline `loadConfig` call with `loadRawGwenConfig`:

```ts
export async function loadGwenConfig(options: LoadConfigOptions | string): Promise<LoadConfigResult> {
  const cwd = typeof options === 'string' ? options : options.cwd;
  const { config: rawConfig, configFile } = await loadRawGwenConfig(cwd);
  assertModuleFirstInput(rawConfig);
  const resolved = resolveConfig(rawConfig);
  resolved.rootDir = cwd;
  resolved.dev = process.env.NODE_ENV === 'development';
  return { config: resolved, configPath: configFile };
}
```

Note: `assertModuleFirstInput` from `@gwenjs/schema` validates modules array presence. With the
interop fix, it will now correctly see non-empty modules arrays.

### 4. Hard-fail Module Errors in `setupModules` (`packages/app/src/app.ts`)

Currently a failing `loadModule` throws and the outer try/catch in `prepare/index.ts` catches it
and returns `success: false` with a generic "Module setup error". This is improved:

- Each `await loadModule(name)` failure produces a clear message:
  `[gwen] Failed to load module "@gwenjs/physics2d": Cannot find package '@gwenjs/physics2d'`
  Hint: `Run 'gwen add @gwenjs/physics2d' to install it.`
- Each `await mod.setup(options, kit)` failure produces:
  `[gwen] Module "@gwenjs/physics2d" setup() threw: <error message>`
- These errors propagate — `prepare` fails with the specific module name in the error

The `--strict` CLI flag is **deprecated** — it prints a deprecation warning (`--strict is deprecated: hard-fail is now the default behavior`) and otherwise behaves identically to the default.

### 5. Test Coverage

**`packages/app/tests/prepare.test.ts`** — add:
- A realistic test with a mock module that has `addAutoImports` and `addTypeTemplate`
- Verify the output files contain the expected declarations

**`packages/cli/tests/integration/prepare.test.ts`** — add:
- A test with a config that uses `defineConfig` import syntax (triggers the interop path)
- A test that verifies a bad module string produces a clear error message
- A test that `config.modules` is populated when loaded via the CLI context

**`packages/app/tests/config.test.ts`** (new) — unit tests for `loadRawGwenConfig`:
- Test the `resolveModule` function with no-wrapping, single-wrapping, and double-wrapping inputs
- Test error propagation when the config file doesn't exist
- Test error propagation when the config file has a syntax error

---

## File Changes

| File | Action | Reason |
|---|---|---|
| `packages/app/src/config-loader.ts` | **New** | Shared interop-aware loader |
| `packages/app/src/config.ts` | **Modify** | Use shared loader |
| `packages/app/src/index.ts` | **Modify** | Export `loadRawGwenConfig` from `@gwenjs/app/resolve` |
| `packages/cli/src/core/config.ts` | **Modify** | Use shared loader |
| `packages/app/src/app.ts` | **Modify** | Per-module error messages in `setupModules` |
| `packages/app/tests/prepare.test.ts` | **Modify** | Add realistic module tests |
| `packages/app/tests/config.test.ts` | **New** | Unit tests for loadRawGwenConfig |
| `packages/cli/tests/integration/prepare.test.ts` | **Modify** | Add defineConfig import tests |

---

## Acceptance Criteria

1. `gwen prepare` in the space-shooter playground generates non-empty `auto-imports.d.ts` with all
   composables from `@gwenjs/physics2d`, `@gwenjs/input`, `@gwenjs/audio`, `@gwenjs/debug`
2. `gwen prepare` generates per-module `.d.ts` files (e.g., `physics2d.d.ts`, `input.d.ts`)
3. `gwen info` shows the correct `modules` array from `gwen.config.ts`
4. A missing module in `modules` array causes `gwen prepare` to fail with a clear error
5. All existing CLI tests continue to pass
6. New unit tests for `loadRawGwenConfig` cover the three interop cases
