# GWEN v2-fix — Master Agent Plan

> **For agentic workers:** Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to execute this plan. Each fix file in this directory is a self-contained specification. Work through them in the priority order defined below. Do NOT skip steps — every acceptance checklist item must pass before marking a task done.

---

## Mission

Fix all identified quality, consistency, type safety, test coverage, and performance gaps in the GWEN monorepo. Every change must be:

- **Fully documented** in English (JSDoc on all public APIs, inline comments on non-obvious logic)
- **Fully tested** (unit tests in Vitest, integration tests where applicable)
- **Benchmarked** where performance is a concern (Vitest bench files)
- **Type-safe** — zero `any` allowed; all `@ts-ignore` must be replaced with proper types or explicit `@ts-expect-error` with justification
- **Lint-clean** — `pnpm lint` and `pnpm format:check` must pass with zero violations
- **Typecheck-clean** — `pnpm typecheck` must pass with zero errors

---

## Context

The GWEN engine is a hybrid Rust/WASM + TypeScript 2D/3D web game engine. The monorepo contains 18 `@gwenjs/*` packages, 2 Rust crates, and 2 playground projects. A thorough codebase audit on 2026-04-03 identified the following issues.

Full audit findings: see `specs/agent/history.md` and the four analysis reports that preceded this plan.

---

## Problems & Priority Matrix

| # | Severity | Problem | Spec File | Estimated Complexity |
|---|----------|---------|-----------|---------------------|
| 1 | 🔴 Critical | Playground Vite 6 vs 8 mismatch — playgrounds broken | `01-CRITICAL-FIXES.md` | XS |
| 2 | 🔴 Critical | Changesets config still references `@djodjonx/*` — npm release broken | `01-CRITICAL-FIXES.md` | XS |
| 3 | 🟠 High | RFC-006 live query not wired in `physics2d/systems.ts:47` | `02-LIVE-QUERY.md` | M |
| 4 | 🟠 High | `physics3d` TypeScript fallback incomplete (~70%) | `03-PHYSICS3D.md` | L |
| 5 | 🟠 High | `r3f` package is a stub (~30%) | `04-R3F.md` | L |
| 6 | 🟡 Medium | Zero `any` policy — audit and fix all type violations | `05-TYPE-SAFETY.md` | M |
| 7 | 🟡 Medium | Test coverage gaps (renderer-canvas2d, r3f, audio, debug, input) | `06-TESTS.md` | M |
| 8 | 🟡 Medium | Missing performance benchmarks across packages | `07-BENCHMARKS.md` | M |
| 9 | 🟢 Low | 5 packages missing explicit `vitest.config.ts` | `08-TOOLING.md` | XS |
| 10 | 🟢 Low | `tsconfig.json` project references incomplete (4/18) | `08-TOOLING.md` | XS |
| 11 | 🟢 Low | `cli` AST extractor missing block-body handling (2 TODOs) | `08-TOOLING.md` | S |
| 12 | 🟢 Low | `renderer-canvas2d` and `r3f` lack adequate documentation | `08-TOOLING.md` | S |
| 13 | 🟠 High | WASM bridge "chatty API" — 3N boundary crossings per frame kills perf | `09-WASM-BRIDGE-PERF.md` | L |
| 14 | 🟠 High | `gwen init` scaffold incomplete — no tsconfig, no oxlint, no mini-game | `10-CLI-SCAFFOLD.md` | M |

---

## Execution Order

**MUST follow this order — later phases depend on earlier ones.**

```
Phase 1 — Critical Fixes (unblocks everything)
  Fix #1  Playground Vite version alignment
  Fix #2  Changesets namespace correction

Phase 2 — Core Feature Completion (implement in order)
  Fix #3  RFC-006 live query in physics2d
  Fix #4  physics3d fallback completion
  Fix #5  r3f adapter implementation
  Fix #13 WASM bridge batch + zero-copy API

Phase 3 — Code Quality (can run in parallel after Phase 1)
  Fix #6  Zero-any audit
  Fix #7  Test coverage
  Fix #8  Benchmarks

Phase 4 — Tooling Polish (can run after Phase 1)
  Fix #9   vitest.config.ts standardization
  Fix #10  tsconfig project references
  Fix #11  CLI AST extractor TODOs
  Fix #12  Documentation gaps
  Fix #14  CLI scaffold — tsconfig + oxlint + landing game
```

