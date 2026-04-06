# Writing a Custom WASM Plugin

This guide explains how to write a community WASM plugin for GWEN using Rust
and the `gwen-wasm-utils` crate. Custom plugins integrate with the engine's
`loadWasmModule()` API (RFC-008).

## Prerequisites

- Rust toolchain with the `wasm32-unknown-unknown` target:
  ```bash
  rustup target add wasm32-unknown-unknown
  ```
- `wasm-pack` for building:
  ```bash
  cargo install wasm-pack
  ```

## Project Setup

```bash
cargo new --lib my-gwen-plugin
```

`Cargo.toml`:
```toml
[package]
name = "my-gwen-plugin"
version = "1.0.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
gwen-wasm-utils = "0.1"   # provides gwen_channel!, RingWriter, HEADER_BYTES
```

## Declaring a Channel

Use the `gwen_channel!()` macro to declare a ring-buffer channel. This places
the buffer in the WASM **data segment** (not the heap), so the engine can
locate it before any Rust code runs.

```rust
// src/lib.rs
use gwen_wasm_utils::gwen_channel;

// Channel: capacity 128, 16 bytes per event, plugin version 1.0.0
gwen_channel!(physics_events, 128, 16, version = 1_000_000);
```

Generated exports:
- `gwen_physics_events_ring_ptr() -> i32` — buffer address (auto-detected by engine)
- `gwen_physics_events_ring_cap() -> i32` — capacity
- `gwen_physics_events_ring_item_size() -> i32` — item size
- `gwen_plugin_api_version() -> i32` — returns `1_000_000`

## Accessing the Transform Buffer (optional)

The engine automatically injects three host functions into every WASM module's
import object under the `gwen` namespace. Declare them as `extern "C"` in Rust
and call them once in your `init()` function to cache the values:

```rust
extern "C" {
    fn gwen_transform_buffer_ptr() -> i32;
    fn gwen_transform_stride() -> i32;
    fn gwen_max_entities() -> i32;
}

static mut TRANSFORM_PTR: i32 = 0;
static mut STRIDE: i32 = 0;

#[no_mangle]
pub extern "C" fn init() {
    unsafe {
        TRANSFORM_PTR = gwen_transform_buffer_ptr();
        STRIDE = gwen_transform_stride();
    }
}
```

## Building

```bash
# Raw .wasm (no JS bindings needed for engine integration)
cargo build --target wasm32-unknown-unknown --release
# Output: target/wasm32-unknown-unknown/release/my_gwen_plugin.wasm
```

## Loading from TypeScript

```typescript
import { createEngine } from '@gwenjs/core';

const engine = await createEngine(config);

const handle = await engine.loadWasmModule({
  name: 'my-plugin',
  url: '/my_gwen_plugin.wasm',
  channels: [
    {
      name: 'physics_events',
      direction: 'wasm→ts',
      capacity: 128,
      itemByteSize: 16,
    },
  ],
  expectedVersion: 1_000_000,    // expect v1.0.0
  versionPolicy: 'warn',         // log warning if mismatch (default)
  step(handle, dt) {
    const dest = new Uint8Array(16);
    while (handle.channel('physics_events').pop(dest)) {
      // process event bytes in dest
    }
  },
});
```

## Version Encoding

| Semantic version | Encoded value |
|---|---|
| `1.0.0` | `1_000_000` |
| `1.2.3` | `1_002_003` |
| `2.0.0` | `2_000_000` |

Pass `version = N` as the fourth argument to `gwen_channel!()`. The engine
checks it against `expectedVersion` and applies `versionPolicy` (default: `'warn'`).
