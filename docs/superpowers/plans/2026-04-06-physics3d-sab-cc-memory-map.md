# Physics3D CC SAB Memory Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the per-frame `Vec<f32>` heap allocation in `character_controller_move` by writing CC state into a static WASM linear-memory buffer that JS reads via a pre-allocated `Float32Array` view.

**Architecture:** Add a compact slot counter (0..MAX_CC) to `PhysicsWorld3D`. `character_controller_move` writes `[grounded, nx, ny, nz, groundEntityBits]` into `static mut CC_STATE_BUFFER` at `slot * 5` and returns `void`. JS calls `physics3d_get_cc_sab_ptr()` once after WASM init to obtain a pointer, then reads from `ccSABView.view[slot * 5]` each frame with zero WASM calls.

**Tech Stack:** Rust `static mut`, `std::ptr::addr_of!`, `#[wasm_bindgen]`, TypeScript `Float32Array`, WASM linear memory pointer.

---

## File Map

| File | Change |
|------|--------|
| `crates/gwen-core/src/physics3d/world.rs` | Add `cc_slot_indices: HashMap<u32,u32>`, `next_cc_slot: u32`, `CC_STATE_BUFFER`, slot-indexed write in `character_controller_move` (returns `void`) |
| `crates/gwen-core/src/bindings.rs` | Change CC move return `Vec<f32>` → `void`; add `physics3d_get_cc_sab_ptr`, `physics3d_get_max_cc_entities` |
| `packages/physics3d/src/plugin/bridge.ts` | Update `physics3d_character_controller_move` to `void`; add 2 new ptr methods |
| `packages/physics3d/src/plugin/index.ts` | Populate `ccSABView.view` from WASM ptr after init; read from SAB in `move()` instead of Vec<f32>; re-validate on memory.grow |

---

## Task 1: Rust — compact slot index + CC_STATE_BUFFER

**Files:**
- Modify: `crates/gwen-core/src/physics3d/world.rs`

- [ ] **Step 1: Add constants and static buffer**

At the top of `world.rs`, after the existing imports, add:

```rust
/// Maximum number of simultaneously active character controllers.
pub const MAX_CC_ENTITIES: usize = 32;

/// f32 fields per CC slot: [grounded, normal_x, normal_y, normal_z, ground_entity_bits].
pub const CC_STATE_STRIDE: usize = 5;

/// Output buffer written by [`PhysicsWorld3D::character_controller_move`].
///
/// Indexed as `CC_STATE_BUFFER[slot_index * CC_STATE_STRIDE]`.
/// JS reads this via a `Float32Array` view into WASM linear memory.
/// All 5 fields are initialised to the "not grounded" sentinel on startup.
static mut CC_STATE_BUFFER: [f32; MAX_CC_ENTITIES * CC_STATE_STRIDE] =
    [0.0_f32; MAX_CC_ENTITIES * CC_STATE_STRIDE];
```

- [ ] **Step 2: Add compact slot tracking fields to `PhysicsWorld3D`**

In the `PhysicsWorld3D` struct, add after `cc_controllers`:

```rust
/// Compact slot index for each CC entity (entity_index → 0..MAX_CC_ENTITIES).
/// Used to address [`CC_STATE_BUFFER`] without sparse entity indices.
cc_slot_indices: HashMap<u32, u32>,
/// Monotonically increasing counter for assigning compact CC slot indices.
next_cc_slot: u32,
```

- [ ] **Step 3: Initialise new fields in `PhysicsWorld3D::new`**

In `PhysicsWorld3D::new`, add after `cc_controllers: HashMap::new()`:

```rust
cc_slot_indices: HashMap::new(),
next_cc_slot: 0,
```

- [ ] **Step 4: Assign compact slot in `add_character_controller`, return slot index**

Replace the return value at the end of `add_character_controller`:

