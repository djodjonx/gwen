//! PhysicsWorld — Rapier2D pipeline + ECS mapping.
//!
//! Encapsulates the full Rapier2D simulation state and maintains a
//! bidirectional mapping between GWEN entity indices (u32) and Rapier
//! `RigidBodyHandle`s.

use crate::components::{BodyOptions, BodyType, ColliderOptions};
use gwen_wasm_utils::buffer::{flush_local_to_js, write_u16, write_u32, write_u8};
use gwen_wasm_utils::ring::RingWriter;
use js_sys::Uint8Array;
use rapier2d::prelude::*;
use std::collections::{HashMap, HashSet};

const MIN_STAGED_EVENTS_CAPACITY: usize = 64;
const MAX_STAGED_EVENTS_CAPACITY: usize = 4_096;
const COLLIDER_ID_ABSENT: u32 = u32::MAX;

#[inline]
fn pack_collider_user_data(entity_index: u32, collider_id: u32) -> u128 {
    ((entity_index as u128) << 32) | (collider_id as u128)
}

#[inline]
fn unpack_collider_user_data(user_data: u128) -> (u32, Option<u32>) {
    let entity_index = (user_data >> 32) as u32;
    let collider_id = (user_data & 0xffff_ffff) as u32;
    let resolved = if collider_id == COLLIDER_ID_ABSENT {
        None
    } else {
        Some(collider_id)
    };
    (entity_index, resolved)
}

// ─── Sensor state ─────────────────────────────────────────────────────────────

/// Persistent sensor contact state tracked per (entity, sensor_id) pair.
///
/// `sensor_id` is an opaque u32 assigned by the caller (typically a bit index
/// matching a physics layer, or an arbitrary identifier for named sensors).
/// The core never interprets the id — the mapping is entirely up to the caller.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SensorState {
    /// Number of distinct overlapping contacts in the current frame.
    pub contact_count: u32,
    /// Whether at least one contact is active *right now*.
    pub is_active: bool,
}

impl Default for SensorState {
    fn default() -> Self {
        SensorState { contact_count: 0, is_active: false }
    }
}

/// Compact key: (entity_index, sensor_id).
type SensorKey = (u32, u32);

// ─── Collision event ─────────────────────────────────────────────────────────

