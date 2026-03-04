//! wasm-bindgen exports for the physics plugin.
//!
//! `Physics2DPlugin` is the struct exposed to JavaScript/TypeScript.
//! All heavy computation happens in `PhysicsWorld` — this file is only
//! the thin FFI boundary.

use js_sys::Uint8Array;
use wasm_bindgen::prelude::*;

use crate::components::{BodyType, PhysicsMaterial};
use crate::world::PhysicsWorld;

/// 2D physics plugin exposed to JavaScript via wasm-bindgen.
///
/// # Lifecycle (called by TypeScript `Physics2DPlugin`)
/// 1. `new(grav_x, grav_y, shared_buf, max_entities)` — construction
/// 2. Each frame: `step(delta)`
/// 3. On entity creation: `add_rigid_body(...)`, `add_box_collider(...)` / `add_ball_collider(...)`
/// 4. On entity destruction: `remove_rigid_body(entity_index)`
/// 5. After `step()`: `get_collision_events()` → JSON string parsed by TS
///
/// ## Shared memory
/// `shared_buf` is a `Uint8Array` view over the slice of gwen-core's linear
/// memory allocated by `SharedMemoryManager.allocateRegion()`.
/// Because two WASM modules have separate linear memories, a raw `usize`
/// pointer is meaningless across the boundary — only a JS-typed-array
/// reference gives physics2d legitimate access to gwen-core's buffer.
#[wasm_bindgen]
pub struct Physics2DPlugin {
    world: PhysicsWorld,
    /// JS Uint8Array view over gwen-core's shared buffer slice.
    shared_buf: Uint8Array,
    max_entities: u32,
}

#[wasm_bindgen]
impl Physics2DPlugin {
    /// Create the plugin.
    ///
    /// * `gravity_x` / `gravity_y` — gravity vector (m/s²).
    /// * `shared_buf` — `Uint8Array` view returned by
    ///   `SharedMemoryManager.allocateRegion().buffer` on the TS side.
    /// * `max_entities` — number of entity slots in the shared buffer.
    #[wasm_bindgen(constructor)]
    pub fn new(gravity_x: f32, gravity_y: f32, shared_buf: Uint8Array, max_entities: u32) -> Self {
        Physics2DPlugin {
            world: PhysicsWorld::new(gravity_x, gravity_y),
            shared_buf,
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
    /// Replace the shared buffer view after a gwen-core memory.grow() event.
    /// The old ArrayBuffer is detached — pass the fresh Uint8Array here.
    pub fn update_shared_buf(&mut self, new_buf: Uint8Array) {
        self.shared_buf = new_buf;
    }

    pub fn add_rigid_body(
        &mut self,
        entity_index: u32,
        x: f32,
        y: f32,
        body_type: u8,
    ) -> u32 {
        if entity_index >= self.max_entities {
            // Explicit warning — most common cause: passing a packed EntityId (gen<<20|index)
            // instead of the raw slot index. Use (id & 0xFFFFF) on the TS side.
            js_sys::eval(&format!(
                "console.warn('[Physics2D] add_rigid_body: entity_index {} >= max_entities {} — \
                 did you pass a packed EntityId? Use (id & 0xFFFFF) to get the slot index.')",
                entity_index, self.max_entities
            )).ok();
            return u32::MAX;
        }
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
        self.world.remove_rigid_body(entity_index, &self.shared_buf);
    }

    /// Directly set the next kinematic position for an entity.
    /// Call every frame from TS to drive kinematic bodies at the correct
    /// physics scale (metres, not pixels).
    pub fn set_kinematic_position(&mut self, entity_index: u32, x: f32, y: f32) {
        self.world.set_kinematic_position(entity_index, x, y);
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
        self.world.write_positions_to_buffer(&self.shared_buf, self.max_entities);
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