```rust
// Before:
self.cc_controllers.insert(entity_index, (cc, apply_impulses_to_dynamic));
entity_index

// After:
self.cc_controllers.insert(entity_index, (cc, apply_impulses_to_dynamic));
let slot = self.next_cc_slot;
self.cc_slot_indices.insert(entity_index, slot);
self.next_cc_slot = self.next_cc_slot.wrapping_add(1).min(MAX_CC_ENTITIES as u32 - 1);
slot
```

- [ ] **Step 5: Clean up slot in `remove_character_controller`**

After `self.cc_controllers.remove(&entity_index);` in `remove_character_controller`, add:

```rust
self.cc_slot_indices.remove(&entity_index);
```

- [ ] **Step 6: Change `character_controller_move` to write buffer + return `void`**

Change the function signature from `-> Vec<f32>` to `-> ()` and replace all `return NO_HIT.to_vec();` and the final `vec![...]` with writes to the buffer.

Replace the entire function body from the `NO_HIT` constant to the end with:

```rust
pub fn character_controller_move(
    &mut self,
    entity_index: u32,
    vx: f32,
    vy: f32,
    vz: f32,
    dt: f32,
) {
    let slot = match self.cc_slot_indices.get(&entity_index) {
        Some(&s) => s as usize,
        None => {
            debug_warn!("character_controller_move: unknown entity {}", entity_index);
            return;
        }
    };
    let base = slot * CC_STATE_STRIDE;

    /// Write the "not grounded" sentinel into CC_STATE_BUFFER at `base`.
    macro_rules! write_no_hit {
        () => {
            unsafe {
                let buf = &raw mut CC_STATE_BUFFER;
                (*buf)[base]     = 0.0;   // not grounded
                (*buf)[base + 1] = 0.0;
                (*buf)[base + 2] = 1.0;   // default up normal
                (*buf)[base + 3] = 0.0;
                (*buf)[base + 4] = f32::from_bits(u32::MAX); // no entity
            }
        };
    }

    let Some(&handle) = self.entity_handles.get(&entity_index) else {
        debug_warn!("character_controller_move: unknown entity {}", entity_index);
        write_no_hit!();
        return;
    };
    let Some((cc, apply_impulses)) = self.cc_controllers.get(&entity_index) else {
        debug_warn!("character_controller_move: no CC for entity {}", entity_index);
        write_no_hit!();
        return;
    };
    let apply_impulses = *apply_impulses;
    let Some(body) = self.rigid_body_set.get(handle) else {
        write_no_hit!();
        return;
    };
    let position = *body.position();
    let desired = Vector::new(vx * dt, vy * dt, vz * dt);

    let Some(collider_handle) = body.colliders().first().copied() else {
        debug_warn!("character_controller_move: entity {} has no collider", entity_index);
        write_no_hit!();
        return;
    };
    let Some(collider) = self.collider_set.get(collider_handle) else {
        write_no_hit!();
        return;
    };
    let shape = collider.shape();
    let filter = QueryFilter::default().exclude_rigid_body(handle);
    let mut collisions: Vec<rapier3d::control::CharacterCollision> = Vec::new();
    let movement = cc.move_shape(
        dt,
        &self.rigid_body_set,
        &self.collider_set,
        &self.query_pipeline,
        shape,
        &position,
        desired,
        filter,
        |c| collisions.push(c),
    );

    if apply_impulses && !collisions.is_empty() {
        cc.solve_character_collision_impulses(
            dt,
            &mut self.rigid_body_set,
            &self.collider_set,
            &self.query_pipeline,
            shape,
            1.0,
            &collisions,
            filter,
        );
    }

    let Some(body_mut) = self.rigid_body_set.get_mut(handle) else {
        write_no_hit!();
        return;
    };
    let mut new_pos = *body_mut.position();
    new_pos.translation.vector += movement.translation;
    body_mut.set_next_kinematic_position(new_pos);

    // Write result to CC_STATE_BUFFER
    unsafe {
        let buf = &raw mut CC_STATE_BUFFER;
        if movement.grounded && !collisions.is_empty() {
            let col = &collisions[0];
            let n = col.hit.normal2;
            let mut ground_entity_bits = u32::MAX - 1; // static world sentinel
            if let Some(col_ref) = self.collider_set.get(col.handle) {
                if let Some(rb_handle) = col_ref.parent() {
                    if let Some(&ent_idx) = self.handle_to_entity.get(&rb_handle) {
                        ground_entity_bits = ent_idx;
                    }
                }
            }
            (*buf)[base]     = 1.0;
            (*buf)[base + 1] = n.x;
            (*buf)[base + 2] = n.y;
            (*buf)[base + 3] = n.z;
            (*buf)[base + 4] = f32::from_bits(ground_entity_bits);
        } else {
            (*buf)[base]     = 0.0;
            (*buf)[base + 1] = 0.0;
            (*buf)[base + 2] = 1.0;
            (*buf)[base + 3] = 0.0;
            (*buf)[base + 4] = f32::from_bits(u32::MAX);
        }
    }
}
```

