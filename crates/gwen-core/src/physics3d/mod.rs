//! 3D physics module — Rapier3D integration for GWEN.

pub mod components;
pub mod events;
pub mod world;

pub use components::{
    BodyOptions3D, BodyType3D, ColliderOptions3D, CollisionGroups3D, PhysicsMaterial3D,
    PhysicsQualityPreset3D,
};
pub use events::{
    get_collision_event_count_3d, get_collision_events_ptr_3d, PhysicsCollisionEvent3D,
};
pub use world::PhysicsWorld3D;
