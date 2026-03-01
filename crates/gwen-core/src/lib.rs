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
pub mod bindings;

pub use entity::*;
pub use component::*;
pub use query::*;
pub use events::*;
pub use gameloop::*;

