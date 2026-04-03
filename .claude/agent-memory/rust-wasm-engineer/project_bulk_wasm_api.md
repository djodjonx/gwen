---
name: Bulk WASM ECS API
description: get_components_bulk/set_components_bulk added to bindings.rs; readComponentsBulk/writeComponentsBulk on WasmBridge TS. Reduces 3N crossings to 4 per frame.
type: project
---

`get_components_bulk` and `set_components_bulk` exist in `crates/gwen-core/src/bindings.rs` (after `get_component_raw`).

`readComponentsBulk` and `writeComponentsBulk` are on the `WasmBridge` interface and `WasmBridgeImpl` in `packages/core/src/engine/wasm-bridge.ts`.

**Why:** The chatty-API anti-pattern caused 3N JS→WASM crossings + 2N allocations per frame. Bulk APIs collapse reads/writes into 4 crossings total regardless of entity count.

**How to apply:** When implementing new systems that need to read/write the same component for many entities, prefer `readComponentsBulk`/`writeComponentsBulk` over per-entity `getComponentRaw`/`addComponent` loops.

Bench coverage in `packages/core/bench/shared-memory.bench.ts` (Path D sections, describes 7–9).
