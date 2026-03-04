//! Shared memory layout helpers.
//!
//! Reads and writes go through a `js_sys::Uint8Array` view over gwen-core's
//! linear memory. This is the only safe way to share data between two
//! separate WASM modules — raw `usize` pointers are only valid within the
//! module that allocated them.
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

// ── Helpers ───────────────────────────────────────────────────────────────────

fn read_f32(buf: &Uint8Array, byte_offset: usize) -> f32 {
    let b0 = buf.get_index(byte_offset as u32) as u32;
    let b1 = buf.get_index((byte_offset + 1) as u32) as u32;
    let b2 = buf.get_index((byte_offset + 2) as u32) as u32;
    let b3 = buf.get_index((byte_offset + 3) as u32) as u32;
    f32::from_bits(b0 | (b1 << 8) | (b2 << 16) | (b3 << 24))
}

fn write_f32(buf: &Uint8Array, byte_offset: usize, value: f32) {
    let bits = value.to_bits();
    buf.set_index(byte_offset as u32,       (bits & 0xFF) as u8);
    buf.set_index((byte_offset + 1) as u32, ((bits >> 8)  & 0xFF) as u8);
    buf.set_index((byte_offset + 2) as u32, ((bits >> 16) & 0xFF) as u8);
    buf.set_index((byte_offset + 3) as u32, ((bits >> 24) & 0xFF) as u8);
}

fn read_u32(buf: &Uint8Array, byte_offset: usize) -> u32 {
    let b0 = buf.get_index(byte_offset as u32) as u32;
    let b1 = buf.get_index((byte_offset + 1) as u32) as u32;
    let b2 = buf.get_index((byte_offset + 2) as u32) as u32;
    let b3 = buf.get_index((byte_offset + 3) as u32) as u32;
    b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)
}

fn write_u32(buf: &Uint8Array, byte_offset: usize, value: u32) {
    buf.set_index(byte_offset as u32,       (value & 0xFF) as u8);
    buf.set_index((byte_offset + 1) as u32, ((value >> 8)  & 0xFF) as u8);
    buf.set_index((byte_offset + 2) as u32, ((value >> 16) & 0xFF) as u8);
    buf.set_index((byte_offset + 3) as u32, ((value >> 24) & 0xFF) as u8);
}

// ── Public API ────────────────────────────────────────────────────────────────

pub fn read_position_rotation(buf: &Uint8Array, entity_index: u32) -> (f32, f32, f32) {
    let base = entity_index as usize * STRIDE;
    (
        read_f32(buf, base),
        read_f32(buf, base + 4),
        read_f32(buf, base + 8),
    )
}

pub fn write_position_rotation(buf: &Uint8Array, entity_index: u32, x: f32, y: f32, rot: f32) {
    let base = entity_index as usize * STRIDE;
    write_f32(buf, base,     x);
    write_f32(buf, base + 4, y);
    write_f32(buf, base + 8, rot);
}

pub fn read_flags(buf: &Uint8Array, entity_index: u32) -> u32 {
    read_u32(buf, entity_index as usize * STRIDE + 20)
}

pub fn set_physics_active(buf: &Uint8Array, entity_index: u32) {
    let offset = entity_index as usize * STRIDE + 20;
    let flags = read_u32(buf, offset);
    write_u32(buf, offset, flags | FLAG_PHYSICS_ACTIVE);
}

pub fn clear_physics_active(buf: &Uint8Array, entity_index: u32) {
    let offset = entity_index as usize * STRIDE + 20;
    let flags = read_u32(buf, offset);
    write_u32(buf, offset, flags & !FLAG_PHYSICS_ACTIVE);
}
