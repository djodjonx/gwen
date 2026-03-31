//! GWEN Core Engine - ECS + WASM
//!
//! High-performance game engine core for GWEN framework.
//! Provides entity component system, queries, and event handling.
//!
//! Rendering is handled in TypeScript (@gwen/engine-core).
//! This core is pure logic: ECS, transforms, physics, AI, etc.

pub mod allocator;
pub mod bindings;
pub mod ecs;
pub mod events;
pub mod gameloop;
pub mod transform;
pub mod transform_math;

#[cfg(feature = "physics2d")]
pub mod physics2d;

#[cfg(feature = "physics3d")]
pub mod physics3d;

#[cfg(all(feature = "physics2d", feature = "physics3d"))]
compile_error!("Features 'physics2d' and 'physics3d' are mutually exclusive and cannot be enabled at the same time.");

/// Shared memory layout constants re-exported for external crate consumers.
/// These values are defined in `transform` (the canonical source of truth).
pub mod shared_memory {
    pub use crate::transform::{FLAGS3D_OFFSET, FLAGS_OFFSET, TRANSFORM3D_STRIDE, TRANSFORM_STRIDE};
}

pub use ecs::*;
pub use events::*;
pub use gameloop::*;
pub use transform::*;
pub use transform_math::*;
