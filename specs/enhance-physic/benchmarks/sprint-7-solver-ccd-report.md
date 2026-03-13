# Sprint 7 - Solver / CCD benchmark report

Date: 2026-03-13

Scenario: `solver-presets`

## Method

Two deterministic scenarios were measured locally from `crates/gwen-plugin-physics2d/src/bin/bench_solver_presets.rs`:

1. **stack stability / step cost**
   - 8x6 dynamic box stack on a fixed ground
   - warmup: 120 frames
   - measure: 240 frames at `dt = 1/60`
   - outputs: `p50`, `p95`, `stabilityJitterM`
2. **fast projectile tunnel rate**
   - dynamic projectile against a thin fixed wall
   - 24 trials at `dt = 1/120`
   - outputs: `tunnelRate`

Preset runtime parity used for the benchmark:

- `low`, `medium`: global CCD disabled
- `high`, `esport`: global CCD enabled

## Results

| Preset | Global CCD | Solver iterations | CCD substeps | Step p50 (ms) | Step p95 (ms) | Tunnel rate | Stability jitter (m) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `low` | no | 2 | 1 | 0.155 | 1.866 | 1.0000 | 0 |
| `medium` | no | 4 | 1 | 0.164 | 3.241 | 1.0000 | 0 |
| `high` | yes | 8 | 2 | 0.174 | 6.685 | 0.0000 | 0.00003 |
| `esport` | yes | 10 | 4 | 0.178 | 8.711 | 0.0000 | 0.00013 |

## Reading guide

- `low` / `medium` keep CPU cost lower, but the projectile scenario still tunnels completely.
- `high` is the first preset that eliminates tunneling in this scenario.
- `esport` gives the strongest solver profile, but with a slightly higher p95 cost than `high` on this machine.
- Stability jitter is already near-zero from `high` upward in the measured stack scene.

## Recommendation by game genre

| Genre / profile | Recommended preset | Why |
| --- | --- | --- |
| mobile casual / simple arcade | `low` | cheapest CPU path if high-speed tunneling is not gameplay-critical |
| balanced platformer / action-adventure | `medium` | safe default when projectiles are moderate and CPU budget matters |
| precision action / shooter / physics-heavy gameplay | `high` | best trade-off here: tunnel rate fixed, lower p95 than `esport` |
| competitive / esport / extreme-speed projectiles | `esport` | use when you want the highest solver headroom and accept the extra CPU cost |

## Notes

- The benchmark run that produced this report also revealed and fixed a runtime issue: `DYNAMIC_FIXED` collision types were not enabled on colliders, which made dynamic bodies ignore fixed walls/ground in some scenarios.
- These numbers are machine-local reference values, not CI-stable absolute thresholds.
- The smoke test only enforces payload validity plus the expected tunnel-rate ordering (`high`/`esport` no worse than `low`).

## Re-run

```bash
pnpm bench:physics:solver
pnpm test:bench:physics:solver
```

