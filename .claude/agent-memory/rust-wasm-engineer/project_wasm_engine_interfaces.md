---
name: WasmBridge / WasmEngineBase interface layering
description: New Rust exports must be added to 3 places in wasm-bridge.ts: WasmEngineBase, WasmBridge public interface, and WasmBridgeImpl.
type: project
---

When adding a new `#[wasm_bindgen]` method to `bindings.rs`, three TypeScript locations must be updated in `wasm-bridge.ts`:

1. **`WasmEngineBase` interface** (~line 72) — the raw Rust export shape (snake_case, `Uint8Array`/`Uint32Array` params)
2. **`WasmBridge` interface** (~line 1017) — the JS-friendly public API (camelCase, `EntityId[]` / `Float32Array`)
3. **`WasmBridgeImpl` class** (~line 1264) — the concrete implementation that unpacks `EntityId`s, builds typed arrays, and calls through to `requireWasm()`

`requireWasm()` is the guard function that throws if WASM hasn't been initialized.
`unpackEntityId(id)` returns `{ index, generation }` from a packed `EntityId` bigint.
