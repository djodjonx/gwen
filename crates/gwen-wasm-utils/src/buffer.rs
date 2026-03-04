//! Buffer I/O helpers for `js_sys::Uint8Array`.
//!
//! All multi-byte values use **little-endian** byte order, consistent with
//! the `DataView` calls on the TypeScript side.
//!
//! ## Performance note
//! Each `get_index` / `set_index` call crosses the WASM→JS FFI boundary.
//! These helpers are intended for **cold paths** (a few calls per frame at most).
//! For hot paths, use `flush_local_to_js` which performs a single bulk `copy_from`.

use js_sys::Uint8Array;

// ── Write helpers ─────────────────────────────────────────────────────────────

/// Write a `u32` little-endian at `byte_offset` in a JS `Uint8Array`.
#[inline]
pub fn write_u32(buf: &Uint8Array, byte_offset: usize, value: u32) {
    buf.set_index(byte_offset as u32, (value & 0xFF) as u8);
    buf.set_index((byte_offset + 1) as u32, ((value >> 8) & 0xFF) as u8);
    buf.set_index((byte_offset + 2) as u32, ((value >> 16) & 0xFF) as u8);
    buf.set_index((byte_offset + 3) as u32, ((value >> 24) & 0xFF) as u8);
}

/// Write a `u16` little-endian at `byte_offset` in a JS `Uint8Array`.
#[inline]
pub fn write_u16(buf: &Uint8Array, byte_offset: usize, value: u16) {
    buf.set_index(byte_offset as u32, (value & 0xFF) as u8);
    buf.set_index((byte_offset + 1) as u32, ((value >> 8) & 0xFF) as u8);
}

/// Write a `u8` at `byte_offset` in a JS `Uint8Array`.
#[inline]
pub fn write_u8(buf: &Uint8Array, byte_offset: usize, value: u8) {
    buf.set_index(byte_offset as u32, value);
}

// ── Read helpers ──────────────────────────────────────────────────────────────

/// Read a `u32` little-endian from `byte_offset` in a JS `Uint8Array`.
#[inline]
pub fn read_u32(buf: &Uint8Array, byte_offset: usize) -> u32 {
    buf.get_index(byte_offset as u32) as u32
        | (buf.get_index((byte_offset + 1) as u32) as u32) << 8
        | (buf.get_index((byte_offset + 2) as u32) as u32) << 16
        | (buf.get_index((byte_offset + 3) as u32) as u32) << 24
}

/// Read a `u16` little-endian from `byte_offset` in a JS `Uint8Array`.
#[inline]
pub fn read_u16(buf: &Uint8Array, byte_offset: usize) -> u16 {
    buf.get_index(byte_offset as u32) as u16 | (buf.get_index((byte_offset + 1) as u32) as u16) << 8
}

// ── Bulk flush (hot path) ─────────────────────────────────────────────────────

/// Copy a Rust-owned byte slice to a JS `Uint8Array` in a single FFI call.
///
/// Use this on hot paths: build your data in a `Vec<u8>` locally (zero FFI),
/// then flush in one shot. Reduces WASM→JS crossings from O(N) to O(1).
#[inline]
pub fn flush_local_to_js(buf: &Uint8Array, local: &[u8]) {
    buf.copy_from(local);
}