- [ ] **Step 7: Add `get_cc_sab_ptr` helper**

After the `get_path_buffer_ptr_3d` style in `pathfinding.rs`, add in `world.rs`:

```rust
/// Returns a raw pointer to the start of the CC state buffer.
///
/// Layout: `[grounded: f32, nx: f32, ny: f32, nz: f32, groundBits: f32]` per slot.
/// Slot index is returned by [`add_character_controller`].
///
/// # Safety
/// Pointer is valid for the lifetime of the WASM module.
pub fn get_cc_sab_ptr() -> *const f32 {
    unsafe { std::ptr::addr_of!(CC_STATE_BUFFER) as *const f32 }
}

/// Returns the maximum number of simultaneous character controllers.
pub fn max_cc_entities() -> u32 {
    MAX_CC_ENTITIES as u32
}
```

- [ ] **Step 8: Run Rust tests**

```bash
cd /path/to/gwen && cargo test -p gwen-core --features physics3d 2>&1 | grep -E "^test result|FAILED|error\["
```
Expected: `test result: ok. N passed; 0 failed`

Note: The test `test_rfc09d_add_character_controller_returns_entity_index` will now fail because the return value is the compact slot (0) instead of entity_index. Update it:

```rust
#[test]
fn test_rfc09d_add_character_controller_returns_compact_slot() {
    let mut world = world_with_one_dynamic();
    let slot = world.add_character_controller(0, 0.35, 45.0, 0.02, 0.2, true, true);
    // First CC registered gets slot 0
    assert_eq!(slot, 0);
}
```

- [ ] **Step 9: Commit Rust changes**

```bash
git add crates/gwen-core/src/physics3d/world.rs
git commit -m "feat(physics3d): CC SAB buffer — compact slot index, void move, CC_STATE_BUFFER

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Rust bindings — update CC move + add SAB ptr exports

**Files:**
- Modify: `crates/gwen-core/src/bindings.rs`

- [ ] **Step 1: Change `physics3d_character_controller_move` return type to `()`**

Find the binding (around line 2511) and change:

```rust
// Before:
pub fn physics3d_character_controller_move(
    &mut self, entity_index: u32, vx: f32, vy: f32, vz: f32, dt: f32,
) -> Vec<f32> {
    if let Some(ref mut world) = self.physics3d_world {
        world.character_controller_move(entity_index, vx, vy, vz, dt)
    } else {
        vec![0.0_f32, 0.0, 1.0, 0.0, f32::from_bits(u32::MAX)]
    }
}

