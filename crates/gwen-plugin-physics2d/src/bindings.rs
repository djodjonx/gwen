//! wasm-bindgen exports for the physics plugin.
//!
//! `Physics2DPlugin` is the struct exposed to JavaScript/TypeScript.
//! All heavy computation happens in `PhysicsWorld` — this file is only
//! the thin FFI boundary.
//!
//! ## Plugin Data Bus
//! This plugin uses two JS-native `ArrayBuffer`s allocated by `PluginDataBus`:
//! - `transform_buf` — canal "transform" (TS → Rapier, kinematic positions)
//! - `events_buf`    — canal "events" (Rapier → TS, binary ring buffer)
//!
//! These buffers are completely independent of gwen-core's linear memory,
//! so `memory.grow()` events in gwen-core have zero effect on them.

use js_sys::Uint8Array;
use wasm_bindgen::prelude::*;

use crate::components::{BodyType, PhysicsMaterial};
use crate::world::PhysicsWorld;

/// 2D physics plugin exposed to JavaScript via wasm-bindgen.
///
/// # Lifecycle (called by TypeScript `Physics2DPlugin`)
/// 1. `new(grav_x, grav_y, transform_buf, events_buf, max_entities)` — construction
/// 2. Each frame: `step(delta)` — simulates + writes events to ring buffer
/// 3. On entity creation: `add_rigid_body(...)`, `add_box_collider(...)` / `add_ball_collider(...)`
/// 4. On entity destruction: `remove_rigid_body(entity_index)`
/// 5. After `step()`: TS reads `events_buf` directly (binary format, no JSON)
#[wasm_bindgen]
pub struct Physics2DPlugin {
    world: PhysicsWorld,
    /// Canal "transform" — JS-native ArrayBuffer from PluginDataBus.
    /// Layout: maxEntities × 20 bytes (pos_x f32, pos_y f32, rot f32, scale_x f32, scale_y f32)
    transform_buf: Uint8Array,
    /// Canal "events" — ring-buffer JS-native ArrayBuffer from PluginDataBus.
    /// Header: [write_head u32][read_head u32] = 8 bytes
    /// Body:   capacityEvents × 11 bytes = [type u16][slotA u32][slotB u32][flags u8]
    events_buf: Uint8Array,
    max_entities: u32,
}

#[wasm_bindgen]
impl Physics2DPlugin {
    /// Create the plugin.
    ///
    /// * `gravity_x` / `gravity_y` — gravity vector (m/s²).
    /// * `transform_buf` — `Uint8Array` over a JS-native ArrayBuffer from PluginDataBus.
    /// * `events_buf`    — `Uint8Array` over a JS-native ring-buffer from PluginDataBus.
    /// * `max_entities`  — number of entity slots.
    #[wasm_bindgen(constructor)]
    pub fn new(
        gravity_x: f32,
        gravity_y: f32,
        transform_buf: Uint8Array,
        events_buf: Uint8Array,
        max_entities: u32,
    ) -> Self {
        Physics2DPlugin {
            world: PhysicsWorld::new(gravity_x, gravity_y),
            transform_buf,
            events_buf,
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
    pub fn add_rigid_body(&mut self, entity_index: u32, x: f32, y: f32, body_type: u8) -> u32 {
        if entity_index >= self.max_entities {
            js_sys::eval(&format!(
                "console.warn('[Physics2D] add_rigid_body: entity_index {} >= max_entities {} — \
                 did you pass a packed EntityId? Use (id & 0xFFFFF) to get the slot index.')",
                entity_index, self.max_entities
            ))
            .ok();
            return u32::MAX;
        }
        self.world
            .add_rigid_body(entity_index, x, y, BodyType::from_u8(body_type))
    }

    /// Add a box (cuboid) collider to an existing rigid body.
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
            PhysicsMaterial {
                restitution,
                friction,
            },
        );
    }

    /// Add a ball (circle) collider to an existing rigid body.
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
            PhysicsMaterial {
                restitution,
                friction,
            },
        );
    }

    /// Remove the rigid body (and all its colliders) for an entity.
    /// Does NOT touch any shared buffer — the PluginDataBus buffers are
    /// managed entirely by the engine lifecycle.
    pub fn remove_rigid_body(&mut self, entity_index: u32) {
        self.world.remove_rigid_body(entity_index);
    }

    /// Directly set the next kinematic position for an entity.
    pub fn set_kinematic_position(&mut self, entity_index: u32, x: f32, y: f32) {
        self.world.set_kinematic_position(entity_index, x, y);
    }

    /// Apply a linear impulse to an entity's rigid body.
    pub fn apply_impulse(&mut self, entity_index: u32, x: f32, y: f32) {
        self.world.apply_impulse(entity_index, x, y);
    }

    // ── Simulation ────────────────────────────────────────────────────────

    /// Advance the simulation by `delta` seconds.
    ///
    /// After this call:
    /// - `events_buf` contains the collision events for this frame (ring buffer).
    /// - For dynamic bodies: `transform_buf` is updated with new positions.
    ///   (Currently all bodies are kinematic in space-shooter, so this is a no-op.)
    pub fn step(&mut self, delta: f32) {
        self.world.step(delta);

        // Write collision events to the binary ring buffer (TS reads them after step)
        self.world.write_events_to_buffer(&self.events_buf);

        // Write positions for dynamic bodies only (kinematic = TS drives them)
        if self.world.has_dynamic_bodies() {
            self.world
                .write_dynamic_positions_to_buffer(&self.transform_buf, self.max_entities);
        }
    }

    // ── Queries ───────────────────────────────────────────────────────────

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
