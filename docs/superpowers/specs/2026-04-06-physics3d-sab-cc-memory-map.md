# Physics3D CC SAB Memory Map Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Eliminate the per-frame heap allocation in `character_controller_move` by writing CC state into a static WASM linear-memory buffer that JS reads via a pre-allocated `Float32Array` view (zero-copy SAB pattern).

**Architecture:** Rust writes `[grounded, nx, ny, nz, groundEntityBits]` per CC slot into `static mut CC_STATE_BUFFER` (stride 5 × f32). JS pre-allocates `ccSABView.view = new Float32Array(wasmMemory.buffer, CC_SAB_PTR, MAX_CC * 5)` once. `character_controller_move` returns `void`; JS reads from the view using `entityIndex * CC_STATE_STRIDE`.

**Tech Stack:** Rust `static mut`, `#[wasm_bindgen]`, TypeScript `Float32Array`, WASM linear memory pointer.

---

## Context

`ccSABView` and `ccDescriptorBuffer` are declared in `packages/physics3d/src/plugin/index.ts` but `ccSABView.view` is never populated. The current `character_controller_move` returns `Vec<f32>` — one heap allocation per call per frame.

The spatial query slot system already uses the correct SAB pattern (`_raycastOutputSABPtr`, `_shapecastOutputSABPtr`) — CC must be brought to the same standard.

---

## Constants

```
MAX_CC_ENTITIES = 32          // Max simultaneous character controllers
CC_STATE_STRIDE = 5           // floats per CC slot: [grounded, nx, ny, nz, groundBits]
CC_BUFFER_SIZE  = 32 × 5 = 160 floats
```

---

## Rust Changes

### `crates/gwen-core/src/physics3d/world.rs`

Change `character_controller_move` signature:
- **Before:** `pub fn character_controller_move(...) -> Vec<f32>`
- **After:** `pub fn character_controller_move(...)` (no return)

Add `entity_index` → write `[grounded, nx, ny, nz, groundBits]` into:
```rust
static mut CC_STATE_BUFFER: [f32; MAX_CC_ENTITIES * CC_STATE_STRIDE] = [0.0; ...];
```
at offset `entity_index * CC_STATE_STRIDE`.

### `crates/gwen-core/src/bindings.rs`

- `physics3d_character_controller_move(...)` → `void` return
- Add `physics3d_get_cc_sab_ptr() -> u32` — returns pointer to `CC_STATE_BUFFER`
- Add `physics3d_get_max_cc_entities() -> u32` — returns `MAX_CC_ENTITIES` constant

---

## TypeScript Changes

### `packages/physics3d/src/plugin/bridge.ts`

```typescript
physics3d_character_controller_move?: (...) => void;  // was: Float32Array | undefined
physics3d_get_cc_sab_ptr?: () => number;
physics3d_get_max_cc_entities?: () => number;
```

### `packages/physics3d/src/plugin/index.ts`

**After WASM ready** (in `onReady`/`onInit` block):
```typescript
const ccPtr = wasmBridge!.physics3d_get_cc_sab_ptr?.() ?? 0;
const maxCC = wasmBridge!.physics3d_get_max_cc_entities?.() ?? 32;
if (ccPtr > 0) {
  const mem = bridgeRuntime?.getLinearMemory?.() ?? wasmBridge?.memory ?? null;
  if (mem) ccSABView.view = new Float32Array(mem.buffer, ccPtr, maxCC * CC_STATE_STRIDE);
}
```

**In `move()` on the CC handle:**
```typescript
// was: parse 5-float Vec<f32> return
wasmBridge?.physics3d_character_controller_move?.(entityIndex, vx, vy, vz, dt);
// Read from pre-allocated SAB view
const base = entityIndex * CC_STATE_STRIDE;
const view = ccSABView.view;
if (view) {
  _grounded = view[base]! !== 0;
  _groundNormal = _grounded ? { x: view[base+1]!, y: view[base+2]!, z: view[base+3]! } : null;
  const bits = view[base+4]!;
  // ... decode groundEntity ...
}
```

**Re-validate `ccSABView.view` on `memory.grow`** (same pattern as existing DataView invalidation in `onUpdate`).

---

## Tests

- Rust: `character_controller_move` returns `void` (no return value check)
- Rust: `physics3d_get_cc_sab_ptr` returns non-zero
- Rust: buffer is written at correct offset for multiple CCs
- TS: mock `physics3d_get_cc_sab_ptr` + `Float32Array` population → verify `isGrounded`, `groundNormal`, `groundEntity` read correctly
- TS: `memory.grow` triggers SAB view re-validation (ccSABView.view is updated)

---

## Non-Goals

- No change to the query slot SAB system (already correct)
- No change to `ccDescriptorBuffer` (write path — separate concern)
- No change for local mode (no WASM, no SAB)
