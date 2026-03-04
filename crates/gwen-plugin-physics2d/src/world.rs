//! PhysicsWorld — Rapier2D pipeline + ECS mapping.
//!
//! Encapsulates the full Rapier2D simulation state and maintains a
//! bidirectional mapping between GWEN entity indices (u32) and Rapier
//! `RigidBodyHandle`s.

use crate::components::{BodyType, PhysicsMaterial};
use gwen_wasm_utils::buffer::{flush_local_to_js, write_u16, write_u32, write_u8};
use gwen_wasm_utils::ring::RingWriter;
use js_sys::Uint8Array;
use rapier2d::prelude::*;
use std::collections::HashMap;

// ─── Collision event ─────────────────────────────────────────────────────────

/// A contact event produced during `step()`.
#[derive(Debug, Clone)]
pub struct PhysicsCollisionEvent {
    pub entity_a: u32,
    pub entity_b: u32,
    /// `true` = contact started, `false` = contact stopped.
    pub started: bool,
}

// ─── Event collector (Send + Sync safe) ──────────────────────────────────────

/// Collects collision events. We store entity indices in collider `user_data`
/// (u128) at creation time so the handler never needs to access external maps.
struct EventCollector {
    collisions: std::cell::UnsafeCell<Vec<PhysicsCollisionEvent>>,
}

impl EventCollector {
    fn new() -> Self {
        EventCollector {
            collisions: std::cell::UnsafeCell::new(Vec::new()),
        }
    }

    fn take(self) -> Vec<PhysicsCollisionEvent> {
        self.collisions.into_inner()
    }
}

// SAFETY: PhysicsPipeline::step() is single-threaded in WASM.
unsafe impl Send for EventCollector {}
unsafe impl Sync for EventCollector {}

impl EventHandler for EventCollector {
    fn handle_collision_event(
        &self,
        _bodies: &RigidBodySet,
        colliders: &ColliderSet,
        event: CollisionEvent,
        _contact_pair: Option<&ContactPair>,
    ) {
        // Read entity_index from the collider's user_data (set in add_*_collider).
        // Do NOT use event.collider1().0.into_raw_parts() — that is the collider
        // slot index, not the entity index.
        let ea = colliders
            .get(event.collider1())
            .map(|c| c.user_data as u32)
            .unwrap_or(u32::MAX);
        let eb = colliders
            .get(event.collider2())
            .map(|c| c.user_data as u32)
            .unwrap_or(u32::MAX);

        if ea == u32::MAX || eb == u32::MAX {
            return; // collider not found — skip
        }

        // SAFETY: single-threaded WASM, no concurrent access
        unsafe {
            (*self.collisions.get()).push(PhysicsCollisionEvent {
                entity_a: ea,
                entity_b: eb,
                started: event.started(),
            });
        }
    }

    fn handle_contact_force_event(
        &self,
        _dt: f32,
        _bodies: &RigidBodySet,
        _colliders: &ColliderSet,
        _contact_pair: &ContactPair,
        _total_force_magnitude: f32,
    ) {
    }
}

// ─── PhysicsWorld ─────────────────────────────────────────────────────────────

pub struct PhysicsWorld {
    pipeline: PhysicsPipeline,
    gravity: Vector<f32>,
    integration_params: IntegrationParameters,
    island_manager: IslandManager,
    broad_phase: DefaultBroadPhase,
    narrow_phase: NarrowPhase,
    rigid_body_set: RigidBodySet,
    collider_set: ColliderSet,
    impulse_joint_set: ImpulseJointSet,
    multibody_joint_set: MultibodyJointSet,
    ccd_solver: CCDSolver,
    query_pipeline: QueryPipeline,

    pub entity_to_body: HashMap<u32, RigidBodyHandle>,
    pub body_to_entity: HashMap<RigidBodyHandle, u32>,
    /// Direct lookup: raw slot index (as returned by add_rigid_body) → full handle.
    /// Avoids O(n) scan and generation aliasing in find_handle.
    handle_by_raw: HashMap<u32, RigidBodyHandle>,
    pub collision_events: Vec<PhysicsCollisionEvent>,
}

impl PhysicsWorld {
    pub fn new(gravity_x: f32, gravity_y: f32) -> Self {
        PhysicsWorld {
            pipeline: PhysicsPipeline::new(),
            gravity: vector![gravity_x, gravity_y],
            integration_params: IntegrationParameters::default(),
            island_manager: IslandManager::new(),
            broad_phase: DefaultBroadPhase::new(),
            narrow_phase: NarrowPhase::new(),
            rigid_body_set: RigidBodySet::new(),
            collider_set: ColliderSet::new(),
            impulse_joint_set: ImpulseJointSet::new(),
            multibody_joint_set: MultibodyJointSet::new(),
            ccd_solver: CCDSolver::new(),
            query_pipeline: QueryPipeline::new(),
            entity_to_body: HashMap::new(),
            body_to_entity: HashMap::new(),
            handle_by_raw: HashMap::new(),
            collision_events: Vec::new(),
        }
    }

