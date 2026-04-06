//! Ring-buffer channel declaration macro for WASM data segment placement.
//!
//! The `gwen_channel!()` macro declares a static mutable buffer that lives in
//! the WASM data segment at a fixed, compile-time address. This avoids allocator
//! involvement and enables TypeScript to discover the buffer address and metadata
//! before any Rust code runs, via exported C functions.
//!
//! # Example
//!
//! ```ignore
//! gwen_channel!(events, 128, 16);
//! ```
//!
//! Generates:
//! - `static mut GWEN_CHANNEL_EVENTS: [u8; 8 + 128*16]` in the data segment
//! - `pub extern "C" fn gwen_events_ring_ptr() -> i32` — buffer base address
//! - `pub extern "C" fn gwen_events_ring_cap() -> i32` — capacity (128)
//! - `pub extern "C" fn gwen_events_ring_item_size() -> i32` — item size (16)
//!
//! With `version = V`:
//!
//! ```ignore
//! gwen_channel!(events, 128, 16, version = 1_000_000);
//! ```
//!
//! Also generates:
//! - `pub extern "C" fn gwen_plugin_api_version() -> i32` — returns V

/// Internal helper macro for ring-buffer channel generation.
/// Used by `gwen_channel!()` to avoid duplication between versioned and unversioned forms.
#[doc(hidden)]
#[macro_export]
macro_rules! __gwen_channel_inner {
    ($name:ident, $capacity:expr, $item_size:expr) => {
        ::paste::paste! {
            #[allow(non_upper_case_globals)]
            /// Backing store for the ring-buffer channel.
            static mut [<GWEN_CHANNEL_ $name:upper>]: [u8;
                $crate::ring::HEADER_BYTES + $capacity * $item_size] =
                [0u8; $crate::ring::HEADER_BYTES + $capacity * $item_size];

            #[no_mangle]
            #[allow(static_mut_refs)]
            /// Returns the base address of the ring-buffer channel in WASM linear memory.
            pub extern "C" fn [<gwen_ $name _ring_ptr>]() -> i32 {
                unsafe { [<GWEN_CHANNEL_ $name:upper>].as_ptr() as i32 }
            }

            #[no_mangle]
            /// Returns the capacity (number of items) of the ring buffer.
            pub extern "C" fn [<gwen_ $name _ring_cap>]() -> i32 {
                $capacity as i32
            }

            #[no_mangle]
            /// Returns the size of each item in the ring buffer (stride in bytes).
            pub extern "C" fn [<gwen_ $name _ring_item_size>]() -> i32 {
                $item_size as i32
            }
        }
    };
}

/// Declares a ring-buffer channel in the WASM data segment.
///
/// # Arguments
///
/// - `$name` — Channel identifier (lowercase, no underscores). Used to generate
///   function names like `gwen_{name}_ring_ptr()`.
/// - `$capacity` — Number of items the ring buffer can hold.
/// - `$item_size` — Size of each item in bytes (stride).
/// - `version = $version` — (optional) Plugin API version exported as `gwen_plugin_api_version()`.
///
/// # Example
///
/// ```ignore
/// // Simple channel with no version export
/// gwen_channel!(events, 256, 12);
///
/// // Channel with API version
/// gwen_channel!(commands, 128, 8, version = 1_000_000);
/// ```
#[macro_export]
macro_rules! gwen_channel {
    ($name:ident, $capacity:expr, $item_size:expr) => {
        $crate::__gwen_channel_inner!($name, $capacity, $item_size);
    };
    ($name:ident, $capacity:expr, $item_size:expr, version = $version:expr) => {
        $crate::__gwen_channel_inner!($name, $capacity, $item_size);

        #[no_mangle]
        /// Returns the plugin API version.
        pub extern "C" fn gwen_plugin_api_version() -> i32 {
            $version
        }
    };
}
