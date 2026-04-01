//! 2D Physics module using Rapier2D.
//!
//! This module is only active when the `physics2d` feature is enabled.

pub mod components;
pub mod events;
pub mod pathfinding;
pub mod world;

pub use components::*;
pub use events::*;
pub use pathfinding::*;
pub use world::*;
