# Benchmarks - Sprite Anim Runtime

This document describes CPU benchmarks for the animation runtime hot path (`tick`).

## Run

```bash
pnpm --filter @gwenjs/gwen-plugin-sprite-anim bench
```

## Scenarios

- `tick clip-only x2k entities (120 frames)`
- `tick controller x2k entities + param churn (120 frames)`
- `tick controller x10k entities (60 frames)`
- `attach/detach churn x2k entities (pooling)`

## Goal

- Measure CPU cost of the animation core (FSM + frame sampling) without Canvas rendering noise.
- Compare workload profiles before deciding whether a Rust/WASM backend is worth it.

## How to read results correctly

Vitest Bench reports mean time **per scenario iteration**, not per frame.

- `cost_per_frame_ms = mean_ms / scenario_frame_count`

Example interpretation (reference local numbers; machine-dependent):

- `clip-only x2k`: `2.2755 ms / 120` -> `~0.019 ms/frame`
- `controller x2k + churn`: `34.3744 ms / 120` -> `~0.286 ms/frame`
- `controller x10k`: `63.6088 ms / 60` -> `~1.06 ms/frame`

## Decision heuristic

- <= `1.0 ms/frame` on your target machine: excellent, keep TypeScript.
- `1.0 - 2.0 ms/frame`: acceptable, optimize allocations/transitions first.
- > `2.0 ms/frame` consistently: evaluate Rust/WASM backend.

## Notes

- Absolute values vary with CPU, power mode, and background load.
- Focus on relative regression/improvement between commits and PRs.