// After:
/// Drive a character controller by a desired velocity for one frame.
///
/// Results are written to the CC state buffer at `slot_index * CC_STATE_STRIDE`.
/// Read via the pointer returned by [`physics3d_get_cc_sab_ptr`].
///
/// # Arguments
/// * `entity_index` — ECS entity slot index of the character.
/// * `vx/vy/vz`     — Desired velocity in world space (m/s).
/// * `dt`           — Frame delta time in seconds.
#[cfg(feature = "physics3d")]
pub fn physics3d_character_controller_move(
    &mut self,
    entity_index: u32,
    vx: f32,
    vy: f32,
    vz: f32,
    dt: f32,
) {
    if let Some(ref mut world) = self.physics3d_world {
        world.character_controller_move(entity_index, vx, vy, vz, dt);
    }
}
```

- [ ] **Step 2: Add `physics3d_get_cc_sab_ptr` and `physics3d_get_max_cc_entities`**

After the `physics3d_character_controller_move` binding, add:

```rust
/// Returns the WASM linear-memory pointer to the CC state output buffer.
///
/// Layout per slot (stride = 5 f32):
///   `[grounded: f32, normal_x: f32, normal_y: f32, normal_z: f32, ground_entity_bits: f32]`
///
/// The slot index for each character controller is returned by
/// [`physics3d_add_character_controller`]. Valid until the WASM module is destroyed.
#[cfg(feature = "physics3d")]
pub fn physics3d_get_cc_sab_ptr(&self) -> u32 {
    crate::physics3d::world::get_cc_sab_ptr() as u32
}

/// Returns the maximum number of simultaneous character controllers supported.
/// Use this to size the JS-side `Float32Array` view over the CC state buffer.
#[cfg(feature = "physics3d")]
pub fn physics3d_get_max_cc_entities(&self) -> u32 {
    crate::physics3d::world::max_cc_entities()
}
```

- [ ] **Step 3: Run Rust tests again**

```bash
cargo test -p gwen-core --features physics3d 2>&1 | grep -E "^test result|FAILED|error\["
```
Expected: all pass.

- [ ] **Step 4: Commit bindings**

```bash
git add crates/gwen-core/src/bindings.rs
git commit -m "feat(physics3d): expose CC SAB ptr and max_cc_entities bindings

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: TypeScript bridge — update CC move + add SAB ptr methods

**Files:**
- Modify: `packages/physics3d/src/plugin/bridge.ts`

- [ ] **Step 1: Update `physics3d_character_controller_move` return type**

Find (~line 570):
```typescript
physics3d_character_controller_move?: (
  entityIndex: number,
  vx: number,
  vy: number,
  vz: number,
  dt: number,
) => Float32Array | undefined;
```

Change to:
```typescript
/**
 * Drive a character controller by desired velocity for one frame.
 * Results are written to the CC SAB buffer (see `physics3d_get_cc_sab_ptr`).
 *
 * @param entityIndex - ECS entity slot index.
 * @param vx/vy/vz   - Desired velocity (m/s).
 * @param dt         - Frame delta time in seconds.
 */
physics3d_character_controller_move?: (
  entityIndex: number,
  vx: number,
  vy: number,
  vz: number,
  dt: number,
) => void;
```

- [ ] **Step 2: Add SAB ptr methods**

After the `physics3d_remove_character_controller` line, add:

```typescript
/**
 * Returns the WASM linear-memory byte offset of the CC state buffer.
 *
 * Buffer layout per slot (stride = 5 × f32):
 *   `[grounded, normal_x, normal_y, normal_z, ground_entity_bits]`
 *
 * Slot index for each CC is returned by `physics3d_add_character_controller`.
 */
physics3d_get_cc_sab_ptr?: () => number;

/**
 * Returns the maximum number of concurrent character controllers.
 * Use this as the length divisor when creating the Float32Array view.
 */
physics3d_get_max_cc_entities?: () => number;
```

- [ ] **Step 3: Run typecheck**

```bash
cd /path/to/gwen && pnpm --filter '@gwenjs/physics3d' exec tsc --noEmit
```
Expected: no errors.

---

## Task 4: TypeScript plugin — populate ccSABView + read from SAB in move()

**Files:**
- Modify: `packages/physics3d/src/plugin/index.ts`

