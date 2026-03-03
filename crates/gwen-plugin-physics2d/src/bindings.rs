//! wasm-bindgen exports for the physics plugin.
//!
//! `Physics2DPlugin` is the struct exposed to JavaScript/TypeScript.
//! All heavy computation happens in `PhysicsWorld` — this file is only
//! the thin FFI boundary.

use wasm_bindgen::prelude::*;

use crate::components::{BodyType, PhysicsMaterial};
use crate::world::PhysicsWorld;

/// 2D physics plugin exposed to JavaScript via wasm-bindgen.
///
/// # Lifecycle (called by TypeScript `Physics2DPlugin`)
/// 1. `new(grav_x, grav_y, shared_ptr, max_entities)` — construction
/// 2. Each frame: `step(delta)`
/// 3. On entity creation: `add_rigid_body(...)`, `add_box_collider(...)` / `add_ball_collider(...)`
/// 4. On entity destruction: `remove_rigid_body(entity_index)`
/// 5. After `step()`: `get_collision_events()` → JSON string parsed by TS
#[wasm_bindgen]
pub struct Physics2DPlugin {
    world:       PhysicsWorld,
    /// Pointer into `gwen-core`'s WASM linear memory (the shared buffer).
    shared_ptr:  usize,
    max_entities: u32,
}

#[wasm_bindgen]
impl Physics2DPlugin {
    /// Create the plugin.
    ///
    /// * `gravity_x` / `gravity_y` — gravity vector (m/s²). Typical: `0` / `-9.81`.
    /// * `shared_ptr` — pointer returned by `gwen_core::alloc_shared_buffer()`.
    ///   TypeScript obtains this via `SharedMemoryManager.create()` and passes it here.
    /// * `max_entities` — must match the value used in `alloc_shared_buffer`.
    #[wasm_bindgen(constructor)]
    pub fn new(gravity_x: f32, gravity_y: f32, shared_ptr: usize, max_entities: u32) -> Self {
        Physics2DPlugin {
            world: PhysicsWorld::new(gravity_x, gravity_y),
            shared_ptr,
            max_entities,
        }
    }

    // ── Body management ───────────────────────────────────────────────────

    /// Register a rigid body for an entity.
    ///
    /// * `entity_index` — packed `EntityId.index` from the ECS.
    /// * `x` / `y`      — initial world position (metres).
    /// * `body_type`     — `0` = fixed, `1` = dynamic, `2` = kinematic.
    ///
    /// Returns an opaque `body_handle` to use when adding colliders.
    pub fn add_rigid_body(
        &mut self,
        entity_index: u32,
        x: f32,
        y: f32,
        body_type: u8,
    ) -> u32 {
        self.world.add_rigid_body(entity_index, x, y, BodyType::from_u8(body_type))
    }

    /// Add a box (cuboid) collider to an existing rigid body.
    ///
    /// * `body_handle` — value returned by `add_rigid_body`.
    /// * `hw` / `hh`   — half-width and half-height (metres).
    pub fn add_box_collider(
        &mut self,
        body_handle: u32,
        hw: f32,
        hh: f32,
        restitution: f32,
        friction: f32,
    ) {
        self.world.add_box_collider(
            body_handle,
            hw,
            hh,
            PhysicsMaterial { restitution, friction },
        );
    }

    /// Add a ball (circle) collider to an existing rigid body.
    ///
    /// * `body_handle` — value returned by `add_rigid_body`.
    /// * `radius`      — sphere radius (metres).
    pub fn add_ball_collider(
        &mut self,
        body_handle: u32,
        radius: f32,
        restitution: f32,
        friction: f32,
    ) {
        self.world.add_ball_collider(
            body_handle,
            radius,
            PhysicsMaterial { restitution, friction },
        );
    }

    /// Remove the rigid body (and all its colliders) for an entity.
    pub fn remove_rigid_body(&mut self, entity_index: u32) {
        unsafe { crate::memory::clear_physics_active(self.shared_ptr, entity_index); }
        self.world.remove_rigid_body(entity_index);
    }

    /// Apply a linear impulse to an entity's rigid body.
    /// Has no effect on fixed or non-existent bodies.
    pub fn apply_impulse(&mut self, entity_index: u32, x: f32, y: f32) {
        self.world.apply_impulse(entity_index, x, y);
    }

    // ── Simulation ────────────────────────────────────────────────────────

    /// Advance the simulation by `delta` seconds.
    ///
    /// After this call the shared buffer contains updated positions for all
    /// dynamic and kinematic bodies. `gwen_core::sync_transforms_from_buffer`
    /// can then pull them back into the ECS.
    pub fn step(&mut self, delta: f32) {
        self.world.step(delta);
        // Write updated positions back to the shared buffer
        self.world.write_positions_to_buffer(self.shared_ptr);
    }

    // ── Queries ───────────────────────────────────────────────────────────

    /// Return the collision events from the last `step()` as a JSON string.
    ///
    /// Format: `[{"a":<entity_index>,"b":<entity_index>,"started":<bool>}, ...]`
    pub fn get_collision_events(&self) -> String {
        self.world.collision_events_json()
    }

    /// Return the current position of an entity as `[x, y, rotation]`.
    /// Returns an empty `Vec` if the entity has no rigid body.
    pub fn get_position(&self, entity_index: u32) -> Vec<f32> {
        match self.world.get_position(entity_index) {
            Some((x, y, rot)) => vec![x, y, rot],
            None => Vec::new(),
        }
    }

    /// Return simulation statistics as a JSON string (for debug overlay).
    pub fn stats(&self) -> String {
        self.world.stats_json()
    }

    /// Number of entity slots reserved by this plugin instance.
    pub fn max_entities(&self) -> u32 {
        self.max_entities
    }
}

