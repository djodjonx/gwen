//! GWEN Core Engine - ECS + WASM
//!
//! High-performance game engine core for GWEN framework.
//! Provides entity component system, queries, and event handling.
//!
//! Rendering is handled in TypeScript (@gwen/engine-core).
//! This core is pure logic: ECS, transforms, physics, AI, etc.

pub mod allocator;
pub mod bindings;
pub mod component;
pub mod entity;
pub mod events;
pub mod gameloop;
pub mod query;
pub mod transform;
pub mod transform_math;

pub use component::*;
pub use entity::*;
pub use events::*;
pub use gameloop::*;
pub use query::*;
pub use transform::*;
pub use transform_math::*;