- [ ] **Step 1: Define CC SAB stride constant at module scope**

Near the top of the plugin factory (where `MAX_RAYCAST_SLOTS` etc. are defined), add:

```typescript
/** f32 fields per CC slot in the SAB state buffer. */
const CC_STATE_STRIDE = 5;
```

- [ ] **Step 2: Populate `ccSABView.view` after WASM is ready**

Find the block that runs after WASM init (search for where `_raycastOutputSABPtr` is populated or where `backendMode = 'wasm'` is set after module load). Add immediately after the raycast/shapecast SAB setup:

```typescript
// Populate CC SAB view from WASM linear memory
const ccSabPtr = wasmBridge!.physics3d_get_cc_sab_ptr?.() ?? 0;
const maxCC = wasmBridge!.physics3d_get_max_cc_entities?.() ?? 32;
if (ccSabPtr > 0) {
  const mem = bridgeRuntime?.getLinearMemory?.() ?? (wasmBridge as { memory?: WebAssembly.Memory })?.memory ?? null;
  if (mem) {
    ccSABView.view = new Float32Array(mem.buffer, ccSabPtr, maxCC * CC_STATE_STRIDE);
  }
}
```

- [ ] **Step 3: Add memory.grow re-validation for ccSABView**

In the `onUpdate` block, find the existing DataView invalidation block:
```typescript
if (eventsView && backendMode === 'wasm') {
  const memory = bridgeRuntime?.getLinearMemory?.() ?? wasmBridge?.memory ?? null;
  if (memory && eventsBufferRef !== memory.buffer) {
    eventsView = null;
    eventsBufferRef = null;
  }
}
```

Add a CC SAB re-validation check right after it:
```typescript
// Re-validate CC SAB view when WASM memory grows
if (ccSABView.view && backendMode === 'wasm') {
  const mem = bridgeRuntime?.getLinearMemory?.() ?? (wasmBridge as { memory?: WebAssembly.Memory })?.memory ?? null;
  if (mem && ccSABView.view.buffer !== mem.buffer) {
    const ccSabPtr = wasmBridge!.physics3d_get_cc_sab_ptr?.() ?? 0;
    const maxCC = wasmBridge!.physics3d_get_max_cc_entities?.() ?? 32;
    if (ccSabPtr > 0) {
      ccSABView.view = new Float32Array(mem.buffer, ccSabPtr, maxCC * CC_STATE_STRIDE);
    }
  }
}
```

- [ ] **Step 4: Update `move()` in the CC handle to read from SAB**

Find the `move(desiredVelocity, dt)` method in the WASM-mode CC handle closure (around line 2430). Replace the Vec<f32> parsing block:

```typescript
// Before — parse 5-float Vec<f32> result:
const result = wasmBridge?.physics3d_character_controller_move?.(
  entityIndex, desiredVelocity.x, desiredVelocity.y, desiredVelocity.z, dt,
);
if (result && result.length >= 5) {
  _grounded = result[0] !== 0;
  // ... parse normal, groundEntity from result[1..4] ...
}

// After — void call, read from pre-allocated SAB view:
wasmBridge?.physics3d_character_controller_move?.(
  entityIndex, desiredVelocity.x, desiredVelocity.y, desiredVelocity.z, dt,
);
const view = ccSABView.view;
if (view) {
  const base = slotIndex * CC_STATE_STRIDE;
  _grounded = view[base] !== 0;
  _groundNormal = _grounded
    ? { x: view[base + 1]!, y: view[base + 2]!, z: view[base + 3]! }
    : null;
  const groundBits = view[base + 4]!;
  const tmpView = new DataView(new ArrayBuffer(4));
  tmpView.setFloat32(0, groundBits, true);
  const groundIdx = tmpView.getUint32(0, true);
  _groundEntity =
    _grounded && groundIdx !== 0xffffffff && groundIdx !== 0xfffffffe
      ? entityIndexToId(groundIdx)
      : null;
}
```