    // ── Body management ───────────────────────────────────────────────────

    pub fn add_rigid_body(
        &mut self,
        entity_index: u32,
        x: f32,
        y: f32,
        body_type: BodyType,
    ) -> u32 {
        // Remove any existing body without touching the shared buffer
        // (caller will re-register the new body immediately after)
        self.remove_body_internal(entity_index);

        let mut rb = match body_type {
            BodyType::Fixed => RigidBodyBuilder::fixed(),
            BodyType::Dynamic => {
                // Give dynamic bodies a minimal mass so Rapier simulates them
                // even when no collider is attached yet.
                RigidBodyBuilder::dynamic()
                    .additional_mass(1.0)
                    .sleeping(false)
            }
            BodyType::Kinematic => RigidBodyBuilder::kinematic_position_based(),
        }
        .translation(vector![x, y])
        .build();

        // Ensure the body is awake immediately
        rb.wake_up(true);

        let handle = self.rigid_body_set.insert(rb);
        let raw = handle.0.into_raw_parts().0;

        self.entity_to_body.insert(entity_index, handle);
        self.body_to_entity.insert(handle, entity_index);
        self.handle_by_raw.insert(raw, handle);

        raw
    }

    pub fn add_box_collider(
        &mut self,
        body_handle_raw: u32,
        hw: f32,
        hh: f32,
        material: PhysicsMaterial,
    ) {
        if let Some(handle) = self.find_handle(body_handle_raw) {
            let entity_index = self
                .body_to_entity
                .get(&handle)
                .copied()
                .unwrap_or(u32::MAX);
            let collider = ColliderBuilder::cuboid(hw, hh)
                .restitution(material.restitution)
                .friction(material.friction)
                .user_data(entity_index as u128)
                .active_events(ActiveEvents::COLLISION_EVENTS)
                .active_collision_types(
                    ActiveCollisionTypes::DYNAMIC_KINEMATIC
                        | ActiveCollisionTypes::KINEMATIC_KINEMATIC
                        | ActiveCollisionTypes::KINEMATIC_FIXED
                        | ActiveCollisionTypes::DYNAMIC_DYNAMIC,
                )
                .build();
            self.collider_set
                .insert_with_parent(collider, handle, &mut self.rigid_body_set);
        }
    }

    pub fn add_ball_collider(
        &mut self,
        body_handle_raw: u32,
        radius: f32,
        material: PhysicsMaterial,
    ) {
        if let Some(handle) = self.find_handle(body_handle_raw) {
            let entity_index = self
                .body_to_entity
                .get(&handle)
                .copied()
                .unwrap_or(u32::MAX);
            let collider = ColliderBuilder::ball(radius)
                .restitution(material.restitution)
                .friction(material.friction)
                .user_data(entity_index as u128)
                .active_events(ActiveEvents::COLLISION_EVENTS)
                .active_collision_types(
                    ActiveCollisionTypes::DYNAMIC_KINEMATIC
                        | ActiveCollisionTypes::KINEMATIC_KINEMATIC
                        | ActiveCollisionTypes::KINEMATIC_FIXED
                        | ActiveCollisionTypes::DYNAMIC_DYNAMIC,
                )
                .build();
            self.collider_set
                .insert_with_parent(collider, handle, &mut self.rigid_body_set);
        }
    }

    /// Remove body from Rapier sets only — does NOT touch the shared buffer.
    fn remove_body_internal(&mut self, entity_index: u32) {
        if let Some(handle) = self.entity_to_body.remove(&entity_index) {
            self.body_to_entity.remove(&handle);
            let raw = handle.0.into_raw_parts().0;
            self.handle_by_raw.remove(&raw);
            self.rigid_body_set.remove(
                handle,
                &mut self.island_manager,
                &mut self.collider_set,
                &mut self.impulse_joint_set,
                &mut self.multibody_joint_set,
                true,
            );
        }
    }

    /// Remove body and all its colliders from Rapier.
    /// Does NOT touch any shared buffer — managed by the PluginDataBus lifecycle.
    pub fn remove_rigid_body(&mut self, entity_index: u32) {
        self.remove_body_internal(entity_index);
    }

    // ── Simulation ────────────────────────────────────────────────────────

    pub fn step(&mut self, delta: f32) {
        self.integration_params.dt = delta;

        let collector = EventCollector::new();

        self.pipeline.step(
            &self.gravity,
            &self.integration_params,
            &mut self.island_manager,
            &mut self.broad_phase,
            &mut self.narrow_phase,
            &mut self.rigid_body_set,
            &mut self.collider_set,
            &mut self.impulse_joint_set,
            &mut self.multibody_joint_set,
            &mut self.ccd_solver,
            Some(&mut self.query_pipeline),
            &(),        // PhysicsHooks — unused
            &collector, // EventHandler
        );

        self.collision_events = collector.take();
    }

