# Sprint 8 retrospective - Physics2D hardening/release

Date: 2026-03-13

## Scope completed

- `PHYS-S8-001`: deprecation audit gate hardened
- `PHYS-S8-002`: tree-shaking packaging finalized (`core/helpers/tilemap/debug`)
- `PHYS-S8-003`: playground e2e smoke baseline check added
- `PHYS-S8-004`: plugin final docs refreshed
- `PHYS-S8-005`: release notes + QA checklist completed
- `PHYS-S8-007`: perf score regression gate implemented

## KPI snapshot vs objectives

| KPI | Target | Current status |
| --- | --- | --- |
| Rust unit tests | pass | pass |
| TS tests | pass | pass |
| Deprecation audit gate | required | pass |
| Perf score gate | required | pass |
| Tree-shaking smoke | required | pass |
| Playground e2e smoke | required | pass |

Notes:

- `allocations` and `dropped events` are reserved in the first perf-score increment and are not blocking yet.
- benchmark thresholds are configurable in `scripts/physics-perf-thresholds.json`.

## What worked well

- Runtime bug discovery from benchmark loop (`dynamic <-> fixed` collision activation) was converted into a permanent regression test.
- Bench-to-gate flow is now scriptable and reproducible for PRs.
- Deprecation process is stricter and less likely to drift from migration docs.

## Remaining risks

- Perf thresholds are machine-sensitive and should be recalibrated on CI hardware over time.
- Playground e2e currently focuses on deterministic smoke + baseline constraints, not full browser gameplay automation.
- Historical changelog entries still contain placeholder dependency text from older releases.

## Post-release backlog v2 (prioritized)

1. Add deterministic allocation sampling for physics hot paths and integrate into perf score gate.
2. Add dropped-events measurable signal into bench payload and make it blocking when stable.
3. Extend playground e2e from smoke checks to scripted gameplay assertions (input replay + expected outcomes).
4. Add CI artifact publication for perf score JSON and trend history per PR.
5. Normalize legacy changelog sections from early versions.