Note: `slotIndex` is already available in the closure (from `ccRegistrations.set(entityIndex, { slotIndex, entityIndex })`).

- [ ] **Step 5: Run TS tests**

```bash
pnpm --filter @gwenjs/physics3d test
```
Expected: all tests pass.

- [ ] **Step 6: Run typecheck and build**

```bash
pnpm --filter '@gwenjs/physics3d' exec tsc --noEmit && pnpm build:ts
```
Expected: no errors.

- [ ] **Step 7: Commit TS changes**

```bash
git add packages/physics3d/src/plugin/bridge.ts packages/physics3d/src/plugin/index.ts
git commit -m "feat(physics3d): populate ccSABView — zero-copy CC state reads via SAB

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Tests for CC SAB

**Files:**
- Modify: `packages/physics3d/tests/gaps.test.ts`

- [ ] **Step 1: Add SAB CC tests**

Add to `gaps.test.ts` (after existing Gap 3 tests):

```typescript
describe('Gap 3b: CC SAB memory map', () => {
  it('move() calls physics3d_character_controller_move with void return', () => {
    // ... mock setup matching existing wasm-backend.test.ts pattern ...
    const moveSpy = vi.fn(); // void return
    mockBridge.physics3d_character_controller_move = moveSpy;
    mockBridge.physics3d_get_cc_sab_ptr = vi.fn(() => 0); // no SAB in mock
    mockBridge.physics3d_get_max_cc_entities = vi.fn(() => 32);

    const handle = physics.addCharacterController(entityId);
    handle.move({ x: 0, y: -5, z: 0 }, 1/60);

    expect(moveSpy).toHaveBeenCalledWith(
      expect.any(Number), 0, -5, 0, 1/60
    );
  });

  it('move() reads grounded from ccSABView when populated', () => {
    // Provide a fake SAB ptr so ccSABView.view is populated
    const fakeSAB = new Float32Array(32 * 5);
    const fakeMem = { buffer: fakeSAB.buffer } as WebAssembly.Memory;

    mockBridge.physics3d_get_cc_sab_ptr = vi.fn(() => 0);
    mockBridge.physics3d_get_max_cc_entities = vi.fn(() => 32);
    mockBridge.memory = fakeMem;

    // slot 0 — write grounded=1, normal=(0,1,0), no ground entity
    fakeSAB[0] = 1.0; fakeSAB[1] = 0; fakeSAB[2] = 1; fakeSAB[3] = 0;
    const noEnt = new DataView(new ArrayBuffer(4));
    noEnt.setUint32(0, 0xffffffff, true);
    fakeSAB[4] = noEnt.getFloat32(0, true);

    const handle = physics.addCharacterController(entityId);
    handle.move({ x: 0, y: -5, z: 0 }, 1/60);

    expect(handle.isGrounded).toBe(true);
    expect(handle.groundNormal).toEqual({ x: 0, y: 1, z: 0 });
    expect(handle.groundEntity).toBeNull();
  });

  it('move() reads groundEntity from ccSABView when entity present', () => {
    const fakeSAB = new Float32Array(32 * 5);
    // slot 0 — grounded, entity index 7
    fakeSAB[0] = 1.0;
    fakeSAB[1] = 0; fakeSAB[2] = 1; fakeSAB[3] = 0;
    const ent = new DataView(new ArrayBuffer(4));
    ent.setUint32(0, 7, true);
    fakeSAB[4] = ent.getFloat32(0, true);

    // ... inject fakeSAB via mock ...
    // expect handle.groundEntity to be entityIndexToId(7)
  });
});
```

- [ ] **Step 2: Run all TS tests**

```bash
pnpm --filter @gwenjs/physics3d test
```
Expected: all tests pass.

- [ ] **Step 3: Final push**

```bash
git add packages/physics3d/tests/gaps.test.ts
git commit -m "test(physics3d): CC SAB memory map coverage

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
git push
```