/// A contact event produced during `step()`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PhysicsCollisionEvent {
    pub entity_a: u32,
    pub entity_b: u32,
    pub collider_a_id: Option<u32>,
    pub collider_b_id: Option<u32>,
    /// `true` = contact started, `false` = contact stopped.
    pub started: bool,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct EventPipelineMetrics {
    pub frame: u32,
    pub dropped_critical: u32,
    pub dropped_noncritical: u32,
    pub coalesced: bool,
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
        let (ea, ca) = colliders
            .get(event.collider1())
            .map(|c| unpack_collider_user_data(c.user_data))
            .unwrap_or((u32::MAX, None));
        let (eb, cb) = colliders
            .get(event.collider2())
            .map(|c| unpack_collider_user_data(c.user_data))
            .unwrap_or((u32::MAX, None));

        if ea == u32::MAX || eb == u32::MAX {
            return; // collider not found — skip
        }

        // SAFETY: single-threaded WASM, no concurrent access
        unsafe {
            (*self.collisions.get()).push(PhysicsCollisionEvent {
                entity_a: ea,
                entity_b: eb,
                collider_a_id: ca,
                collider_b_id: cb,
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
    /// Internal tilemap chunk bodies keyed by hashed chunk id.
    chunk_to_body: HashMap<u32, RigidBodyHandle>,
    /// Direct lookup: raw slot index (as returned by add_rigid_body) → full handle.
    /// Avoids O(n) scan and generation aliasing in find_handle.
    handle_by_raw: HashMap<u32, RigidBodyHandle>,
    pub collision_events: Vec<PhysicsCollisionEvent>,
    frame_index: u32,
    coalesce_events: bool,
    staged_events_capacity: usize,
    dropped_critical_since_read: u32,
    dropped_noncritical_since_read: u32,
    /// Persistent sensor contact states keyed by (entity_index, sensor_id).
    sensor_states: HashMap<SensorKey, SensorState>,
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
            chunk_to_body: HashMap::new(),
            handle_by_raw: HashMap::new(),
            collision_events: Vec::with_capacity(MIN_STAGED_EVENTS_CAPACITY),
            frame_index: 0,
            coalesce_events: true,
            staged_events_capacity: MIN_STAGED_EVENTS_CAPACITY,
            dropped_critical_since_read: 0,
            dropped_noncritical_since_read: 0,
            sensor_states: HashMap::new(),
        }
    }

    // ── Body management ───────────────────────────────────────────────────

    pub fn add_rigid_body(
        &mut self,
        entity_index: u32,
        x: f32,
        y: f32,
        body_type: BodyType,
        opts: BodyOptions,
    ) -> u32 {
        self.remove_body_internal(entity_index);

        let mut builder = match body_type {
            BodyType::Fixed => RigidBodyBuilder::fixed(),
            BodyType::Dynamic => RigidBodyBuilder::dynamic()
                .additional_mass(opts.mass)
                .sleeping(false),
            BodyType::Kinematic => RigidBodyBuilder::kinematic_position_based(),
        };

        builder = builder
            .translation(vector![x, y])
            .gravity_scale(opts.gravity_scale)
            .linear_damping(opts.linear_damping)
            .angular_damping(opts.angular_damping);

        let mut rb = builder.build();
        rb.wake_up(true);

        if body_type == BodyType::Dynamic {
            let (vx, vy) = opts.initial_velocity;
            if vx != 0.0 || vy != 0.0 {
                rb.set_linvel(vector![vx, vy], true);
            }
        }

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
        opts: ColliderOptions,
    ) {
        if let Some(handle) = self.find_handle(body_handle_raw) {
            let entity_index = self
                .body_to_entity
                .get(&handle)
                .copied()
                .unwrap_or(u32::MAX);
            let groups = rapier2d::geometry::Group::from_bits_truncate(opts.groups.membership)
                .into();
            let filter = rapier2d::geometry::Group::from_bits_truncate(opts.groups.filter)
                .into();
            let builder = ColliderBuilder::cuboid(hw, hh)
                .translation(vector![opts.offset_x, opts.offset_y])
                .restitution(opts.material.restitution)
                .friction(opts.material.friction)
                .density(opts.density)
                .sensor(opts.is_sensor)
                .collision_groups(rapier2d::geometry::InteractionGroups::new(groups, filter))
                .user_data(pack_collider_user_data(entity_index, opts.collider_id))
                .active_events(ActiveEvents::COLLISION_EVENTS)
                .active_collision_types(
                    ActiveCollisionTypes::DYNAMIC_KINEMATIC
                        | ActiveCollisionTypes::KINEMATIC_KINEMATIC
                        | ActiveCollisionTypes::KINEMATIC_FIXED
                        | ActiveCollisionTypes::DYNAMIC_DYNAMIC,
                );
            let collider = builder.build();
            self.collider_set
                .insert_with_parent(collider, handle, &mut self.rigid_body_set);
        }
    }

    pub fn add_ball_collider(
        &mut self,
        body_handle_raw: u32,
        radius: f32,
        opts: ColliderOptions,
    ) {
        if let Some(handle) = self.find_handle(body_handle_raw) {
            let entity_index = self
                .body_to_entity
                .get(&handle)
                .copied()
                .unwrap_or(u32::MAX);
            let groups = rapier2d::geometry::Group::from_bits_truncate(opts.groups.membership)
                .into();
            let filter = rapier2d::geometry::Group::from_bits_truncate(opts.groups.filter)
                .into();
            let collider = ColliderBuilder::ball(radius)
                .translation(vector![opts.offset_x, opts.offset_y])
                .restitution(opts.material.restitution)
                .friction(opts.material.friction)
                .density(opts.density)
                .sensor(opts.is_sensor)
                .collision_groups(rapier2d::geometry::InteractionGroups::new(groups, filter))
                .user_data(pack_collider_user_data(entity_index, opts.collider_id))
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
            self.clear_sensor_states_for_entity(entity_index);
        }
    }

    /// Remove body and all its colliders from Rapier.
    /// Does NOT touch any shared buffer — managed by the PluginDataBus lifecycle.
    pub fn remove_rigid_body(&mut self, entity_index: u32) {
        self.remove_body_internal(entity_index);
    }

    /// Create or replace a fixed body used to host one tilemap chunk.
    ///
    /// `pseudo_entity_index` is stored in collider user_data so collision events
    /// can identify the static chunk side without colliding with real ECS slots.
    pub fn load_tilemap_chunk_body(
        &mut self,
        chunk_id: u32,
        pseudo_entity_index: u32,
        x: f32,
        y: f32,
    ) -> u32 {
        self.unload_tilemap_chunk_body(chunk_id);

        let handle = self
            .rigid_body_set
            .insert(RigidBodyBuilder::fixed().translation(vector![x, y]).build());
        let raw = handle.0.into_raw_parts().0;

        self.chunk_to_body.insert(chunk_id, handle);
        self.body_to_entity.insert(handle, pseudo_entity_index);
        self.handle_by_raw.insert(raw, handle);

        raw
    }

    /// Remove a previously loaded tilemap chunk body and all attached colliders.
    pub fn unload_tilemap_chunk_body(&mut self, chunk_id: u32) {
        if let Some(handle) = self.chunk_to_body.remove(&chunk_id) {
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

    // ── Sensor state ──────────────────────────────────────────────────────

    /// Record a contact event for a sensor identified by `sensor_id`.
    ///
    /// Call this after normalizing collision events, once per started/stopped
    /// contact pair where at least one side is a sensor. The caller decides
    /// which entity owns the sensor and which id to use.
    ///
    /// `started = true` increments the contact count; `started = false` decrements it.
    /// The `is_active` flag is kept consistent automatically.
    pub fn update_sensor_state(&mut self, entity_index: u32, sensor_id: u32, started: bool) {
        let entry = self.sensor_states.entry((entity_index, sensor_id)).or_default();
        if started {
            entry.contact_count = entry.contact_count.saturating_add(1);
        } else {
            entry.contact_count = entry.contact_count.saturating_sub(1);
        }
        entry.is_active = entry.contact_count > 0;
    }

    /// Read the current sensor state for (entity_index, sensor_id).
    /// Returns `SensorState::default()` (inactive, 0 contacts) if not found.
    pub fn get_sensor_state(&self, entity_index: u32, sensor_id: u32) -> SensorState {
        self.sensor_states
            .get(&(entity_index, sensor_id))
            .copied()
            .unwrap_or_default()
    }

    /// Remove all sensor states associated with a given entity.
    /// Call this when the entity is destroyed to avoid stale entries.
    pub fn clear_sensor_states_for_entity(&mut self, entity_index: u32) {
        self.sensor_states.retain(|(entity, _), _| *entity != entity_index);
    }

    /// Remove a single sensor state entry.
    pub fn remove_sensor_state(&mut self, entity_index: u32, sensor_id: u32) {
        self.sensor_states.remove(&(entity_index, sensor_id));
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

        self.frame_index = self.frame_index.saturating_add(1);
        self.collision_events = self.normalize_collision_events(collector.take());
        self.rebalance_event_capacity();
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

    /// Set the linear velocity of an entity's rigid body directly (m/s).
    pub fn set_linear_velocity(&mut self, entity_index: u32, vx: f32, vy: f32) {
        if let Some(handle) = self.entity_to_body.get(&entity_index) {
            if let Some(body) = self.rigid_body_set.get_mut(*handle) {
                body.wake_up(true);
                body.set_linvel(vector![vx, vy], true);
            }
        }
    }

    /// Read the current linear velocity of an entity's rigid body (m/s).
    pub fn get_linear_velocity(&self, entity_index: u32) -> Option<(f32, f32)> {
        let handle = self.entity_to_body.get(&entity_index)?;
        let body = self.rigid_body_set.get(*handle)?;
        let v = body.linvel();
        Some((v.x, v.y))
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
    /// Format per event (19 bytes):
    /// ```text
    /// [type u16 = 0][slotA u32][slotB u32][aColliderId u32][bColliderId u32][flags u8]
    /// ```
    ///
    /// The TypeScript engine resets both heads to 0 at the start of each frame
    /// (before `step()`) — this function only appends.
    pub fn write_events_to_buffer(&mut self, buf: &Uint8Array) {
        if self.collision_events.is_empty() {
            return;
        }

        let writer = RingWriter::new(buf, 19);
        let (selected_events, dropped_critical, dropped_noncritical) =
            self.select_events_for_capacity(writer.capacity());

        self.dropped_critical_since_read = self
            .dropped_critical_since_read
            .saturating_add(dropped_critical);
        self.dropped_noncritical_since_read = self
            .dropped_noncritical_since_read
            .saturating_add(dropped_noncritical);

        for ev in &selected_events {
            if let Some(offset) = writer.next_write_offset() {
                write_u16(buf, offset, 0u16); // type = 0 (collision)
                write_u32(buf, offset + 2, ev.entity_a);
                write_u32(buf, offset + 6, ev.entity_b);
                write_u32(
                    buf,
                    offset + 10,
                    ev.collider_a_id.unwrap_or(COLLIDER_ID_ABSENT),
                );
                write_u32(
                    buf,
                    offset + 14,
                    ev.collider_b_id.unwrap_or(COLLIDER_ID_ABSENT),
                );
                write_u8(buf, offset + 18, if ev.started { 1 } else { 0 });
                writer.advance();
            }
        }
    }

    pub fn set_event_coalescing(&mut self, enabled: bool) {
        self.coalesce_events = enabled;
    }

    pub fn consume_event_metrics(&mut self) -> EventPipelineMetrics {
        let metrics = EventPipelineMetrics {
            frame: self.frame_index,
            dropped_critical: self.dropped_critical_since_read,
            dropped_noncritical: self.dropped_noncritical_since_read,
            coalesced: self.coalesce_events,
        };
        self.dropped_critical_since_read = 0;
        self.dropped_noncritical_since_read = 0;
        metrics
    }

    #[doc(hidden)]
    pub fn debug_ingest_collision_events(&mut self, events: Vec<PhysicsCollisionEvent>) {
        self.collision_events = self.normalize_collision_events(events);
        self.rebalance_event_capacity();
    }

    #[doc(hidden)]
    pub fn debug_select_events_for_capacity(
        &self,
        capacity_events: usize,
    ) -> (Vec<PhysicsCollisionEvent>, u32, u32) {
        self.select_events_for_capacity(capacity_events)
    }

    #[doc(hidden)]
    pub fn debug_staged_events_capacity(&self) -> usize {
        self.staged_events_capacity
    }

    // ── JSON helpers ──────────────────────────────────────────────────────

    pub fn stats_json(&self) -> String {
        format!(
            r#"{{"bodies":{},"colliders":{},"eventFrame":{},"coalesced":{},"eventBufferCapacity":{},"droppedCritical":{},"droppedNonCritical":{}}}"#,
            self.rigid_body_set.len(),
            self.collider_set.len(),
            self.frame_index,
            self.coalesce_events,
            self.staged_events_capacity,
            self.dropped_critical_since_read,
            self.dropped_noncritical_since_read,
        )
    }

    // ── Internal helpers ──────────────────────────────────────────────────

    fn normalize_collision_events(
        &self,
        raw_events: Vec<PhysicsCollisionEvent>,
    ) -> Vec<PhysicsCollisionEvent> {
        if raw_events.is_empty() {
            return Vec::new();
        }

        let mut normalized = Vec::with_capacity(raw_events.len());
        let mut seen = HashSet::with_capacity(raw_events.len());

        for mut event in raw_events {
            if event.entity_a > event.entity_b {
                std::mem::swap(&mut event.entity_a, &mut event.entity_b);
                std::mem::swap(&mut event.collider_a_id, &mut event.collider_b_id);
            }

            if self.coalesce_events
                && !seen.insert((
                    event.entity_a,
                    event.entity_b,
                    event.collider_a_id,
                    event.collider_b_id,
                    event.started,
                ))
            {
                continue;
            }

            normalized.push(event);
        }

        normalized
    }

    fn rebalance_event_capacity(&mut self) {
        let len = self.collision_events.len();
        let mut target = self.collision_events.capacity().max(MIN_STAGED_EVENTS_CAPACITY);

        while len > target && target < MAX_STAGED_EVENTS_CAPACITY {
            target = (target * 2).min(MAX_STAGED_EVENTS_CAPACITY);
        }

        while len.saturating_mul(4) < target && target > MIN_STAGED_EVENTS_CAPACITY {
            target = (target / 2).max(MIN_STAGED_EVENTS_CAPACITY);
        }

        let current = self.collision_events.capacity();
        if target > current {
            self.collision_events.reserve(target - current);
        } else if target < current {
            self.collision_events.shrink_to(target);
        }

        self.staged_events_capacity = self.collision_events.capacity().max(MIN_STAGED_EVENTS_CAPACITY);
    }

    fn select_events_for_capacity(
        &self,
        capacity_events: usize,
    ) -> (Vec<PhysicsCollisionEvent>, u32, u32) {
        if capacity_events == 0 {
            let dropped_critical = self.collision_events.iter().filter(|event| event.started).count() as u32;
            let dropped_noncritical = self.collision_events.len() as u32 - dropped_critical;
            return (Vec::new(), dropped_critical, dropped_noncritical);
        }

        let mut selected = Vec::with_capacity(self.collision_events.len().min(capacity_events));
        let mut dropped_critical = 0u32;
        let mut dropped_noncritical = 0u32;

        for event in self
            .collision_events
            .iter()
            .filter(|event| event.started)
            .chain(self.collision_events.iter().filter(|event| !event.started))
        {
            if selected.len() < capacity_events {
                selected.push(event.clone());
            } else if event.started {
                dropped_critical = dropped_critical.saturating_add(1);
            } else {
                dropped_noncritical = dropped_noncritical.saturating_add(1);
            }
        }

        (selected, dropped_critical, dropped_noncritical)
    }

    /// Find a RigidBodyHandle from its raw slot index (as returned by `add_rigid_body`).
    /// O(1) — direct map lookup, no generation aliasing.
    fn find_handle(&self, raw: u32) -> Option<RigidBodyHandle> {
        self.handle_by_raw.get(&raw).copied()
    }
}
