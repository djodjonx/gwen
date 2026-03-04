//! Shared utilities for GWEN WASM plugins.
//!
//! # Modules
//! - `buffer` — Read/write helpers for `js_sys::Uint8Array` (little-endian).
//! - `ring`   — Ring-buffer writer for the GWEN binary event protocol.
//! - `debug`  — Sentinel canary helpers for buffer overrun detection.

pub mod buffer;
pub mod ring;
pub mod debug;

