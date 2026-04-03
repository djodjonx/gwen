---
name: WasmBridge architecture
description: wasm-bridge.ts is intentionally a single large file; splitting it caused a measurable perf regression due to V8 inlining.
type: project
---

`packages/core/src/engine/wasm-bridge.ts` is intentionally a monolithic file (currently ~1650 lines).

**Why:** V8 inlines calls between functions in the same compilation unit. A previous refactor that split the file into separate modules caused a measurable perf regression on the hot path (entity queries + component reads at ~1000 entities/frame).

**How to apply:** Do NOT split wasm-bridge.ts into separate files. All bridge code (WasmEngineBase interface, WasmBridge public interface, WasmBridgeImpl) must stay co-located.

The file has a `#region` navigation comment at the top listing the major sections. Follow that pattern when adding new regions.
