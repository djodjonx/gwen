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

use std::cell::RefCell;
use console_error_panic_hook as panic_hook;
use js_sys::Uint8Array;
use wasm_bindgen::prelude::*;

use crate::components::{BodyOptions, BodyType, ColliderOptions, CollisionGroups, PhysicsMaterial};
use crate::world::PhysicsWorld;

const BRIDGE_SCHEMA_VERSION: u32 = 2;

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
    world: RefCell<Option<PhysicsWorld>>,
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
        // Surface Rust panic messages in browser console instead of opaque `unreachable` traps.
        panic_hook::set_once();

        Physics2DPlugin {
            world: RefCell::new(Some(PhysicsWorld::new(gravity_x, gravity_y))),
            transform_buf,
            events_buf,
            max_entities,
        }
    }

    // ── Body management ───────────────────────────────────────────────────

    /// Register a rigid body for an entity.
    ///
    /// * `entity_index`    — ECS slot index (NOT packed EntityId).
    /// * `x` / `y`         — initial world position in metres.
    /// * `body_type`        — `0` = fixed, `1` = dynamic, `2` = kinematic.
    /// * `mass`             — mass in kg (dynamic only). @default 1.0
    /// * `gravity_scale`    — gravity multiplier. @default 1.0
    /// * `linear_damping`   — linear velocity damping. @default 0.0
    /// * `angular_damping`  — angular velocity damping. @default 0.0
    /// * `vx` / `vy`        — initial linear velocity in m/s (dynamic only). @default 0.0
    ///
    /// Returns an opaque `body_handle` to use when adding colliders.
    #[allow(clippy::too_many_arguments)]
    pub fn add_rigid_body(
        &self,
        entity_index: u32,
        x: f32,
        y: f32,
        body_type: u8,
        mass: f32,
        gravity_scale: f32,
        linear_damping: f32,
        angular_damping: f32,
        vx: f32,
        vy: f32,
    ) -> u32 {
        if !x.is_finite()
            || !y.is_finite()
            || !mass.is_finite()
            || !gravity_scale.is_finite()
            || !linear_damping.is_finite()
            || !angular_damping.is_finite()
            || !vx.is_finite()
            || !vy.is_finite()
        {
            js_sys::eval("console.warn('[Physics2D] add_rigid_body rejected: non-finite input')").ok();
            return u32::MAX;
        }
        if entity_index >= self.max_entities {
            js_sys::eval(&format!(
                "console.warn('[Physics2D] add_rigid_body: entity_index {} >= max_entities {} — \
                 did you pass a packed EntityId? Use (id & 0xFFFFF) to get the slot index.')",
                entity_index, self.max_entities
            ))
            .ok();
            return u32::MAX;
        }
        let Ok(mut slot) = self.world.try_borrow_mut() else {
            js_sys::eval("console.warn('[Physics2D] add_rigid_body skipped: world lock busy')").ok();
            return u32::MAX;
        };
        let Some(world) = slot.as_mut() else {
            js_sys::eval("console.warn('[Physics2D] add_rigid_body skipped: world unavailable')").ok();
            return u32::MAX;
        };
        world.add_rigid_body(
            entity_index,
            x,
            y,
            BodyType::from_u8(body_type),
            BodyOptions {
                mass,
                gravity_scale,
                linear_damping,
                angular_damping,
                initial_velocity: (vx, vy),
            },
        )
    }

    /// Add a box (cuboid) collider to an existing rigid body.
    ///
    /// * `is_sensor`   — if `1`, generates events but no physical response.
    /// * `density`     — kg/m² (used when mass = 0). @default 1.0
    /// * `membership`  — layer bitset this collider belongs to. @default 0xFFFFFFFF (all)
    /// * `filter`      — layer bitset this collider can collide with. @default 0xFFFFFFFF (all)
    /// * `collider_id` — stable collider id propagated in collision events. @default u32::MAX
    #[allow(clippy::too_many_arguments)]
    pub fn add_box_collider(
        &self,
        body_handle: u32,
        hw: f32,
        hh: f32,
        restitution: f32,
        friction: f32,
        is_sensor: u8,
        density: f32,
        membership: u32,
        filter: u32,
        collider_id: Option<u32>,
    ) {
        if !hw.is_finite() || !hh.is_finite() || !restitution.is_finite() || !friction.is_finite() || !density.is_finite() {
            js_sys::eval("console.warn('[Physics2D] add_box_collider rejected: non-finite input')").ok();
            return;
        }
        let Ok(mut slot) = self.world.try_borrow_mut() else {
            js_sys::eval("console.warn('[Physics2D] add_box_collider skipped: world lock busy')").ok();
            return;
        };
        let Some(world) = slot.as_mut() else {
            js_sys::eval("console.warn('[Physics2D] add_box_collider skipped: world unavailable')").ok();
            return;
        };
        world.add_box_collider(
            body_handle,
            hw,
            hh,
            ColliderOptions {
                material: PhysicsMaterial { restitution, friction },
                is_sensor: is_sensor != 0,
                density,
                groups: CollisionGroups { membership, filter },
                collider_id: collider_id.unwrap_or(u32::MAX),
            },
        );
    }

    /// Add a ball (circle) collider to an existing rigid body.
    ///
    /// * `is_sensor`   — if `1`, generates events but no physical response.
    /// * `density`     — kg/m² (used when mass = 0). @default 1.0
    /// * `membership`  — layer bitset this collider belongs to. @default 0xFFFFFFFF (all)
    /// * `filter`      — layer bitset this collider can collide with. @default 0xFFFFFFFF (all)
    /// * `collider_id` — stable collider id propagated in collision events. @default u32::MAX
    pub fn add_ball_collider(
        &self,
        body_handle: u32,
        radius: f32,
        restitution: f32,
        friction: f32,
        is_sensor: u8,
        density: f32,
        membership: u32,
        filter: u32,
        collider_id: Option<u32>,
    ) {
        if !radius.is_finite() || !restitution.is_finite() || !friction.is_finite() || !density.is_finite() {
            js_sys::eval("console.warn('[Physics2D] add_ball_collider rejected: non-finite input')").ok();
            return;
        }
        let Ok(mut slot) = self.world.try_borrow_mut() else {
            js_sys::eval("console.warn('[Physics2D] add_ball_collider skipped: world lock busy')").ok();
            return;
        };
        let Some(world) = slot.as_mut() else {
            js_sys::eval("console.warn('[Physics2D] add_ball_collider skipped: world unavailable')").ok();
            return;
        };
        world.add_ball_collider(
            body_handle,
            radius,
            ColliderOptions {
                material: PhysicsMaterial { restitution, friction },
                is_sensor: is_sensor != 0,
                density,
                groups: CollisionGroups { membership, filter },
                collider_id: collider_id.unwrap_or(u32::MAX),
            },
        );
    }

    /// Remove the rigid body (and all its colliders) for an entity.
    /// Does NOT touch any shared buffer — the PluginDataBus buffers are
    /// managed entirely by the engine lifecycle.
    pub fn remove_rigid_body(&self, entity_index: u32) {
        if let Ok(mut slot) = self.world.try_borrow_mut() {
            if let Some(world) = slot.as_mut() {
                world.remove_rigid_body(entity_index);
            }
        }
    }

    /// Directly set the next kinematic position for an entity.
    pub fn set_kinematic_position(&self, entity_index: u32, x: f32, y: f32) {
        if !x.is_finite() || !y.is_finite() {
            return;
        }
        if let Ok(mut slot) = self.world.try_borrow_mut() {
            if let Some(world) = slot.as_mut() {
                world.set_kinematic_position(entity_index, x, y);
            }
        }
    }

    /// Apply a linear impulse to an entity's rigid body.
    pub fn apply_impulse(&self, entity_index: u32, x: f32, y: f32) {
        if !x.is_finite() || !y.is_finite() {
            return;
        }
        if let Ok(mut slot) = self.world.try_borrow_mut() {
            if let Some(world) = slot.as_mut() {
                world.apply_impulse(entity_index, x, y);
            }
        }
    }

    /// Set the linear velocity of an entity's rigid body directly (m/s).
    pub fn set_linear_velocity(&self, entity_index: u32, vx: f32, vy: f32) {
        if !vx.is_finite() || !vy.is_finite() {
            return;
        }
        if let Ok(mut slot) = self.world.try_borrow_mut() {
            if let Some(world) = slot.as_mut() {
                world.set_linear_velocity(entity_index, vx, vy);
            }
        }
    }

    /// Return the current linear velocity of an entity as `[vx, vy]`.
    /// Returns an empty Vec if entity/body is missing.
    pub fn get_linear_velocity(&self, entity_index: u32) -> Vec<f32> {
        let Ok(slot) = self.world.try_borrow() else {
            return Vec::new();
        };
        let Some(world) = slot.as_ref() else {
            return Vec::new();
        };
        match world.get_linear_velocity(entity_index) {
            Some((vx, vy)) => vec![vx, vy],
            None => Vec::new(),
        }
    }

    // ── Sensor state ──────────────────────────────────────────────────────

    /// Read the sensor contact state for (entity_index, sensor_id).
    ///
    /// Returns `[contact_count, is_active]` where `is_active` is 0 or 1.
    /// Returns `[0, 0]` if the sensor has never been seen.
    pub fn get_sensor_state(&self, entity_index: u32, sensor_id: u32) -> Vec<u32> {
        let Ok(slot) = self.world.try_borrow() else {
            return vec![0, 0];
        };
        let Some(world) = slot.as_ref() else {
            return vec![0, 0];
        };
        let state = world.get_sensor_state(entity_index, sensor_id);
        vec![state.contact_count, if state.is_active { 1 } else { 0 }]
    }

    /// Manually update a sensor contact state from the TS side.
    ///
    /// Useful when the game drives sensor transitions from collision events
    /// without waiting for Rust to compute them (zero-latency path).
    ///
    /// * `started = 1` → increment contact count (sensor activated)
    /// * `started = 0` → decrement contact count (sensor deactivated)
    pub fn update_sensor_state(&self, entity_index: u32, sensor_id: u32, started: u8) {
        if let Ok(mut slot) = self.world.try_borrow_mut() {
            if let Some(world) = slot.as_mut() {
                world.update_sensor_state(entity_index, sensor_id, started != 0);
            }
        }
    }

    // ── Simulation ────────────────────────────────────────────────────────

    /// Advance the simulation by `delta` seconds.
    ///
    /// After this call:
    /// - `events_buf` contains the collision events for this frame (ring buffer).
    /// - For dynamic bodies: `transform_buf` is updated with new positions.
    ///   (Currently all bodies are kinematic in space-shooter, so this is a no-op.)
    pub fn step(&self, delta: f32) {
        // First RAF tick can produce a zero (or tiny negative) delta on some runtimes.
        // This is harmless: skip this frame silently.
        if delta <= 0.0 {
            return;
        }
        if !delta.is_finite() || delta > 1.0 {
            js_sys::eval("console.warn('[Physics2D] step skipped: invalid delta')").ok();
            return;
        }

        // Take ownership out of RefCell to avoid keeping a mutable borrow flag
        // set if a panic/trap happens inside world.step().
        let mut world = {
            let Ok(mut slot) = self.world.try_borrow_mut() else {
                js_sys::eval("console.warn('[Physics2D] step skipped: world lock busy')").ok();
                return;
            };
            let Some(world) = slot.take() else {
                js_sys::eval("console.warn('[Physics2D] step skipped: world unavailable after previous trap')").ok();
                return;
            };
            world
        };

        world.step(delta);
        world.write_events_to_buffer(&self.events_buf);
        if world.has_dynamic_bodies() {
            world.write_dynamic_positions_to_buffer(&self.transform_buf, self.max_entities);
        }

        if let Ok(mut slot) = self.world.try_borrow_mut() {
            *slot = Some(world);
        }
    }

    /// Enable or disable same-frame event coalescing.
    pub fn set_event_coalescing(&self, enabled: u8) {
        if let Ok(mut slot) = self.world.try_borrow_mut() {
            if let Some(world) = slot.as_mut() {
                world.set_event_coalescing(enabled != 0);
            }
        }
    }

    /// Consume frame-local event telemetry as `[frame, droppedCritical, droppedNonCritical, coalescedFlag]`.
    pub fn consume_event_metrics(&self) -> Vec<u32> {
        let Ok(mut slot) = self.world.try_borrow_mut() else {
            return vec![0, 0, 0, 0];
        };
        let Some(world) = slot.as_mut() else {
            return vec![0, 0, 0, 0];
        };
        let metrics = world.consume_event_metrics();
        vec![
            metrics.frame,
            metrics.dropped_critical,
            metrics.dropped_noncritical,
            if metrics.coalesced { 1 } else { 0 },
        ]
    }

    // ── Queries ───────────────────────────────────────────────────────────

    /// Return the current position of an entity as `[x, y, rotation]`.
    /// Returns an empty `Vec` if the entity has no rigid body.
    pub fn get_position(&self, entity_index: u32) -> Vec<f32> {
        let Ok(slot) = self.world.try_borrow() else {
            return Vec::new();
        };
        let Some(world) = slot.as_ref() else {
            return Vec::new();
        };
        match world.get_position(entity_index) {
            Some((x, y, rot)) => vec![x, y, rot],
            None => Vec::new(),
        }
    }

    /// Return simulation statistics as a JSON string (for debug overlay).
    pub fn stats(&self) -> String {
        if let Ok(slot) = self.world.try_borrow() {
            if let Some(world) = slot.as_ref() {
                return world.stats_json();
            }
        }
        String::from(r#"{"bodies":0,"colliders":0}"#)
    }

    /// Number of entity slots reserved by this plugin instance.
    pub fn max_entities(&self) -> u32 {
        self.max_entities
    }

    /// Bridge schema version used by the TS glue layer.
    pub fn bridge_schema_version(&self) -> u32 {
        BRIDGE_SCHEMA_VERSION
    }
}
