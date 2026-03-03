//! PhysicsWorld — Rapier2D pipeline + ECS mapping.
//!
//! Encapsulates the full Rapier2D simulation state and maintains a
//! bidirectional mapping between GWEN entity indices (u32) and Rapier
//! `RigidBodyHandle`s.

use std::collections::HashMap;
use rapier2d::prelude::*;
use crate::components::{BodyType, PhysicsMaterial};

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
        EventCollector { collisions: std::cell::UnsafeCell::new(Vec::new()) }
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
        _colliders: &ColliderSet,
        event: CollisionEvent,
        _contact_pair: Option<&ContactPair>,
    ) {
        // Entity indices are stored in collider user_data (set in add_*_collider)
        let ea = event.collider1().0.into_raw_parts().0 as u32;
        let eb = event.collider2().0.into_raw_parts().0 as u32;
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
    ) {}
}

// ─── PhysicsWorld ─────────────────────────────────────────────────────────────

pub struct PhysicsWorld {
    pipeline:            PhysicsPipeline,
    gravity:             Vector<f32>,
    integration_params:  IntegrationParameters,
    island_manager:      IslandManager,
    broad_phase:         DefaultBroadPhase,
    narrow_phase:        NarrowPhase,
    rigid_body_set:      RigidBodySet,
    collider_set:        ColliderSet,
    impulse_joint_set:   ImpulseJointSet,
    multibody_joint_set: MultibodyJointSet,
    ccd_solver:          CCDSolver,
    query_pipeline:      QueryPipeline,

    pub entity_to_body: HashMap<u32, RigidBodyHandle>,
    pub body_to_entity: HashMap<RigidBodyHandle, u32>,
    pub collision_events: Vec<PhysicsCollisionEvent>,
}

impl PhysicsWorld {
    pub fn new(gravity_x: f32, gravity_y: f32) -> Self {
        PhysicsWorld {
            pipeline:            PhysicsPipeline::new(),
            gravity:             vector![gravity_x, gravity_y],
            integration_params:  IntegrationParameters::default(),
            island_manager:      IslandManager::new(),
            broad_phase:         DefaultBroadPhase::new(),
            narrow_phase:        NarrowPhase::new(),
            rigid_body_set:      RigidBodySet::new(),
            collider_set:        ColliderSet::new(),
            impulse_joint_set:   ImpulseJointSet::new(),
            multibody_joint_set: MultibodyJointSet::new(),
            ccd_solver:          CCDSolver::new(),
            query_pipeline:      QueryPipeline::new(),
            entity_to_body:      HashMap::new(),
            body_to_entity:      HashMap::new(),
            collision_events:    Vec::new(),
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
        self.remove_rigid_body(entity_index);

        let mut rb = match body_type {
            BodyType::Fixed     => RigidBodyBuilder::fixed(),
            BodyType::Dynamic   => {
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
        self.entity_to_body.insert(entity_index, handle);
        self.body_to_entity.insert(handle, entity_index);

        // Return the raw slot index as an opaque handle for collider attachment
        handle.0.into_raw_parts().0 as u32
    }

    pub fn add_box_collider(
        &mut self,
        body_handle_raw: u32,
        hw: f32,
        hh: f32,
        material: PhysicsMaterial,
    ) {
        if let Some(handle) = self.find_handle(body_handle_raw) {
            let entity_index = self.body_to_entity.get(&handle).copied().unwrap_or(u32::MAX);
            let collider = ColliderBuilder::cuboid(hw, hh)
                .restitution(material.restitution)
                .friction(material.friction)
                .user_data(entity_index as u128)
                .build();
            self.collider_set.insert_with_parent(collider, handle, &mut self.rigid_body_set);
        }
    }

    pub fn add_ball_collider(
        &mut self,
        body_handle_raw: u32,
        radius: f32,
        material: PhysicsMaterial,
    ) {
        if let Some(handle) = self.find_handle(body_handle_raw) {
            let entity_index = self.body_to_entity.get(&handle).copied().unwrap_or(u32::MAX);
            let collider = ColliderBuilder::ball(radius)
                .restitution(material.restitution)
                .friction(material.friction)
                .user_data(entity_index as u128)
                .build();
            self.collider_set.insert_with_parent(collider, handle, &mut self.rigid_body_set);
        }
    }

    pub fn remove_rigid_body(&mut self, entity_index: u32) {
        if let Some(handle) = self.entity_to_body.remove(&entity_index) {
            self.body_to_entity.remove(&handle);
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
            &(),          // PhysicsHooks — unused
            &collector,   // EventHandler
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

    // ── SAB synchronisation ───────────────────────────────────────────────

    pub fn write_positions_to_buffer(&self, ptr: usize) {
        for (&entity_index, &handle) in &self.entity_to_body {
            if let Some(body) = self.rigid_body_set.get(handle) {
                let pos = body.translation();
                let rot = body.rotation().angle();
                unsafe {
                    crate::memory::write_position_rotation(ptr, entity_index, pos.x, pos.y, rot);
                    crate::memory::set_physics_active(ptr, entity_index);
                }
            }
        }
    }

    // ── JSON helpers ──────────────────────────────────────────────────────

    pub fn collision_events_json(&self) -> String {
        let mut s = String::from('[');
        for (i, ev) in self.collision_events.iter().enumerate() {
            if i > 0 { s.push(','); }
            s.push_str(&format!(
                r#"{{"a":{},"b":{},"started":{}}}"#,
                ev.entity_a, ev.entity_b, ev.started
            ));
        }
        s.push(']');
        s
    }

    pub fn stats_json(&self) -> String {
        format!(
            r#"{{"bodies":{},"colliders":{}}}"#,
            self.rigid_body_set.len(),
            self.collider_set.len(),
        )
    }

    // ── Internal helpers ──────────────────────────────────────────────────

    /// Find a RigidBodyHandle from its raw slot index (as returned by `add_rigid_body`).
    fn find_handle(&self, raw: u32) -> Option<RigidBodyHandle> {
        self.body_to_entity.keys()
            .find(|h| h.0.into_raw_parts().0 as u32 == raw)
            .copied()
    }
}
