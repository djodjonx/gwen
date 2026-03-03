//! Physics component descriptors.
//!
//! Lightweight structs used to configure rigid bodies and colliders when
//! calling `Physics2DPlugin::add_rigid_body` / `add_box_collider` etc.
//! These are pure Rust types — no wasm-bindgen needed here.

// ─── RigidBody type ───────────────────────────────────────────────────────────

/// How a rigid body interacts with the simulation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum BodyType {
    /// Immovable: never affected by forces or gravity (walls, floors).
    Fixed    = 0,
    /// Fully simulated: affected by gravity, forces, and collisions.
    Dynamic  = 1,
    /// Manually driven: velocity is set by user code, ignores forces.
    Kinematic = 2,
}

impl BodyType {
    /// Convert from the raw u8 passed through the WASM boundary.
    /// Falls back to `Fixed` for unknown values.
    pub fn from_u8(v: u8) -> Self {
        match v {
            1 => BodyType::Dynamic,
            2 => BodyType::Kinematic,
            _ => BodyType::Fixed,
        }
    }
}

// ─── Collider shape ───────────────────────────────────────────────────────────

/// Supported collider shapes.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ColliderShape {
    /// Axis-aligned bounding box.  `hw` = half-width, `hh` = half-height.
    Box { hw: f32, hh: f32 },
    /// Circle / sphere.  `radius` = radius.
    Ball { radius: f32 },
}

// ─── Material properties ──────────────────────────────────────────────────────

/// Surface material for a collider.
#[derive(Debug, Clone, Copy)]
pub struct PhysicsMaterial {
    /// Bounciness in [0, 1].  0 = no bounce, 1 = perfect elastic.
    pub restitution: f32,
    /// Friction coefficient ≥ 0.  0 = frictionless.
    pub friction: f32,
}

impl Default for PhysicsMaterial {
    fn default() -> Self {
        PhysicsMaterial { restitution: 0.0, friction: 0.5 }
    }
}

