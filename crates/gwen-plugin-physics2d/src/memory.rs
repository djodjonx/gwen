//! Shared memory layout helpers.
//!
//! ## Performance strategy
//!
//! Writes go through a **local Rust buffer** that is flushed to the JS
//! `Uint8Array` in a **single `copy_from` call** per frame. This reduces
//! the number of wasm→JS FFI crossings from O(entities × 20) to O(1),
//! eliminating the dominant overhead of the cross-module memory bridge.
//!
//! Reads (flags) still use `get_index` — they occur only during
//! `add_rigid_body` / `remove_rigid_body`, not on the hot frame path.
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

use js_sys::Uint8Array;

/// Stride in bytes between two consecutive entity slots.
pub const STRIDE: usize = 32;

/// Bit-flag: this entity slot is managed by the physics plugin.
pub const FLAG_PHYSICS_ACTIVE: u32 = 0b01;

// ── Hot-path write (bulk, single FFI call) ────────────────────────────────────

/// Write `(pos_x, pos_y, rotation)` and set FLAG_PHYSICS_ACTIVE for
/// `entity_index` into `local_buf` (a Rust-owned `Vec<u8>`).
///
/// Call [`flush_to_js`] once after all entities have been written.
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
    // Set FLAG_PHYSICS_ACTIVE (bit 0) in the flags u32 at offset +20
    local_buf[base + 20] |= FLAG_PHYSICS_ACTIVE as u8;
}

/// Flush the entire local buffer to the JS `Uint8Array` in one FFI call.
#[inline]
pub fn flush_to_js(buf: &Uint8Array, local_buf: &[u8]) {
    buf.copy_from(local_buf);
}

// ── Cold-path helpers (per-event, not per-frame) ──────────────────────────────

/// Clear the physics-active flag for `entity_index` in the JS buffer.
/// Used only in `remove_rigid_body` — not on the hot frame path.
pub fn clear_physics_active(buf: &Uint8Array, entity_index: u32) {
    let offset = entity_index as usize * STRIDE + 20;
    let flags = read_u32_js(buf, offset);
    write_u32_js(buf, offset, flags & !FLAG_PHYSICS_ACTIVE);
}

// ── Internal JS read/write helpers (cold path only) ──────────────────────────

fn read_u32_js(buf: &Uint8Array, byte_offset: usize) -> u32 {
    let b0 = buf.get_index(byte_offset as u32) as u32;
    let b1 = buf.get_index((byte_offset + 1) as u32) as u32;
    let b2 = buf.get_index((byte_offset + 2) as u32) as u32;
    let b3 = buf.get_index((byte_offset + 3) as u32) as u32;
    b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)
}

fn write_u32_js(buf: &Uint8Array, byte_offset: usize, value: u32) {
    buf.set_index(byte_offset as u32,       (value & 0xFF) as u8);
    buf.set_index((byte_offset + 1) as u32, ((value >> 8)  & 0xFF) as u8);
    buf.set_index((byte_offset + 2) as u32, ((value >> 16) & 0xFF) as u8);
    buf.set_index((byte_offset + 3) as u32, ((value >> 24) & 0xFF) as u8);
}

