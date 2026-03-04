//! Shared memory layout helpers.
//!
//! ## Plugin Data Bus migration
//! The legacy `flush_to_js` and `clear_physics_active` functions have been
//! removed — the PluginDataBus manages buffer lifecycle externally.
//!
//! `write_position_rotation_local` is kept because it writes into a Rust-owned
//! `Vec<u8>` (zero FFI); the caller flushes it via
//! `gwen_wasm_utils::buffer::flush_local_to_js`.
//!
//! Layout (stride = 20 bytes per entity slot in the transform channel):
//! ```text
//!   offset +  0 : pos_x    (f32, 4 B)
//!   offset +  4 : pos_y    (f32, 4 B)
//!   offset +  8 : rotation (f32, 4 B)  radians
//!   offset + 12 : scale_x  (f32, 4 B)
//!   offset + 16 : scale_y  (f32, 4 B)
//! ```

/// Stride in bytes between two consecutive entity slots in the transform channel.
pub const STRIDE: usize = 20;

// ── Hot-path write (bulk, single FFI call) ────────────────────────────────────

/// Write `(pos_x, pos_y, rotation)` for `entity_index` into `local_buf`
/// (a Rust-owned `Vec<u8>` / slice).
///
/// Call `gwen_wasm_utils::buffer::flush_local_to_js(buf, &local)` once after
/// all entities have been written to flush in a single FFI call.
#[inline]
pub fn write_position_rotation_local(
    local_buf: &mut [u8],
    entity_index: u32,
    x: f32,
    y: f32,
    rot: f32,
) {
    let base = entity_index as usize * STRIDE;
    local_buf[base..base + 4].copy_from_slice(&x.to_le_bytes());
    local_buf[base + 4..base + 8].copy_from_slice(&y.to_le_bytes());
    local_buf[base + 8..base + 12].copy_from_slice(&rot.to_le_bytes());
}
