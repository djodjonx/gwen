//! Shared memory layout helpers.
//!
//! The SAB (shared-array buffer) allocated by `SharedMemoryManager` in TS
//! follows a fixed SoA layout.  This module encapsulates all pointer
//! arithmetic so the rest of the crate never does raw ptr math.
//!
//! Layout (stride = 32 bytes per entity slot):
//! ```text
//!   offset +  0 : pos_x    (f32, 4 B)
//!   offset +  4 : pos_y    (f32, 4 B)
//!   offset +  8 : rotation (f32, 4 B)  radians
//!   offset + 12 : scale_x  (f32, 4 B)
//!   offset + 16 : scale_y  (f32, 4 B)
//!   offset + 20 : flags    (u32, 4 B)  bit 0 = physics-active
//!   offset + 24 : reserved (8  B)
//! ```
//!
//! `ptr` is the value returned by `gwen_core::alloc_shared_buffer` — an
//! address inside `gwen-core`'s WASM linear memory, accessible from both
//! WASM modules through the JS-managed shared pointer.

/// Stride in bytes between two consecutive entity slots.
pub const STRIDE: usize = 32;

/// Bit-flag: this entity slot is managed by the physics plugin.
pub const FLAG_PHYSICS_ACTIVE: u32 = 0b01;

/// Read (pos_x, pos_y, rotation) for `entity_index` from the shared buffer.
///
/// # Safety
/// `ptr` must point to an allocation of at least `(entity_index + 1) * STRIDE` bytes.
#[inline]
pub unsafe fn read_position_rotation(ptr: usize, entity_index: u32) -> (f32, f32, f32) {
    let base = (ptr + entity_index as usize * STRIDE) as *const f32;
    (*base, *base.add(1), *base.add(2))
}

/// Write (pos_x, pos_y, rotation) for `entity_index` into the shared buffer.
///
/// # Safety
/// Same contract as `read_position_rotation`.
#[inline]
pub unsafe fn write_position_rotation(ptr: usize, entity_index: u32, x: f32, y: f32, rot: f32) {
    let base = (ptr + entity_index as usize * STRIDE) as *mut f32;
    base.write(x);
    base.add(1).write(y);
    base.add(2).write(rot);
}

/// Read the flags word for `entity_index`.
///
/// # Safety
/// Same contract as `read_position_rotation`.
#[inline]
pub unsafe fn read_flags(ptr: usize, entity_index: u32) -> u32 {
    *((ptr + entity_index as usize * STRIDE + 20) as *const u32)
}

/// Set the physics-active flag for `entity_index`.
///
/// # Safety
/// Same contract as `read_position_rotation`.
#[inline]
pub unsafe fn set_physics_active(ptr: usize, entity_index: u32) {
    let flags_ptr = (ptr + entity_index as usize * STRIDE + 20) as *mut u32;
    *flags_ptr |= FLAG_PHYSICS_ACTIVE;
}

/// Clear the physics-active flag for `entity_index`.
///
/// # Safety
/// Same contract as `read_position_rotation`.
#[inline]
pub unsafe fn clear_physics_active(ptr: usize, entity_index: u32) {
    let flags_ptr = (ptr + entity_index as usize * STRIDE + 20) as *mut u32;
    *flags_ptr &= !FLAG_PHYSICS_ACTIVE;
}