---

## Global Quality Gates

Every change submitted in this plan must pass all of the following before being considered done:

### 1. Lint
```bash
pnpm lint
# Must exit 0 with zero violations
```

### 2. Format
```bash
pnpm format:check
# Must exit 0 — if not, run: pnpm format
```

### 3. Typecheck
```bash
pnpm typecheck
# Must exit 0 with zero TypeScript errors
```

### 4. Tests
```bash
pnpm test:ts
# All tests must pass
```

### 5. Build
```bash
pnpm build:ts
# All packages must build without errors
```

### 6. Rust (if Rust files were touched)
```bash
pnpm test:cargo
# All Rust tests must pass
```

---

## Documentation Standards

All public-facing APIs must have JSDoc that includes:

```typescript
/**
 * Brief one-line summary.
 *
 * Optional longer explanation of behavior, edge cases, or performance notes.
 *
 * @param paramName - Description of the parameter
 * @returns Description of the return value
 * @throws {ErrorType} When and why this throws
 *
 * @example
 * ```ts
 * const result = myFunction(arg)
 * // → expected output
 * ```
 *
 * @since 1.0.0
 */
```

Rules:
- All `export`ed functions, classes, interfaces, and types must have JSDoc
- Internal helpers do not require JSDoc unless the logic is non-obvious
- All JSDoc must be in **English**
- `@example` blocks must be runnable TypeScript (not pseudocode)

---

## Testing Standards

### Unit Tests
- File naming: `*.test.ts` co-located in `src/` OR in `tests/` directory
- Each test file must have a descriptive `describe` block
- Tests must be independent (no shared mutable state between `it` blocks)
- Use `beforeEach`/`afterEach` for setup/teardown, not `beforeAll` where possible

### Benchmark Files
- File naming: `*.bench.ts` in `bench/` directory
- Use `bench()` from Vitest
- Every benchmark must have a `name` and a `baseline` where applicable
- Performance gates should use `expect().toMatchSnapshot()` or explicit thresholds

### Integration Tests
- File naming: `*.integration.test.ts` in `tests/`
- Must test the full plugin lifecycle (setup → frame loop → teardown)

### Example test structure:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'

describe('MyService', () => {
  let service: MyService

  beforeEach(() => {
    service = new MyService()
  })

  describe('myMethod()', () => {
    it('returns expected value for valid input', () => {
      expect(service.myMethod('valid')).toBe('expected')
    })

    it('throws for null input', () => {
      expect(() => service.myMethod(null as any)).toThrow(TypeError)
    })
  })
})
```

---

## Type Safety Standards

- **Zero `any`** — use `unknown` + type guards, generics, or explicit union types instead
- **No `@ts-ignore`** — use `@ts-expect-error` with a comment explaining why
- **Strict null checks** are enabled; do not bypass with `!` non-null assertions unless provably safe
- All `satisfies` operators preferred over `as` casts where applicable
- For WASM interop, define explicit typed wrappers — do not expose raw wasm-bindgen types

---

## Spec Files Index

| File | Scope |
|------|-------|
| `01-CRITICAL-FIXES.md` | Playground Vite + Changesets namespace |
| `02-LIVE-QUERY.md` | RFC-006 live query wiring in physics2d |
| `03-PHYSICS3D.md` | physics3d fallback TypeScript completion |
| `04-R3F.md` | React Three Fiber adapter implementation |
| `05-TYPE-SAFETY.md` | Zero-any audit and fix |
| `06-TESTS.md` | Test coverage gaps |
| `07-BENCHMARKS.md` | Performance benchmarks |
| `08-TOOLING.md` | vitest configs, project refs, CLI AST, docs |
| `09-WASM-BRIDGE-PERF.md` | Batch API, zero-copy ptr, built-in step system |
