//! GWEN Core Engine - ECS + WASM
//!
//! High-performance game engine core for GWEN framework.
//! Provides entity component system, queries, and event handling.
//!
//! Rendering is handled in TypeScript (@gwen/engine-core).
//! This core is pure logic: ECS, transforms, physics, AI, etc.

pub mod entity;
pub mod component;
pub mod query;
pub mod allocator;
pub mod events;
pub mod gameloop;
pub mod transform_math;
pub mod transform;
pub mod bindings;

pub use entity::*;
pub use component::*;
pub use query::*;
pub use events::*;
pub use gameloop::*;
pub use transform_math::*;
pub use transform::*;

