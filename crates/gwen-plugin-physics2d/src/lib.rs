//! GWEN Plugin — 2D Physics (Rapier2D)
//!
//! Standalone WASM module exposing a rigid-body physics simulation.
//! Communicates with `gwen-core` via a shared memory pointer allocated
//! by `SharedMemoryManager` in TypeScript.
//!
//! # Architecture
//! ```text
//! TypeScript (Engine)
//!   └─ SharedMemoryManager.create() → alloc_shared_buffer(gwen-core)
//!   └─ Physics2DPlugin.onInit(region)
//!        └─ new WasmPhysics2DPlugin(gravity, region.ptr)
//!
//! Each frame:
//!   gwen-core.sync_transforms_to_buffer(ptr)   ← ECS → SAB
//!   physics2d.step(delta)                       ← Rapier reads/writes SAB
//!   gwen-core.sync_transforms_from_buffer(ptr)  ← SAB → ECS
//! ```

pub mod bindings;
pub mod components;
pub mod memory;
pub mod world;

pub use bindings::Physics2DPlugin;

