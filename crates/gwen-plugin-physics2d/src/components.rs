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
    Fixed = 0,
    /// Fully simulated: affected by gravity, forces, and collisions.
    Dynamic = 1,
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

impl PhysicsMaterial {
    pub const DEFAULT: Self = PhysicsMaterial {
        restitution: 0.0,
        friction: 0.5,
    };

    pub const ICE: Self = PhysicsMaterial {
        restitution: 0.0,
        friction: 0.02,
    };

    pub const RUBBER: Self = PhysicsMaterial {
        restitution: 0.85,
        friction: 1.2,
    };
}

impl Default for PhysicsMaterial {
    fn default() -> Self {
        PhysicsMaterial::DEFAULT
    }
}

// ─── Body options ─────────────────────────────────────────────────────────────

/// Extended options for rigid body creation.
#[derive(Debug, Clone, Copy)]
pub struct BodyOptions {
    /// Mass override in kg. 0.0 = use collider density. @default 1.0
    pub mass: f32,
    /// Gravity scale multiplier. 0.0 = no gravity, 1.0 = normal. @default 1.0
    pub gravity_scale: f32,
    /// Linear velocity damping ≥ 0. @default 0.0
    pub linear_damping: f32,
    /// Angular velocity damping ≥ 0. @default 0.0
    pub angular_damping: f32,
    /// Initial linear velocity (vx, vy) in m/s. @default (0, 0)
    pub initial_velocity: (f32, f32),
    /// Optional per-body CCD override. `None` means use global world setting.
    pub ccd_enabled: Option<bool>,
}

impl Default for BodyOptions {
    fn default() -> Self {
        BodyOptions {
            mass: 1.0,
            gravity_scale: 1.0,
            linear_damping: 0.0,
            angular_damping: 0.0,
            initial_velocity: (0.0, 0.0),
            ccd_enabled: None,
        }
    }
}

// ─── Collider options ─────────────────────────────────────────────────────────

/// Extended options for collider creation.
#[derive(Debug, Clone, Copy)]
pub struct ColliderOptions {
    /// Surface material.
    pub material: PhysicsMaterial,
    /// If true, the collider is a sensor: generates events but no physical response.
    pub is_sensor: bool,
    /// Density in kg/m². Used only when mass is 0.0. @default 1.0
    pub density: f32,
    /// Collision layer/mask filtering. @default `CollisionGroups::ALL`
    pub groups: CollisionGroups,
    /// Stable collider id propagated in collision events.
    /// `u32::MAX` means "absent" (legacy mono-collider fallback).
    pub collider_id: u32,
    /// Local collider offset in metres.
    pub offset_x: f32,
    /// Local collider offset in metres.
    pub offset_y: f32,
}

impl Default for ColliderOptions {
    fn default() -> Self {
        ColliderOptions {
            material: PhysicsMaterial::default(),
            is_sensor: false,
            density: 1.0,
            groups: CollisionGroups::ALL,
            collider_id: u32::MAX,
            offset_x: 0.0,
            offset_y: 0.0,
        }
    }
}

// ─── Collision layers / masks ─────────────────────────────────────────────────

/// Maximum number of named layers supported (one bit per layer in a u32).
pub const MAX_COLLISION_LAYERS: u32 = 32;

/// Collision filtering for a collider.
///
/// A collision is processed if and only if:
/// - `collider_A.membership & collider_B.filter != 0`  AND
/// - `collider_B.membership & collider_A.filter != 0`
///
/// Defaults: membership = ALL (0xFFFF_FFFF), filter = ALL — everything collides
/// with everything, matching Rapier's out-of-the-box behaviour.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CollisionGroups {
    /// Bitmask of layers this collider *belongs to* (which groups it is in).
    pub membership: u32,
    /// Bitmask of layers this collider *can collide with* (which groups it sees).
    pub filter: u32,
}

impl Default for CollisionGroups {
    fn default() -> Self {
        CollisionGroups {
            membership: u32::MAX,
            filter: u32::MAX,
        }
    }
}

impl CollisionGroups {
    /// `CollisionGroups` that collide with nothing (useful for ghost / trigger-only bodies).
    pub const NONE: Self = CollisionGroups {
        membership: 0,
        filter: 0,
    };

    /// `CollisionGroups` that collide with everything (default).
    pub const ALL: Self = CollisionGroups {
        membership: u32::MAX,
        filter: u32::MAX,
    };
}