    // ── Queries ───────────────────────────────────────────────────────────

    pub fn get_position(&self, entity_index: u32) -> Option<(f32, f32, f32)> {
        let handle = self.entity_to_body.get(&entity_index)?;
        let body = self.rigid_body_set.get(*handle)?;
        let pos = body.translation();
        Some((pos.x, pos.y, body.rotation().angle()))
    }

    pub fn apply_impulse(&mut self, entity_index: u32, x: f32, y: f32) {
        if let Some(handle) = self.entity_to_body.get(&entity_index) {
            if let Some(body) = self.rigid_body_set.get_mut(*handle) {
                body.wake_up(true);
                body.apply_impulse(vector![x, y], true);
            }
        }
    }

    /// Directly set the next kinematic position for an entity (in metres).
    /// More reliable than SAB sync — use this from TS every frame.
    pub fn set_kinematic_position(&mut self, entity_index: u32, x: f32, y: f32) {
        if let Some(&handle) = self.entity_to_body.get(&entity_index) {
            if let Some(body) = self.rigid_body_set.get_mut(handle) {
                if body.is_kinematic() {
                    body.set_next_kinematic_position(Isometry::new(vector![x, y], 0.0));
                }
            }
        }
    }

    // ── SAB synchronisation ───────────────────────────────────────────────

    /// Write positions of **dynamic** bodies to the transform channel buffer.
    ///
    /// Kinematic bodies are driven by TS (`set_kinematic_position`) — we do
    /// NOT write them back. This avoids an unnecessary round-trip.
    ///
    /// ## Performance
    /// Builds a local Rust buffer then flushes it in one `copy_from()` call.
    pub fn write_dynamic_positions_to_buffer(&self, buf: &Uint8Array, max_entities: u32) {
        let byte_len = max_entities as usize * crate::memory::STRIDE;
        let mut local = vec![0u8; byte_len];

        for (&entity_index, &handle) in &self.entity_to_body {
            if entity_index >= max_entities {
                continue;
            }
            if let Some(body) = self.rigid_body_set.get(handle) {
                if !body.is_dynamic() {
                    continue; // skip kinematic and fixed bodies
                }
                let pos = body.translation();
                let rot = body.rotation().angle();
                crate::memory::write_position_rotation_local(
                    &mut local,
                    entity_index,
                    pos.x,
                    pos.y,
                    rot,
                );
            }
        }

        flush_local_to_js(buf, &local);
    }

    /// Returns `true` if any dynamic body is registered.
    /// Used by `step()` to skip the transform write when there are none.
    pub fn has_dynamic_bodies(&self) -> bool {
        self.entity_to_body.values().any(|&handle| {
            self.rigid_body_set
                .get(handle)
                .map(|b| b.is_dynamic())
                .unwrap_or(false)
        })
    }

    /// Write collision events from the last `step()` into the ring-buffer `buf`.
    ///
    /// Format per event (11 bytes):
    /// ```text
    /// [type u16 = 0][slotA u32][slotB u32][flags u8 — bit 0: started]
    /// ```
    ///
    /// The TypeScript engine resets both heads to 0 at the start of each frame
    /// (before `step()`) — this function only appends.
    pub fn write_events_to_buffer(&self, buf: &Uint8Array) {
        if self.collision_events.is_empty() {
            return;
        }

        let writer = RingWriter::new(buf, 11);
        for ev in &self.collision_events {
            if let Some(offset) = writer.next_write_offset() {
                write_u16(buf, offset, 0u16); // type = 0 (collision)
                write_u32(buf, offset + 2, ev.entity_a);
                write_u32(buf, offset + 6, ev.entity_b);
                write_u8(buf, offset + 10, if ev.started { 1 } else { 0 });
                writer.advance();
            } else {
                #[cfg(debug_assertions)]
                js_sys::eval("console.warn('[Physics2D] events ring buffer overflow')").ok();
                break;
            }
        }
    }

    // ── JSON helpers ──────────────────────────────────────────────────────

    pub fn stats_json(&self) -> String {
        format!(
            r#"{{"bodies":{},"colliders":{}}}"#,
            self.rigid_body_set.len(),
            self.collider_set.len(),
        )
    }

    // ── Internal helpers ──────────────────────────────────────────────────

    /// Find a RigidBodyHandle from its raw slot index (as returned by `add_rigid_body`).
    /// O(1) — direct map lookup, no generation aliasing.
    fn find_handle(&self, raw: u32) -> Option<RigidBodyHandle> {
        self.handle_by_raw.get(&raw).copied()
    }
}
