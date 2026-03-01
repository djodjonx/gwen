//! GWEN Core Engine - ECS + WASM
//!
//! High-performance game engine core for GWEN framework.
//! Provides entity component system, queries, and event handling.

pub mod entity;
pub mod component;
pub mod query;
pub mod allocator;
pub mod events;
pub mod gameloop;
pub mod transform_math;
pub mod transform;
pub mod renderer;
pub mod bindings;

pub use entity::*;
pub use component::*;
pub use query::*;
pub use events::*;
pub use gameloop::*;
pub use transform_math::*;
pub use transform::*;
pub use renderer::*;
pub use transform_math::*;
pub use transform::*;

