//! PhysicsWorld3D — Rapier3D world integration for GWEN v2.
//!
//! Provides the full body management pipeline: initialization, rigid body
//! CRUD, state read/write, impulse application, collider management, collision
//! event exposure, sensor state tracking, and quality preset control.
//!
//! The world tracks entity indices → Rapier `RigidBodyHandle` mappings so the
//! TypeScript layer can address bodies by stable entity index rather than by
//! opaque Rapier handles.
//!
//! # Body kind encoding
//! The `kind` parameter used throughout this module is a `u8` discriminant:
//! - `0` — Fixed (static, infinite mass)
//! - `1` — Dynamic (fully simulated)
//! - `2` — KinematicPositionBased (driven by explicit position writes)
//! - `255` — sentinel for "not found" in `get_body_kind`
//!
//! # Collision events
//! Events are collected during [`step`] and written into the zero-copy ring
//! buffer defined in [`crate::physics3d::events`]. JavaScript reads the buffer
//! directly via pointer, then calls [`consume_events`] to advance the read
//! head.
//!
//! # Sensor states
//! For each sensor collider the world tracks `(contact_count, is_active)`.
//! These are updated automatically from `CollisionEvent::Started /
//! Stopped` events during the step and can also be overridden manually via
//! [`update_sensor_state`].

use std::collections::HashMap;
use std::num::NonZeroUsize;

use rapier3d::dynamics::RigidBodyHandle;
use rapier3d::geometry::{ColliderHandle, Group, InteractionGroups};
use rapier3d::na::{Quaternion, Translation3, UnitQuaternion};
use rapier3d::prelude::*;

use crate::physics3d::components::{
    PhysicsQualityPreset3D, QualitySolverConfig3D, quality_solver_config_3d,
};
use crate::physics3d::events::{
    PhysicsCollisionEvent3D, clear_collision_events_3d, push_collision_event_3d,
    get_collision_events_ptr_3d, get_collision_event_count_3d,
};

// ─── Constants ────────────────────────────────────────────────────────────────

/// Sentinel value stored in `user_data` when a collider has no explicit ID.
const COLLIDER_ID_ABSENT: u32 = u32::MAX;

// ─── user_data packing ────────────────────────────────────────────────────────

/// Pack `(entity_index, collider_id)` into a `u128` `user_data` field.
///
/// Layout (little-endian): bits 0–31 = `collider_id`, bits 32–63 = `entity_index`.
#[inline]
fn pack_user_data(entity_index: u32, collider_id: u32) -> u128 {
    ((entity_index as u128) << 32) | (collider_id as u128)
}

/// Unpack `user_data` into `(entity_index, Option<collider_id>)`.
///
/// Returns `None` for the collider ID component when the raw value equals
/// [`COLLIDER_ID_ABSENT`].
#[inline]
fn unpack_user_data(user_data: u128) -> (u32, Option<u32>) {
    let entity_index = (user_data >> 32) as u32;
    let collider_id_raw = (user_data & 0xffff_ffff) as u32;
    let collider_id = if collider_id_raw == COLLIDER_ID_ABSENT {
        None
    } else {
        Some(collider_id_raw)
    };
    (entity_index, collider_id)
}

// ─── Body kind helpers ────────────────────────────────────────────────────────

/// Convert a `u8` kind discriminant into a Rapier [`RigidBodyType`].
///
/// # Arguments
/// * `kind` — `0` = Fixed, `1` = Dynamic, `2` = KinematicPositionBased.
///   Any other value falls back to `Dynamic`.
#[inline]
fn kind_to_body_type(kind: u8) -> RigidBodyType {
    match kind {
        0 => RigidBodyType::Fixed,
        2 => RigidBodyType::KinematicPositionBased,
        _ => RigidBodyType::Dynamic,
    }
}

/// Convert a Rapier [`RigidBodyType`] into the `u8` kind discriminant.
///
/// Returns `255` for any unrecognised variant (acts as a "not found" sentinel).
#[inline]
fn body_type_to_kind(bt: RigidBodyType) -> u8 {
    match bt {
        RigidBodyType::Fixed => 0,
        RigidBodyType::Dynamic => 1,
        RigidBodyType::KinematicPositionBased => 2,
        _ => 255,
    }
}

// ─── Event collector ──────────────────────────────────────────────────────────

/// Rapier [`EventHandler`] implementation that writes collision events into
/// the zero-copy static ring buffer.
///
/// Instantiated per-step and passed directly to `PhysicsPipeline::step`.
/// Sensor state updates happen in a post-step pass inside [`PhysicsWorld3D::step`].
struct EventCollector3D;

impl EventHandler for EventCollector3D {
    fn handle_collision_event(
        &self,
        _bodies: &RigidBodySet,
        colliders: &ColliderSet,
        event: CollisionEvent,
        _contact_pair: Option<&ContactPair>,
    ) {
        let (ea, ca) = colliders
            .get(event.collider1())
            .map(|c| unpack_user_data(c.user_data))
            .unwrap_or((u32::MAX, None));

        let (eb, cb) = colliders
            .get(event.collider2())
            .map(|c| unpack_user_data(c.user_data))
            .unwrap_or((u32::MAX, None));

        // Skip events involving unknown/tombstone bodies.
        if ea == u32::MAX || eb == u32::MAX {
            return;
        }

        push_collision_event_3d(PhysicsCollisionEvent3D {
            entity_a: ea,
            entity_b: eb,
            flags: if event.started() { 1 } else { 0 },
            collider_a_id: ca.unwrap_or(u32::MAX) as u16,
            collider_b_id: cb.unwrap_or(u32::MAX) as u16,
        });
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

// ─── World ────────────────────────────────────────────────────────────────────

/// Manages a Rapier3D simulation world, including a mapping from ECS entity
/// indices to Rapier rigid body handles.
///
/// # Thread safety
/// This struct is `!Send + !Sync` (Rapier sets are not `Send` in WASM).
/// It must only be accessed from the single WASM thread.
pub struct PhysicsWorld3D {
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
    /// Mapping from ECS entity index → Rapier handle.
    entity_handles: HashMap<u32, RigidBodyHandle>,
    /// Mapping from `(entity_index, collider_id)` → [`ColliderHandle`].
    ///
    /// Populated by every `add_*_collider` call so that [`remove_collider`]
    /// can look up the handle without a linear scan of the collider set.
    collider_handles: HashMap<(u32, u32), ColliderHandle>,
    /// Per-sensor tracking: `(entity_index, sensor_id)` → `(contact_count, is_active)`.
    sensor_states: HashMap<(u32, u32), (u32, bool)>,
    /// When `true`, duplicate (entity_a, entity_b) pairs within the same step
    /// are coalesced into a single event before writing to the ring buffer.
    coalesce_events: bool,
    /// Current quality preset (cached to allow re-applying after init).
    quality_preset: PhysicsQualityPreset3D,
}

// ─── Shape type constants for the compound batch buffer ─────────────────────
const COMPOUND_SHAPE_BOX: u32 = 0;
const COMPOUND_SHAPE_SPHERE: u32 = 1;
const COMPOUND_SHAPE_CAPSULE: u32 = 2;

impl PhysicsWorld3D {
    /// Create a new 3D physics world with the given gravity vector.
    ///
    /// # Arguments
    /// * `gravity_x` — X component of gravity (m/s²).
    /// * `gravity_y` — Y component of gravity (m/s²). Typical value: `-9.81`.
    /// * `gravity_z` — Z component of gravity (m/s²).
    pub fn new(gravity_x: f32, gravity_y: f32, gravity_z: f32) -> Self {
        let mut world = PhysicsWorld3D {
            pipeline: PhysicsPipeline::new(),
            gravity: vector![gravity_x, gravity_y, gravity_z],
            integration_params: IntegrationParameters::default(),
            island_manager: IslandManager::new(),
            broad_phase: DefaultBroadPhase::new(),
            narrow_phase: NarrowPhase::new(),
            rigid_body_set: RigidBodySet::new(),
            collider_set: ColliderSet::new(),
            impulse_joint_set: ImpulseJointSet::new(),
            multibody_joint_set: MultibodyJointSet::new(),
            ccd_solver: CCDSolver::new(),
            entity_handles: HashMap::new(),
            collider_handles: HashMap::new(),
            sensor_states: HashMap::new(),
            coalesce_events: false,
            quality_preset: PhysicsQualityPreset3D::Medium,
        };
        // Apply the default quality preset so solver parameters are consistent.
        world.apply_quality_config(quality_solver_config_3d(PhysicsQualityPreset3D::Medium));
        world
    }

    // ── Quality preset ────────────────────────────────────────────────────────

    /// Apply a [`QualitySolverConfig3D`] directly to the integration parameters.
    fn apply_quality_config(&mut self, cfg: QualitySolverConfig3D) {
        self.integration_params.num_solver_iterations =
            NonZeroUsize::new(cfg.num_solver_iterations).unwrap_or(NonZeroUsize::MIN);
        self.integration_params.num_internal_stabilization_iterations =
            cfg.num_internal_stabilization_iterations;
        self.integration_params.max_ccd_substeps = cfg.max_ccd_substeps;
    }

    /// Select a quality preset, updating solver iteration counts immediately.
    ///
    /// | Preset  | Solver iters | Stabilization iters | CCD substeps |
    /// |---------|:------------:|:-------------------:|:------------:|
    /// | Low     | 2            | 1                   | 1            |
    /// | Medium  | 4            | 2                   | 1            |
    /// | High    | 8            | 3                   | 2            |
    /// | Esport  | 10           | 4                   | 4            |
    ///
    /// # Arguments
    /// * `preset` — `0` = Low, `1` = Medium, `2` = High, `3` = Esport.
    ///   Any unrecognised value maps to `Medium`.
    pub fn set_quality(&mut self, preset: u8) {
        let q = PhysicsQualityPreset3D::from_u8(preset);
        self.quality_preset = q;
        self.apply_quality_config(quality_solver_config_3d(q));
    }

    // ── Event coalescing ──────────────────────────────────────────────────────

    /// Enable or disable collision event coalescing.
    ///
    /// When enabled, multiple events for the same `(entity_a, entity_b)` pair
    /// generated within a single step are deduplicated — only the most recent
    /// one is kept in the ring buffer. This reduces event volume at the cost of
    /// losing intermediate state transitions.
    ///
    /// # Arguments
    /// * `enabled` — `true` to enable coalescing, `false` to disable.
    pub fn set_event_coalescing(&mut self, enabled: bool) {
        self.coalesce_events = enabled;
    }

    // ── Simulation step ───────────────────────────────────────────────────────

    /// Advance the simulation by `delta` seconds.
    ///
    /// Drains Rapier collision events into the static ring buffer defined in
    /// [`crate::physics3d::events`] and updates sensor states from
    /// started/stopped contact events.
    ///
    /// # Arguments
    /// * `delta` — Elapsed time in seconds (e.g. `0.016` for 60 Hz).
    pub fn step(&mut self, delta: f32) {
        self.integration_params.dt = delta;
        // Clear the ring buffer before generating new events for this tick.
        clear_collision_events_3d();

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
            None,
            &(),
            &EventCollector3D,
        );

        // Post-step: update sensor_states from the event buffer that was just
        // populated by EventCollector3D.  We read back the ring buffer here so
        // we don't need a second event channel.
        self.update_sensor_states_from_events();
    }

    /// Scan the current ring buffer and update `sensor_states` for any sensor
    /// collider whose contacts started or stopped this step.
    fn update_sensor_states_from_events(&mut self) {
        let count = get_collision_event_count_3d();
        if count == 0 {
            return;
        }
        // SAFETY: The pointer is valid until the next `clear_collision_events_3d()`,
        // which only happens at the top of the next `step()` call. We do not
        // mutate the buffer here.
        let ptr = get_collision_events_ptr_3d();
        for i in 0..count {
            let event = unsafe { &*ptr.add(i) };

            // collider_a sensor
            let ca_id = event.collider_a_id as u32;
            if ca_id != u32::MAX {
                let key = (event.entity_a, ca_id);
                if self.is_sensor_collider(event.entity_a, ca_id) {
                    let entry = self.sensor_states.entry(key).or_insert((0, false));
                    if event.flags & 1 != 0 {
                        // started
                        entry.0 = entry.0.saturating_add(1);
                        entry.1 = true;
                    } else {
                        // stopped
                        entry.0 = entry.0.saturating_sub(1);
                        entry.1 = entry.0 > 0;
                    }
                }
            }

            // collider_b sensor
            let cb_id = event.collider_b_id as u32;
            if cb_id != u32::MAX {
                let key = (event.entity_b, cb_id);
                if self.is_sensor_collider(event.entity_b, cb_id) {
                    let entry = self.sensor_states.entry(key).or_insert((0, false));
                    if event.flags & 1 != 0 {
                        entry.0 = entry.0.saturating_add(1);
                        entry.1 = true;
                    } else {
                        entry.0 = entry.0.saturating_sub(1);
                        entry.1 = entry.0 > 0;
                    }
                }
            }
        }
    }

    /// Returns `true` if the collider registered under `(entity_index, collider_id)`
    /// is marked as a sensor in the Rapier collider set.
    fn is_sensor_collider(&self, entity_index: u32, collider_id: u32) -> bool {
        self.collider_handles
            .get(&(entity_index, collider_id))
            .and_then(|&h| self.collider_set.get(h))
            .map(|c| c.is_sensor())
            .unwrap_or(false)
    }

    // ── Collision event buffer API ────────────────────────────────────────────

    /// Return a raw pointer to the start of the 3D collision event ring buffer.
    ///
    /// The buffer is allocated in WASM linear memory and is valid for the
    /// lifetime of the module. JavaScript should wrap it in a `Uint8Array` view
    /// of length `get_collision_event_count() * EVENT_STRIDE_3D`.
    ///
    /// # Returns
    /// Pointer (as `usize`) to the start of the [`PhysicsCollisionEvent3D`] array.
    pub fn get_collision_events_ptr(&self) -> usize {
        get_collision_events_ptr_3d() as usize
    }

    /// Return the number of collision events written since the last [`step`] call.
    pub fn get_collision_event_count(&self) -> u32 {
        get_collision_event_count_3d() as u32
    }

    /// Clear (consume) all pending collision events.
    ///
    /// Call this after JavaScript has finished reading the event buffer to
    /// signal that the events have been processed. The next [`step`] call also
    /// implicitly clears the buffer.
    pub fn consume_events(&mut self) {
        clear_collision_events_3d();
    }

    // ── Sensor state ──────────────────────────────────────────────────────────

    /// Return the sensor state for a collider as a packed `u64`.
    ///
    /// Bit layout: `bits 0–31 = contact_count (u32)`, `bit 32 = is_active (bool)`.
    ///
    /// Returns `0` (inactive, zero contacts) if no state has been recorded for
    /// the given pair.
    ///
    /// # Arguments
    /// * `entity_index` — ECS entity slot index.
    /// * `sensor_id`    — Stable collider ID used when the sensor was created.
    pub fn get_sensor_state(&self, entity_index: u32, sensor_id: u32) -> u64 {
        let (count, active) = self
            .sensor_states
            .get(&(entity_index, sensor_id))
            .copied()
            .unwrap_or((0, false));
        (count as u64) | ((active as u64) << 32)
    }

    /// Manually override the sensor state for a collider.
    ///
    /// Normally sensor state is derived automatically from collision events
    /// produced during [`step`]. Use this method when you need to reset or
    /// pre-populate the state from the JavaScript side.
    ///
    /// # Arguments
    /// * `entity_index` — ECS entity slot index.
    /// * `sensor_id`    — Stable collider ID.
    /// * `is_active`    — Whether the sensor is currently overlapping.
    /// * `count`        — Number of concurrent overlapping contacts.
    pub fn update_sensor_state(
        &mut self,
        entity_index: u32,
        sensor_id: u32,
        is_active: bool,
        count: u32,
    ) {
        self.sensor_states
            .insert((entity_index, sensor_id), (count, is_active));
    }

    // ── Body lifecycle ────────────────────────────────────────────────────────

    /// Register a new rigid body for the given entity index.
    ///
    /// # Arguments
    /// * `entity_index`    — ECS entity slot index used as the stable key.
    /// * `x`, `y`, `z`    — Initial world-space position.
    /// * `kind`            — `0` = Fixed, `1` = Dynamic, `2` = KinematicPositionBased.
    /// * `mass`            — Body mass in kg (only relevant for Dynamic bodies).
    /// * `linear_damping`  — Linear velocity damping coefficient (≥ 0).
    /// * `angular_damping` — Angular velocity damping coefficient (≥ 0).
    ///
    /// # Returns
    /// `true` if the body was created and registered. `false` if the entity
    /// index was already registered (no-op; call [`remove_body`] first).
    pub fn add_body(
        &mut self,
        entity_index: u32,
        x: f32,
        y: f32,
        z: f32,
        kind: u8,
        mass: f32,
        linear_damping: f32,
        angular_damping: f32,
    ) -> bool {
        if self.entity_handles.contains_key(&entity_index) {
            return false;
        }

        let body_type = kind_to_body_type(kind);

        let mut builder = RigidBodyBuilder::new(body_type)
            .translation(vector![x, y, z])
            .linear_damping(linear_damping)
            .angular_damping(angular_damping);

        // Apply mass only for dynamic bodies; fixed/kinematic bodies ignore it
        // in Rapier, but setting it explicitly keeps the API symmetric.
        if body_type == RigidBodyType::Dynamic {
            builder = builder.additional_mass(mass);
        }

        let handle = self.rigid_body_set.insert(builder.build());
        self.entity_handles.insert(entity_index, handle);
        true
    }

    /// Remove the rigid body associated with the given entity index.
    ///
    /// Removes all attached colliders and clears any sensor state tracked for
    /// the entity.
    ///
    /// # Arguments
    /// * `entity_index` — ECS entity slot index.
    ///
    /// # Returns
    /// `true` if a body was found and removed, `false` if none was registered.
    pub fn remove_body(&mut self, entity_index: u32) -> bool {
        if let Some(handle) = self.entity_handles.remove(&entity_index) {
            // Remove all collider handle entries that belong to this entity so
            // the map stays consistent with the collider set.
            self.collider_handles
                .retain(|&(eidx, _), _| eidx != entity_index);
            // Drop any sensor state for this entity.
            self.sensor_states
                .retain(|&(eidx, _), _| eidx != entity_index);

            self.rigid_body_set.remove(
                handle,
                &mut self.island_manager,
                &mut self.collider_set,
                &mut self.impulse_joint_set,
                &mut self.multibody_joint_set,
                // remove_attached_colliders = true
                true,
            );
            true
        } else {
            false
        }
    }

    /// Check whether a rigid body is currently registered for the entity.
    ///
    /// # Arguments
    /// * `entity_index` — ECS entity slot index.
    #[inline]
    pub fn has_body(&self, entity_index: u32) -> bool {
        self.entity_handles.contains_key(&entity_index)
    }

    // ── Collider management ───────────────────────────────────────────────────

    /// Build [`InteractionGroups`] from raw bitmask values.
    ///
    /// Rapier uses a `Group` bitflags type; this helper converts the plain
    /// `u32` values from the WASM API into the correct type.
    #[inline]
    fn make_interaction_groups(layer_bits: u32, mask_bits: u32) -> InteractionGroups {
        InteractionGroups::new(
            Group::from_bits_truncate(layer_bits),
            Group::from_bits_truncate(mask_bits),
        )
    }

    /// Finish configuring a [`ColliderBuilder`] with the shared collider
    /// parameters common to all shape types, then insert it.
    ///
    /// Returns `true` if a parent rigid body was found for the entity and the
    /// collider was inserted, or `false` if `entity_index` has no body.
    fn insert_collider(
        &mut self,
        entity_index: u32,
        collider_id: u32,
        offset_x: f32,
        offset_y: f32,
        offset_z: f32,
        is_sensor: bool,
        friction: f32,
        restitution: f32,
        layer_bits: u32,
        mask_bits: u32,
        builder: ColliderBuilder,
    ) -> bool {
        let Some(&body_handle) = self.entity_handles.get(&entity_index) else {
            return false;
        };

        let groups = Self::make_interaction_groups(layer_bits, mask_bits);
        let collider = builder
            .translation(vector![offset_x, offset_y, offset_z])
            .sensor(is_sensor)
            .friction(friction)
            .restitution(restitution)
            .collision_groups(groups)
            .user_data(pack_user_data(entity_index, collider_id))
            .active_events(ActiveEvents::COLLISION_EVENTS)
            .build();

        let ch = self.collider_set.insert_with_parent(
            collider,
            body_handle,
            &mut self.rigid_body_set,
        );
        self.collider_handles.insert((entity_index, collider_id), ch);
        true
    }

    /// Attach an axis-aligned box collider to the rigid body of an entity.
    ///
    /// # Arguments
    /// * `entity_index` — ECS entity slot index.
    /// * `half_x/y/z`  — Half-extents of the box (metres).
    /// * `offset_x/y/z`— Local-space offset from the body origin.
    /// * `is_sensor`   — If `true`, no physical response; only events.
    /// * `friction`    — Surface friction coefficient (≥ 0).
    /// * `restitution` — Bounciness in \[0, 1\].
    /// * `layer_bits`  — Collision layer bitmask.
    /// * `mask_bits`   — Collision filter bitmask.
    /// * `collider_id` — Stable ID stored in events and used as the map key.
    ///
    /// # Returns
    /// `true` on success, `false` if the entity has no registered body.
    #[allow(clippy::too_many_arguments)]
    pub fn add_box_collider(
        &mut self,
        entity_index: u32,
        half_x: f32,
        half_y: f32,
        half_z: f32,
        offset_x: f32,
        offset_y: f32,
        offset_z: f32,
        is_sensor: bool,
        friction: f32,
        restitution: f32,
        layer_bits: u32,
        mask_bits: u32,
        collider_id: u32,
    ) -> bool {
        let builder = ColliderBuilder::cuboid(half_x, half_y, half_z);
        self.insert_collider(
            entity_index,
            collider_id,
            offset_x,
            offset_y,
            offset_z,
            is_sensor,
            friction,
            restitution,
            layer_bits,
            mask_bits,
            builder,
        )
    }

    /// Attach a sphere collider to the rigid body of an entity.
    ///
    /// # Arguments
    /// * `entity_index` — ECS entity slot index.
    /// * `radius`       — Sphere radius (metres).
    /// * `offset_x/y/z`— Local-space offset from the body origin.
    /// * `is_sensor`    — If `true`, no physical response; only events.
    /// * `friction`     — Surface friction coefficient (≥ 0).
    /// * `restitution`  — Bounciness in \[0, 1\].
    /// * `layer_bits`   — Collision layer bitmask.
    /// * `mask_bits`    — Collision filter bitmask.
    /// * `collider_id`  — Stable ID stored in events and used as the map key.
    ///
    /// # Returns
    /// `true` on success, `false` if the entity has no registered body.
    #[allow(clippy::too_many_arguments)]
    pub fn add_sphere_collider(
        &mut self,
        entity_index: u32,
        radius: f32,
        offset_x: f32,
        offset_y: f32,
        offset_z: f32,
        is_sensor: bool,
        friction: f32,
        restitution: f32,
        layer_bits: u32,
        mask_bits: u32,
        collider_id: u32,
    ) -> bool {
        let builder = ColliderBuilder::ball(radius);
        self.insert_collider(
            entity_index,
            collider_id,
            offset_x,
            offset_y,
            offset_z,
            is_sensor,
            friction,
            restitution,
            layer_bits,
            mask_bits,
            builder,
        )
    }

    /// Attach a vertical capsule collider to the rigid body of an entity.
    ///
    /// The capsule is oriented along the Y axis: it extends `±half_height`
    /// metres from the centre, capped by hemispheres of `radius` metres.
    ///
    /// # Arguments
    /// * `entity_index`  — ECS entity slot index.
    /// * `radius`        — Hemisphere radius (metres).
    /// * `half_height`   — Half-height of the cylindrical shaft (metres).
    /// * `offset_x/y/z` — Local-space offset from the body origin.
    /// * `is_sensor`     — If `true`, no physical response; only events.
    /// * `friction`      — Surface friction coefficient (≥ 0).
    /// * `restitution`   — Bounciness in \[0, 1\].
    /// * `layer_bits`    — Collision layer bitmask.
    /// * `mask_bits`     — Collision filter bitmask.
    /// * `collider_id`   — Stable ID stored in events and used as the map key.
    ///
    /// # Returns
    /// `true` on success, `false` if the entity has no registered body.
    #[allow(clippy::too_many_arguments)]
    pub fn add_capsule_collider(
        &mut self,
        entity_index: u32,
        radius: f32,
        half_height: f32,
        offset_x: f32,
        offset_y: f32,
        offset_z: f32,
        is_sensor: bool,
        friction: f32,
        restitution: f32,
        layer_bits: u32,
        mask_bits: u32,
        collider_id: u32,
    ) -> bool {
        let builder = ColliderBuilder::capsule_y(half_height, radius);
        self.insert_collider(
            entity_index,
            collider_id,
            offset_x,
            offset_y,
            offset_z,
            is_sensor,
            friction,
            restitution,
            layer_bits,
            mask_bits,
            builder,
        )
    }

    /// Attach a heightfield collider to a static body.
    ///
    /// The heightfield is defined on a rows × cols grid. Each cell value is a height in
    /// *local* Y-axis units — multiply by `scale_y` to get world-space metres.
    ///
    /// # Arguments
    /// * `entity_index`  — ECS entity slot index.
    /// * `heights_flat`  — Row-major flat array of `rows × cols` height values.
    /// * `rows`          — Number of rows (Z axis).
    /// * `cols`          — Number of columns (X axis).
    /// * `scale_x`       — World-space width of the entire heightfield (metres).
    /// * `scale_y`       — World-space maximum height multiplier (metres).
    /// * `scale_z`       — World-space depth of the entire heightfield (metres).
    /// * `friction`      — Surface friction coefficient.
    /// * `restitution`   — Bounciness \[0, 1\].
    /// * `layer_bits`    — Collision layer membership bitmask.
    /// * `mask_bits`     — Collision filter bitmask.
    /// * `collider_id`   — Stable ID for event lookup.
    ///
    /// # Returns
    /// `true` on success, `false` if the entity has no body or input is invalid.
    #[allow(clippy::too_many_arguments)]
    pub fn add_heightfield_collider(
        &mut self,
        entity_index: u32,
        heights_flat: &[f32],
        rows: usize,
        cols: usize,
        scale_x: f32,
        scale_y: f32,
        scale_z: f32,
        friction: f32,
        restitution: f32,
        layer_bits: u32,
        mask_bits: u32,
        collider_id: u32,
    ) -> bool {
        if heights_flat.len() != rows * cols {
            return false;
        }
        use rapier3d::na::DMatrix;
        let matrix = DMatrix::from_row_slice(rows, cols, heights_flat);
        let builder = ColliderBuilder::heightfield(
            matrix,
            vector![scale_x, scale_y, scale_z],
        );
        self.insert_collider(
            entity_index, collider_id, 0.0, 0.0, 0.0,
            false, friction, restitution, layer_bits, mask_bits, builder,
        )
    }

    /// Replace the height data of an existing heightfield collider.
    ///
    /// Removes the old collider by `(entity_index, collider_id)` and inserts a
    /// new one with updated heights while preserving all other parameters.
    ///
    /// Returns `true` on success. Returns `false` if the entity has no body or
    /// the input dimensions are inconsistent.
    #[allow(clippy::too_many_arguments)]
    pub fn update_heightfield_collider(
        &mut self,
        entity_index: u32,
        collider_id: u32,
        heights_flat: &[f32],
        rows: usize,
        cols: usize,
        scale_x: f32,
        scale_y: f32,
        scale_z: f32,
        friction: f32,
        restitution: f32,
        layer_bits: u32,
        mask_bits: u32,
    ) -> bool {
        if let Some(&ch) = self.collider_handles.get(&(entity_index, collider_id)) {
            self.collider_set.remove(
                ch,
                &mut self.island_manager,
                &mut self.rigid_body_set,
                false,
            );
            self.collider_handles.remove(&(entity_index, collider_id));
        }
        self.add_heightfield_collider(
            entity_index, heights_flat, rows, cols,
            scale_x, scale_y, scale_z,
            friction, restitution, layer_bits, mask_bits, collider_id,
        )
    }

    /// Attach a triangle-mesh collider to a 3D body.
    ///
    /// `vertices_flat` must be a multiple of 3 floats (`[x0,y0,z0, x1,y1,z1, ...]`).
    /// `indices_flat` must be a multiple of 3 u32s (`[a0,b0,c0, ...]`).
    ///
    /// Returns `false` when the entity has no registered body, or either slice is empty.
    #[allow(clippy::too_many_arguments)]
    pub fn add_mesh_collider(
        &mut self,
        entity_index: u32,
        vertices_flat: &[f32],
        indices_flat: &[u32],
        offset_x: f32,
        offset_y: f32,
        offset_z: f32,
        is_sensor: bool,
        friction: f32,
        restitution: f32,
        layer_bits: u32,
        mask_bits: u32,
        collider_id: u32,
    ) -> bool {
        let verts: Vec<rapier3d::na::Point3<f32>> = vertices_flat
            .chunks_exact(3)
            .map(|c| rapier3d::na::Point3::new(c[0], c[1], c[2]))
            .collect();
        let idxs: Vec<[u32; 3]> = indices_flat
            .chunks_exact(3)
            .map(|c| [c[0], c[1], c[2]])
            .collect();
        if verts.is_empty() || idxs.is_empty() {
            return false;
        }
        let builder = ColliderBuilder::trimesh(verts, idxs);
        self.insert_collider(
            entity_index,
            collider_id,
            offset_x,
            offset_y,
            offset_z,
            is_sensor,
            friction,
            restitution,
            layer_bits,
            mask_bits,
            builder,
        )
    }

    /// Attach a convex-hull collider to a 3D body.
    ///
    /// `vertices_flat` must be a multiple of 3 floats (`[x0,y0,z0, x1,y1,z1, ...]`).
    /// When Rapier cannot compute a convex hull (e.g. degenerate point cloud), the
    /// function falls back to a unit sphere (`ball(0.5)`) rather than failing.
    ///
    /// Returns `false` when the entity has no registered body or the vertex slice is empty.
    #[allow(clippy::too_many_arguments)]
    pub fn add_convex_collider(
        &mut self,
        entity_index: u32,
        vertices_flat: &[f32],
        offset_x: f32,
        offset_y: f32,
        offset_z: f32,
        is_sensor: bool,
        friction: f32,
        restitution: f32,
        density: f32,
        layer_bits: u32,
        mask_bits: u32,
        collider_id: u32,
    ) -> bool {
        let verts: Vec<rapier3d::na::Point3<f32>> = vertices_flat
            .chunks_exact(3)
            .map(|c| rapier3d::na::Point3::new(c[0], c[1], c[2]))
            .collect();
        if verts.is_empty() {
            return false;
        }
        let builder = if verts.len() < 4 {
            // parry3d panics on IncompleteInput when fewer than 4 points are
            // provided; use the ball fallback directly rather than letting it panic.
            ColliderBuilder::ball(0.5)
        } else {
            ColliderBuilder::convex_hull(&verts)
                .unwrap_or_else(|| ColliderBuilder::ball(0.5))
        }
        .density(density);
        self.insert_collider(
            entity_index,
            collider_id,
            offset_x,
            offset_y,
            offset_z,
            is_sensor,
            friction,
            restitution,
            layer_bits,
            mask_bits,
            builder,
        )
    }

    /// Bulk-create N static rigid bodies with box colliders in a single call.
    ///
    /// # Arguments
    /// * `entity_indices`    — Pre-allocated ECS entity slot indices (one per body).
    /// * `positions_flat`    — Flat `[x0,y0,z0, x1,y1,z1, ...]` — must have `N × 3` elements.
    /// * `half_extents_flat` — Either `3` floats (uniform for all N) or `N × 3` floats
    ///                         (per-entity half-extents).
    /// * `friction`          — Surface friction coefficient (≥ 0).
    /// * `restitution`       — Bounciness coefficient (\[0, 1\]).
    /// * `layer_bits`        — Collision layer membership bitmask.
    /// * `mask_bits`         — Collision filter bitmask.
    ///
    /// Returns the number of bodies created. Each body uses `collider_id = 0`.
    ///
    /// # Panics
    /// Panics in debug builds if `positions_flat.len() < entity_indices.len() * 3`.
    #[allow(clippy::too_many_arguments)]
    pub fn bulk_add_static_boxes(
        &mut self,
        entity_indices: &[u32],
        positions_flat: &[f32],
        half_extents_flat: &[f32],
        friction: f32,
        restitution: f32,
        layer_bits: u32,
        mask_bits: u32,
    ) -> u32 {
        let n = entity_indices.len();
        if n == 0 {
            return 0;
        }
        let uniform_extents = half_extents_flat.len() == 3;
        let groups = Self::make_interaction_groups(layer_bits, mask_bits);
        let mut count = 0u32;

        for i in 0..n {
            let px = positions_flat[i * 3];
            let py = positions_flat[i * 3 + 1];
            let pz = positions_flat[i * 3 + 2];
            let (hx, hy, hz) = if uniform_extents {
                (half_extents_flat[0], half_extents_flat[1], half_extents_flat[2])
            } else {
                (
                    half_extents_flat[i * 3],
                    half_extents_flat[i * 3 + 1],
                    half_extents_flat[i * 3 + 2],
                )
            };
            let entity_index = entity_indices[i];

            let rb = RigidBodyBuilder::fixed()
                .translation(vector![px, py, pz])
                .build();
            let handle = self.rigid_body_set.insert(rb);
            self.entity_handles.insert(entity_index, handle);

            let collider = ColliderBuilder::cuboid(hx, hy, hz)
                .collision_groups(groups)
                .friction(friction)
                .restitution(restitution)
                .user_data(pack_user_data(entity_index, 0))
                .active_events(ActiveEvents::COLLISION_EVENTS)
                .build();
            let ch = self.collider_set.insert_with_parent(
                collider,
                handle,
                &mut self.rigid_body_set,
            );
            self.collider_handles.insert((entity_index, 0), ch);
            count += 1;
        }
        count
    }

    /// Attach multiple primitive colliders to one rigid body in a single call.
    ///
    /// This avoids N WASM round-trips for an N-shape compound body.
    ///
    /// # Buffer layout (12 `f32` per shape)
    /// `[shape_type, p0, p1, p2, p3, offset_x, offset_y, offset_z, is_sensor, friction, restitution, collider_id]`
    /// - BOX (0):     `p0=half_x, p1=half_y, p2=half_z, p3=0`
    /// - SPHERE (1):  `p0=radius, p1=p2=p3=0`
    /// - CAPSULE (2): `p0=radius, p1=half_height, p2=p3=0`
    ///
    /// Unknown shape types are silently skipped (not counted).
    ///
    /// # Returns
    /// Number of colliders successfully inserted (0 if `entity_index` has no
    /// body or `shape_data.len()` is not a multiple of 12).
    pub fn add_compound_collider(
        &mut self,
        entity_index: u32,
        shape_data: &[f32],
        layer_bits: u32,
        mask_bits: u32,
    ) -> u32 {
        const FLOATS_PER_SHAPE: usize = 12;
        if shape_data.len() % FLOATS_PER_SHAPE != 0 {
            return 0;
        }

        let mut count = 0u32;
        for chunk in shape_data.chunks_exact(FLOATS_PER_SHAPE) {
            let shape_type = chunk[0] as u32;
            let p0 = chunk[1];
            let p1 = chunk[2];
            let p2 = chunk[3];
            // chunk[4] is reserved (p3), ignored
            let ox = chunk[5];
            let oy = chunk[6];
            let oz = chunk[7];
            let is_sensor = chunk[8] != 0.0;
            let friction = chunk[9];
            let restitution = chunk[10];
            let collider_id = chunk[11] as u32;

            let builder = match shape_type {
                COMPOUND_SHAPE_BOX => ColliderBuilder::cuboid(p0, p1, p2),
                COMPOUND_SHAPE_SPHERE => ColliderBuilder::ball(p0),
                COMPOUND_SHAPE_CAPSULE => ColliderBuilder::capsule_y(p1, p0),
                _ => continue,
            };

            if self.insert_collider(
                entity_index,
                collider_id,
                ox,
                oy,
                oz,
                is_sensor,
                friction,
                restitution,
                layer_bits,
                mask_bits,
                builder,
            ) {
                count += 1;
            }
        }
        count
    }

    /// Remove a specific collider from the simulation.
    ///
    /// The rigid body the collider was attached to is not affected.
    ///
    /// # Arguments
    /// * `entity_index` — ECS entity slot index.
    /// * `collider_id`  — Stable ID that was passed when the collider was created.
    ///
    /// # Returns
    /// `true` if the collider was found and removed, `false` otherwise.
    pub fn remove_collider(&mut self, entity_index: u32, collider_id: u32) -> bool {
        let key = (entity_index, collider_id);
        let Some(ch) = self.collider_handles.remove(&key) else {
            return false;
        };
        // Also drop any sensor state for this specific collider.
        self.sensor_states.remove(&key);

        self.collider_set.remove(
            ch,
            &mut self.island_manager,
            &mut self.rigid_body_set,
            // wake_up = true so the parent body re-enters the active island.
            true,
        );
        true
    }

    // ── Kinematic body control ────────────────────────────────────────────────

    /// Set the target position and orientation of a kinematic body.
    ///
    /// Rapier interpolates between the current and next position to compute
    /// velocity, ensuring smooth collision response for kinematic bodies.
    /// Has no effect on Fixed or Dynamic bodies.
    ///
    /// # Arguments
    /// * `entity_index`    — ECS entity slot index.
    /// * `px/py/pz`        — Target world-space position.
    /// * `qx/qy/qz/qw`    — Target orientation (unit quaternion, xyzw order).
    ///
    /// # Returns
    /// `true` on success, `false` if the entity has no registered body.
    pub fn set_kinematic_position(
        &mut self,
        entity_index: u32,
        px: f32,
        py: f32,
        pz: f32,
        qx: f32,
        qy: f32,
        qz: f32,
        qw: f32,
    ) -> bool {
        let Some(&handle) = self.entity_handles.get(&entity_index) else {
            return false;
        };
        let Some(body) = self.rigid_body_set.get_mut(handle) else {
            return false;
        };
        let rotation = UnitQuaternion::new_normalize(Quaternion::new(qw, qx, qy, qz));
        let iso = Isometry::from_parts(Translation3::new(px, py, pz), rotation);
        body.set_next_kinematic_position(iso);
        true
    }

    // ── State read/write ──────────────────────────────────────────────────────

    /// Return the full rigid body state as a flat `Vec<f32>` of 13 elements.
    ///
    /// Layout: `[px, py, pz, qx, qy, qz, qw, vx, vy, vz, ax, ay, az]`
    ///
    /// - `px/py/pz` — world-space position (metres)
    /// - `qx/qy/qz/qw` — orientation as a unit quaternion
    /// - `vx/vy/vz` — linear velocity (m/s)
    /// - `ax/ay/az` — angular velocity (rad/s)
    ///
    /// # Arguments
    /// * `entity_index` — ECS entity slot index.
    ///
    /// # Returns
    /// A 13-element `Vec<f32>`, or an empty `Vec` if the entity has no body.
    pub fn get_body_state(&self, entity_index: u32) -> Vec<f32> {
        let Some(&handle) = self.entity_handles.get(&entity_index) else {
            return Vec::new();
        };
        let Some(body) = self.rigid_body_set.get(handle) else {
            return Vec::new();
        };

        let iso = body.position();
        let t = iso.translation.vector;
        let q = iso.rotation.quaternion().coords; // [x, y, z, w] from nalgebra
        let lv = body.linvel();
        let av = body.angvel();

        vec![
            t.x, t.y, t.z, // position
            q.x, q.y, q.z, q.w, // quaternion (xyzw)
            lv.x, lv.y, lv.z, // linear velocity
            av.x, av.y, av.z, // angular velocity
        ]
    }

    /// Overwrite all state fields of an existing body in one call.
    ///
    /// This is more efficient than six separate setter calls when multiple
    /// fields need to be written at once (e.g. when teleporting an entity).
    ///
    /// # Arguments
    /// * `entity_index` — ECS entity slot index.
    /// * `px/py/pz`     — New world-space position.
    /// * `qx/qy/qz/qw` — New orientation (must be a unit quaternion).
    /// * `vx/vy/vz`     — New linear velocity.
    /// * `ax/ay/az`     — New angular velocity.
    ///
    /// # Returns
    /// `true` on success, `false` if the entity has no registered body.
    #[allow(clippy::too_many_arguments)]
    pub fn set_body_state(
        &mut self,
        entity_index: u32,
        px: f32,
        py: f32,
        pz: f32,
        qx: f32,
        qy: f32,
        qz: f32,
        qw: f32,
        vx: f32,
        vy: f32,
        vz: f32,
        ax: f32,
        ay: f32,
        az: f32,
    ) -> bool {
        let Some(&handle) = self.entity_handles.get(&entity_index) else {
            return false;
        };
        let Some(body) = self.rigid_body_set.get_mut(handle) else {
            return false;
        };

        let rotation = UnitQuaternion::new_normalize(Quaternion::new(qw, qx, qy, qz));
        let iso = Isometry::from_parts(Translation3::new(px, py, pz), rotation);
        body.set_position(iso, true);
        body.set_linvel(vector![vx, vy, vz], true);
        body.set_angvel(vector![ax, ay, az], true);
        true
    }

    // ── Linear velocity ───────────────────────────────────────────────────────

    /// Return the linear velocity of a body as `[vx, vy, vz]`.
    ///
    /// # Arguments
    /// * `entity_index` — ECS entity slot index.
    ///
    /// # Returns
    /// A 3-element `Vec<f32>`, or an empty `Vec` if the entity has no body.
    pub fn get_linear_velocity(&self, entity_index: u32) -> Vec<f32> {
        let Some(&handle) = self.entity_handles.get(&entity_index) else {
            return Vec::new();
        };
        let Some(body) = self.rigid_body_set.get(handle) else {
            return Vec::new();
        };
        let v = body.linvel();
        vec![v.x, v.y, v.z]
    }

    /// Set the linear velocity of a body.
    ///
    /// Wakes the body if it is sleeping.
    ///
    /// # Arguments
    /// * `entity_index` — ECS entity slot index.
    /// * `vx/vy/vz`     — New linear velocity (m/s).
    ///
    /// # Returns
    /// `true` on success, `false` if the entity has no registered body.
    pub fn set_linear_velocity(
        &mut self,
        entity_index: u32,
        vx: f32,
        vy: f32,
        vz: f32,
    ) -> bool {
        let Some(&handle) = self.entity_handles.get(&entity_index) else {
            return false;
        };
        let Some(body) = self.rigid_body_set.get_mut(handle) else {
            return false;
        };
        body.set_linvel(vector![vx, vy, vz], true);
        true
    }

    // ── Angular velocity ──────────────────────────────────────────────────────

    /// Return the angular velocity of a body as `[ax, ay, az]` (rad/s).
    ///
    /// # Arguments
    /// * `entity_index` — ECS entity slot index.
    ///
    /// # Returns
    /// A 3-element `Vec<f32>`, or an empty `Vec` if the entity has no body.
    pub fn get_angular_velocity(&self, entity_index: u32) -> Vec<f32> {
        let Some(&handle) = self.entity_handles.get(&entity_index) else {
            return Vec::new();
        };
        let Some(body) = self.rigid_body_set.get(handle) else {
            return Vec::new();
        };
        let a = body.angvel();
        vec![a.x, a.y, a.z]
    }

    /// Set the angular velocity of a body.
    ///
    /// Wakes the body if it is sleeping.
    ///
    /// # Arguments
    /// * `entity_index` — ECS entity slot index.
    /// * `ax/ay/az`     — New angular velocity (rad/s).
    ///
    /// # Returns
    /// `true` on success, `false` if the entity has no registered body.
    pub fn set_angular_velocity(
        &mut self,
        entity_index: u32,
        ax: f32,
        ay: f32,
        az: f32,
    ) -> bool {
        let Some(&handle) = self.entity_handles.get(&entity_index) else {
            return false;
        };
        let Some(body) = self.rigid_body_set.get_mut(handle) else {
            return false;
        };
        body.set_angvel(vector![ax, ay, az], true);
        true
    }

    // ── Impulse ───────────────────────────────────────────────────────────────

    /// Apply a world-space linear impulse to a body.
    ///
    /// The impulse is applied at the body's centre of mass and immediately
    /// changes its linear velocity. The body is woken if sleeping.
    ///
    /// # Arguments
    /// * `entity_index` — ECS entity slot index.
    /// * `ix/iy/iz`     — Impulse vector (N·s).
    ///
    /// # Returns
    /// `true` on success, `false` if the entity has no registered body.
    pub fn apply_impulse(
        &mut self,
        entity_index: u32,
        ix: f32,
        iy: f32,
        iz: f32,
    ) -> bool {
        let Some(&handle) = self.entity_handles.get(&entity_index) else {
            return false;
        };
        let Some(body) = self.rigid_body_set.get_mut(handle) else {
            return false;
        };
        body.apply_impulse(vector![ix, iy, iz], true);
        true
    }

    /// Apply a world-space angular (torque) impulse to a dynamic body.
    ///
    /// The impulse immediately changes the body's angular velocity.
    /// The body is woken if sleeping.
    ///
    /// # Arguments
    /// * `entity_index` — ECS entity slot index.
    /// * `ax/ay/az`     — Angular impulse vector (N·m·s).
    ///
    /// # Returns
    /// `true` on success, `false` if the entity has no registered body.
    pub fn apply_angular_impulse(
        &mut self,
        entity_index: u32,
        ax: f32,
        ay: f32,
        az: f32,
    ) -> bool {
        let Some(&handle) = self.entity_handles.get(&entity_index) else {
            return false;
        };
        let Some(body) = self.rigid_body_set.get_mut(handle) else {
            return false;
        };
        body.apply_torque_impulse(vector![ax, ay, az], true);
        true
    }

    // ── Body kind ─────────────────────────────────────────────────────────────

    /// Return the body kind discriminant for an entity.
    ///
    /// # Arguments
    /// * `entity_index` — ECS entity slot index.
    ///
    /// # Returns
    /// `0` = Fixed, `1` = Dynamic, `2` = KinematicPositionBased.
    /// Returns `255` if the entity has no registered body.
    pub fn get_body_kind(&self, entity_index: u32) -> u8 {
        let Some(&handle) = self.entity_handles.get(&entity_index) else {
            return 255;
        };
        let Some(body) = self.rigid_body_set.get(handle) else {
            return 255;
        };
        body_type_to_kind(body.body_type())
    }

    /// Change the body kind of an existing body.
    ///
    /// Use this to switch a body between fixed, dynamic, and kinematic at
    /// runtime (e.g. picking up a static object).
    ///
    /// # Arguments
    /// * `entity_index` — ECS entity slot index.
    /// * `kind`         — `0` = Fixed, `1` = Dynamic, `2` = KinematicPositionBased.
    ///
    /// # Returns
    /// `true` on success, `false` if the entity has no registered body.
    pub fn set_body_kind(&mut self, entity_index: u32, kind: u8) -> bool {
        let Some(&handle) = self.entity_handles.get(&entity_index) else {
            return false;
        };
        let Some(body) = self.rigid_body_set.get_mut(handle) else {
            return false;
        };
        body.set_body_type(kind_to_body_type(kind), true);
        true
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── Helpers ───────────────────────────────────────────────────────────────

    /// Build a world with standard Earth gravity and one dynamic body at origin.
    fn world_with_one_dynamic() -> PhysicsWorld3D {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        assert!(world.add_body(0, 0.0, 10.0, 0.0, 1, 1.0, 0.0, 0.0));
        world
    }

    // ── Smoke tests ───────────────────────────────────────────────────────────

    #[test]
    fn test_physics3d_world_creation() {
        let world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        assert_eq!(world.gravity.y, -9.81);
    }

    #[test]
    fn test_physics3d_step_executes() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.step(0.016);
    }

    // ── T1: add / remove / has ────────────────────────────────────────────────

    #[test]
    fn test_physics3d_add_remove_body_happy_path() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);

        // Adding a new entity succeeds
        assert!(world.add_body(42, 1.0, 2.0, 3.0, 1, 5.0, 0.1, 0.05));
        assert!(world.has_body(42));

        // Removing it succeeds
        assert!(world.remove_body(42));
        assert!(!world.has_body(42));
    }

    #[test]
    fn test_physics3d_add_body_duplicate_returns_false() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        assert!(world.add_body(1, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0));
        // Registering the same entity index again must be rejected
        assert!(!world.add_body(1, 5.0, 5.0, 5.0, 1, 2.0, 0.0, 0.0));
    }

    #[test]
    fn test_physics3d_remove_body_nonexistent_returns_false() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        assert!(!world.remove_body(99));
    }

    #[test]
    fn test_physics3d_add_body_all_kinds() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        assert!(world.add_body(0, 0.0, 0.0, 0.0, 0, 0.0, 0.0, 0.0)); // Fixed
        assert!(world.add_body(1, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0)); // Dynamic
        assert!(world.add_body(2, 0.0, 0.0, 0.0, 2, 0.0, 0.0, 0.0)); // Kinematic
    }

    // ── T1: get / set body state ──────────────────────────────────────────────

    #[test]
    fn test_physics3d_get_body_state_returns_13_elements() {
        let world = world_with_one_dynamic();
        let state = world.get_body_state(0);
        assert_eq!(state.len(), 13);
    }

    #[test]
    fn test_physics3d_get_body_state_initial_position() {
        let world = world_with_one_dynamic();
        let state = world.get_body_state(0);
        // Position should be approximately (0, 10, 0)
        assert!((state[0] - 0.0).abs() < 1e-5, "px");
        assert!((state[1] - 10.0).abs() < 1e-5, "py");
        assert!((state[2] - 0.0).abs() < 1e-5, "pz");
    }

    #[test]
    fn test_physics3d_get_body_state_identity_quaternion() {
        let world = world_with_one_dynamic();
        let state = world.get_body_state(0);
        // Default orientation is the identity quaternion (0, 0, 0, 1)
        assert!((state[3] - 0.0).abs() < 1e-5, "qx");
        assert!((state[4] - 0.0).abs() < 1e-5, "qy");
        assert!((state[5] - 0.0).abs() < 1e-5, "qz");
        assert!((state[6] - 1.0).abs() < 1e-5, "qw");
    }

    #[test]
    fn test_physics3d_get_body_state_unknown_entity_returns_empty() {
        let world = world_with_one_dynamic();
        assert!(world.get_body_state(999).is_empty());
    }

    #[test]
    fn test_physics3d_set_body_state_updates_position() {
        let mut world = world_with_one_dynamic();
        // Teleport to (5, 20, -3) with identity rotation and zero velocities
        assert!(world.set_body_state(0, 5.0, 20.0, -3.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0));
        let state = world.get_body_state(0);
        assert!((state[0] - 5.0).abs() < 1e-4, "px after set");
        assert!((state[1] - 20.0).abs() < 1e-4, "py after set");
        assert!((state[2] - (-3.0)).abs() < 1e-4, "pz after set");
    }

    #[test]
    fn test_physics3d_set_body_state_unknown_entity_returns_false() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        assert!(!world.set_body_state(7, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0));
    }

    // ── T1: linear/angular velocity ───────────────────────────────────────────

    #[test]
    fn test_physics3d_velocities_round_trip() {
        let mut world = world_with_one_dynamic();

        // Linear velocity
        assert!(world.set_linear_velocity(0, 1.0, 2.0, 3.0));
        let lv = world.get_linear_velocity(0);
        assert_eq!(lv.len(), 3);
        assert!((lv[0] - 1.0).abs() < 1e-5);
        assert!((lv[1] - 2.0).abs() < 1e-5);
        assert!((lv[2] - 3.0).abs() < 1e-5);

        // Angular velocity
        assert!(world.set_angular_velocity(0, 0.1, 0.2, 0.3));
        let av = world.get_angular_velocity(0);
        assert_eq!(av.len(), 3);
        assert!((av[0] - 0.1).abs() < 1e-5);
        assert!((av[1] - 0.2).abs() < 1e-5);
        assert!((av[2] - 0.3).abs() < 1e-5);
    }

    #[test]
    fn test_physics3d_velocities_unknown_entity_returns_empty() {
        let world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        assert!(world.get_linear_velocity(0).is_empty());
        assert!(world.get_angular_velocity(0).is_empty());
    }

    #[test]
    fn test_physics3d_set_velocities_unknown_entity_returns_false() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        assert!(!world.set_linear_velocity(5, 1.0, 0.0, 0.0));
        assert!(!world.set_angular_velocity(5, 0.0, 1.0, 0.0));
    }

    // ── T1: apply impulse ─────────────────────────────────────────────────────

    #[test]
    fn test_physics3d_apply_impulse_changes_velocity() {
        let mut world = world_with_one_dynamic();

        // Rapier defers mass-property recomputation until the first step — the
        // `LOCAL_MASS_PROPERTIES` change flag set by `additional_mass` on the
        // builder is only processed by the pipeline's `user_changes` pass.
        // A single step here causes that pass to run, giving the body a
        // non-zero `effective_inv_mass` before we apply the impulse.
        world.step(1.0 / 60.0);

        // Zero linear velocity on X before the impulse (gravity only affects Y)
        let lv_before = world.get_linear_velocity(0);
        assert!((lv_before[0]).abs() < 1e-5, "initial vx should be zero");

        assert!(world.apply_impulse(0, 10.0, 0.0, 0.0));
        let lv_after = world.get_linear_velocity(0);
        // With mass=1 kg and impulse=10 N·s, vx must be positive.
        assert!(lv_after[0] > 0.0, "impulse should increase vx");
    }

    #[test]
    fn test_physics3d_apply_impulse_unknown_entity_returns_false() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        assert!(!world.apply_impulse(99, 1.0, 0.0, 0.0));
    }

    // ── T1: body kind ─────────────────────────────────────────────────────────

    #[test]
    fn test_physics3d_body_kind_round_trip() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0); // Dynamic

        assert_eq!(world.get_body_kind(0), 1); // Dynamic

        assert!(world.set_body_kind(0, 0)); // → Fixed
        assert_eq!(world.get_body_kind(0), 0);

        assert!(world.set_body_kind(0, 2)); // → Kinematic
        assert_eq!(world.get_body_kind(0), 2);
    }

    #[test]
    fn test_physics3d_body_kind_unknown_entity_returns_sentinel() {
        let world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        assert_eq!(world.get_body_kind(42), 255);
    }

    #[test]
    fn test_physics3d_set_body_kind_unknown_entity_returns_false() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        assert!(!world.set_body_kind(7, 1));
    }

    // ── T1: gravity interaction ───────────────────────────────────────────────

    #[test]
    fn test_physics3d_dynamic_body_falls_under_gravity() {
        let mut world = world_with_one_dynamic();
        let initial_state = world.get_body_state(0);
        let initial_y = initial_state[1];

        // Step enough frames to see measurable fall
        for _ in 0..60 {
            world.step(1.0 / 60.0);
        }

        let final_state = world.get_body_state(0);
        assert!(final_state[1] < initial_y, "body should fall under gravity");
    }

    // ── Collider add/remove cycle ─────────────────────────────────────────────

    #[test]
    fn test_physics3d_add_box_collider_returns_true_for_valid_entity() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);

        let ok = world.add_box_collider(
            0, 0.5, 0.5, 0.5, 0.0, 0.0, 0.0,
            false, 0.5, 0.0, u32::MAX, u32::MAX, 1,
        );
        assert!(ok);
    }

    #[test]
    fn test_physics3d_add_box_collider_returns_false_for_unknown_entity() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        let ok = world.add_box_collider(
            99, 0.5, 0.5, 0.5, 0.0, 0.0, 0.0,
            false, 0.5, 0.0, u32::MAX, u32::MAX, 1,
        );
        assert!(!ok);
    }

    #[test]
    fn test_physics3d_add_sphere_collider_happy_path() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);

        let ok = world.add_sphere_collider(
            0, 0.5, 0.0, 0.0, 0.0,
            false, 0.5, 0.0, u32::MAX, u32::MAX, 2,
        );
        assert!(ok);
    }

    #[test]
    fn test_physics3d_add_capsule_collider_happy_path() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);

        let ok = world.add_capsule_collider(
            0, 0.25, 0.5, 0.0, 0.0, 0.0,
            false, 0.5, 0.0, u32::MAX, u32::MAX, 3,
        );
        assert!(ok);
    }

    #[test]
    fn test_physics3d_remove_collider_happy_path() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);
        world.add_box_collider(
            0, 0.5, 0.5, 0.5, 0.0, 0.0, 0.0,
            false, 0.5, 0.0, u32::MAX, u32::MAX, 7,
        );

        assert!(world.remove_collider(0, 7));
    }

    #[test]
    fn test_physics3d_remove_collider_unknown_returns_false() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);
        assert!(!world.remove_collider(0, 999));
    }

    #[test]
    fn test_physics3d_remove_body_cleans_collider_map() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);
        world.add_box_collider(
            0, 0.5, 0.5, 0.5, 0.0, 0.0, 0.0,
            false, 0.5, 0.0, u32::MAX, u32::MAX, 1,
        );

        world.remove_body(0);

        // The collider_handles map should no longer contain this entry.
        assert!(world.collider_handles.is_empty());
    }

    #[test]
    fn test_physics3d_add_multiple_collider_types_same_body() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);

        assert!(world.add_box_collider(
            0, 0.5, 0.5, 0.5, 0.0, 0.0, 0.0,
            false, 0.5, 0.0, u32::MAX, u32::MAX, 1,
        ));
        assert!(world.add_sphere_collider(
            0, 0.3, 0.0, 1.0, 0.0,
            false, 0.5, 0.0, u32::MAX, u32::MAX, 2,
        ));
        assert!(world.add_capsule_collider(
            0, 0.2, 0.4, 0.0, -1.0, 0.0,
            false, 0.5, 0.0, u32::MAX, u32::MAX, 3,
        ));

        assert_eq!(world.collider_handles.len(), 3);
    }

    // ── Sensor state tracking ─────────────────────────────────────────────────

    #[test]
    fn test_physics3d_sensor_state_defaults_to_zero() {
        let world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        // No sensor registered → packed u64 should be 0.
        assert_eq!(world.get_sensor_state(0, 42), 0);
    }

    #[test]
    fn test_physics3d_update_sensor_state_round_trip() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.update_sensor_state(5, 10, true, 3);

        let packed = world.get_sensor_state(5, 10);
        let contact_count = (packed & 0xffff_ffff) as u32;
        let is_active = (packed >> 32) != 0;

        assert_eq!(contact_count, 3);
        assert!(is_active);
    }

    #[test]
    fn test_physics3d_update_sensor_state_inactive() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.update_sensor_state(0, 0, false, 0);

        let packed = world.get_sensor_state(0, 0);
        assert_eq!(packed, 0);
    }

    #[test]
    fn test_physics3d_remove_body_clears_sensor_state() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.add_body(1, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);
        world.update_sensor_state(1, 5, true, 2);

        world.remove_body(1);

        // Sensor state should be gone after body removal.
        assert_eq!(world.get_sensor_state(1, 5), 0);
    }

    // ── Quality preset application ────────────────────────────────────────────

    #[test]
    fn test_physics3d_quality_preset_low_sets_min_iterations() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.set_quality(0); // Low
        assert_eq!(
            world.integration_params.num_solver_iterations.get(),
            2,
            "Low preset should set 2 solver iterations"
        );
        assert_eq!(
            world.integration_params.num_internal_stabilization_iterations,
            1
        );
        assert_eq!(world.integration_params.max_ccd_substeps, 1);
    }

    #[test]
    fn test_physics3d_quality_preset_medium() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.set_quality(1); // Medium
        assert_eq!(world.integration_params.num_solver_iterations.get(), 4);
        assert_eq!(
            world.integration_params.num_internal_stabilization_iterations,
            2
        );
    }

    #[test]
    fn test_physics3d_quality_preset_high() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.set_quality(2); // High
        assert_eq!(world.integration_params.num_solver_iterations.get(), 8);
        assert_eq!(
            world.integration_params.num_internal_stabilization_iterations,
            3
        );
        assert_eq!(world.integration_params.max_ccd_substeps, 2);
    }

    #[test]
    fn test_physics3d_quality_preset_esport() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.set_quality(3); // Esport
        assert_eq!(world.integration_params.num_solver_iterations.get(), 10);
        assert_eq!(
            world.integration_params.num_internal_stabilization_iterations,
            4
        );
        assert_eq!(world.integration_params.max_ccd_substeps, 4);
    }

    #[test]
    fn test_physics3d_quality_unknown_preset_falls_back_to_medium() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.set_quality(200); // Unknown
        assert_eq!(world.integration_params.num_solver_iterations.get(), 4);
    }

    // ── Event coalescing flag ─────────────────────────────────────────────────

    #[test]
    fn test_physics3d_event_coalescing_toggle() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        assert!(!world.coalesce_events);
        world.set_event_coalescing(true);
        assert!(world.coalesce_events);
        world.set_event_coalescing(false);
        assert!(!world.coalesce_events);
    }

    // ── Collision event buffer ────────────────────────────────────────────────

    #[test]
    fn test_physics3d_event_count_zero_after_step_no_bodies() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.step(1.0 / 60.0);
        // No bodies → no events.
        assert_eq!(world.get_collision_event_count(), 0);
    }

    #[test]
    fn test_physics3d_consume_events_clears_count() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.step(1.0 / 60.0);
        world.consume_events();
        assert_eq!(world.get_collision_event_count(), 0);
    }

    #[test]
    fn test_physics3d_events_ptr_is_non_null() {
        let world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        assert_ne!(world.get_collision_events_ptr(), 0);
    }

    // ── Kinematic position ────────────────────────────────────────────────────

    #[test]
    fn test_physics3d_set_kinematic_position_returns_true() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.add_body(0, 0.0, 0.0, 0.0, 2, 0.0, 0.0, 0.0); // Kinematic

        assert!(world.set_kinematic_position(
            0, 5.0, 3.0, 1.0, 0.0, 0.0, 0.0, 1.0,
        ));
    }

    #[test]
    fn test_physics3d_set_kinematic_position_unknown_entity_returns_false() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        assert!(!world.set_kinematic_position(
            99, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0,
        ));
    }

    // ── Angular impulse ───────────────────────────────────────────────────────

    #[test]
    fn test_physics3d_apply_angular_impulse_unknown_entity_returns_false() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        assert!(!world.apply_angular_impulse(77, 0.0, 1.0, 0.0));
    }

    #[test]
    fn test_physics3d_apply_angular_impulse_changes_angular_velocity() {
        let mut world = world_with_one_dynamic();
        // Step once to initialise mass properties (same requirement as linear impulse).
        world.step(1.0 / 60.0);

        let av_before = world.get_angular_velocity(0);
        assert!((av_before[1]).abs() < 1e-5, "initial angular vy should be zero");

        assert!(world.apply_angular_impulse(0, 0.0, 5.0, 0.0));
        let av_after = world.get_angular_velocity(0);
        assert!(av_after[1] > 0.0, "angular impulse should increase angular vy");
    }

    #[test]
    fn test_physics3d_add_heightfield_collider_happy_path() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        // body_kind 1 = Fixed
        world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);

        // 3×3 grid — flat terrain at y = 0
        let heights = [0.0f32; 9];
        let ok = world.add_heightfield_collider(
            0, &heights, 3, 3,
            10.0, 1.0, 10.0,
            0.5, 0.0, u32::MAX, u32::MAX, 42,
        );
        assert!(ok);
        assert!(world.collider_handles.contains_key(&(0, 42)));
    }

    #[test]
    fn test_physics3d_add_heightfield_collider_wrong_size_returns_false() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);

        // 8 elements but rows=3 cols=3 requires 9 — must fail
        let heights = [0.0f32; 8];
        let ok = world.add_heightfield_collider(
            0, &heights, 3, 3,
            10.0, 1.0, 10.0,
            0.5, 0.0, u32::MAX, u32::MAX, 1,
        );
        assert!(!ok);
    }

    #[test]
    fn test_physics3d_update_heightfield_collider_replaces_old() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);

        let flat = [0.0f32; 9];
        world.add_heightfield_collider(
            0, &flat, 3, 3,
            10.0, 1.0, 10.0,
            0.5, 0.0, u32::MAX, u32::MAX, 99,
        );
        assert!(world.collider_handles.contains_key(&(0, 99)));

        // Raise the centre cell
        let mut updated = [0.0f32; 9];
        updated[4] = 5.0;
        let ok = world.update_heightfield_collider(
            0, 99, &updated, 3, 3,
            10.0, 1.0, 10.0,
            0.5, 0.0, u32::MAX, u32::MAX,
        );
        assert!(ok);
        // collider_id 99 must still be present after the rebuild
        assert!(world.collider_handles.contains_key(&(0, 99)));
    }

    #[test]
    fn test_physics3d_add_heightfield_collider_no_body_returns_false() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        // No body registered for entity 7
        let heights = [0.0f32; 4];
        let ok = world.add_heightfield_collider(
            7, &heights, 2, 2,
            4.0, 1.0, 4.0,
            0.5, 0.0, u32::MAX, u32::MAX, 1,
        );
        assert!(!ok);
    }

    // ─── add_mesh_collider ────────────────────────────────────────────────────

    #[test]
    fn test_physics3d_add_mesh_collider_returns_true_for_valid_entity() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);
        // A single triangle
        let verts: &[f32] = &[0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0];
        let idxs: &[u32] = &[0, 1, 2];
        let ok = world.add_mesh_collider(
            0, verts, idxs, 0.0, 0.0, 0.0,
            false, 0.5, 0.0, u32::MAX, u32::MAX, 1,
        );
        assert!(ok);
    }

    #[test]
    fn test_physics3d_add_mesh_collider_returns_false_for_unknown_entity() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        let verts: &[f32] = &[0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0];
        let idxs: &[u32] = &[0, 1, 2];
        let ok = world.add_mesh_collider(
            99, verts, idxs, 0.0, 0.0, 0.0,
            false, 0.5, 0.0, u32::MAX, u32::MAX, 1,
        );
        assert!(!ok);
    }

    #[test]
    fn test_physics3d_add_mesh_collider_returns_false_for_empty_vertices() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);
        let ok = world.add_mesh_collider(
            0, &[], &[0, 1, 2], 0.0, 0.0, 0.0,
            false, 0.5, 0.0, u32::MAX, u32::MAX, 1,
        );
        assert!(!ok);
    }

    #[test]
    fn test_physics3d_add_mesh_collider_returns_false_for_empty_indices() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);
        let verts: &[f32] = &[0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0];
        let ok = world.add_mesh_collider(
            0, verts, &[], 0.0, 0.0, 0.0,
            false, 0.5, 0.0, u32::MAX, u32::MAX, 1,
        );
        assert!(!ok);
    }

    #[test]
    fn test_physics3d_add_mesh_collider_registers_in_collider_handles() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);
        let verts: &[f32] = &[0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0];
        let idxs: &[u32] = &[0, 1, 2];
        world.add_mesh_collider(
            0, verts, idxs, 0.0, 0.0, 0.0,
            false, 0.5, 0.0, u32::MAX, u32::MAX, 7,
        );
        assert!(world.collider_handles.contains_key(&(0, 7)));
    }

    // ─── add_convex_collider ──────────────────────────────────────────────────

    #[test]
    fn test_physics3d_add_convex_collider_returns_true_for_valid_entity() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);
        // Tetrahedron
        let verts: &[f32] = &[
            0.0, 0.0, 0.0,
            1.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
            0.0, 0.0, 1.0,
        ];
        let ok = world.add_convex_collider(
            0, verts, 0.0, 0.0, 0.0,
            false, 0.5, 0.0, 1.0, u32::MAX, u32::MAX, 1,
        );
        assert!(ok);
    }

    #[test]
    fn test_physics3d_add_convex_collider_returns_false_for_unknown_entity() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        let verts: &[f32] = &[0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0];
        let ok = world.add_convex_collider(
            42, verts, 0.0, 0.0, 0.0,
            false, 0.5, 0.0, 1.0, u32::MAX, u32::MAX, 1,
        );
        assert!(!ok);
    }

    #[test]
    fn test_physics3d_add_convex_collider_returns_false_for_empty_vertices() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);
        let ok = world.add_convex_collider(
            0, &[], 0.0, 0.0, 0.0,
            false, 0.5, 0.0, 1.0, u32::MAX, u32::MAX, 1,
        );
        assert!(!ok);
    }

    #[test]
    fn test_physics3d_add_convex_collider_registers_in_collider_handles() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);
        let verts: &[f32] = &[
            0.0, 0.0, 0.0,
            1.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
            0.0, 0.0, 1.0,
        ];
        world.add_convex_collider(
            0, verts, 0.0, 0.0, 0.0,
            false, 0.5, 0.0, 1.0, u32::MAX, u32::MAX, 5,
        );
        assert!(world.collider_handles.contains_key(&(0, 5)));
    }

    #[test]
    fn test_physics3d_add_convex_collider_degenerate_falls_back_to_sphere() {
        // Only 2 non-unique points — convex_hull returns None → fallback ball(0.5)
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        world.add_body(0, 0.0, 0.0, 0.0, 1, 1.0, 0.0, 0.0);
        let verts: &[f32] = &[0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
        // Should still succeed (ball fallback) rather than panic
        let ok = world.add_convex_collider(
            0, verts, 0.0, 0.0, 0.0,
            false, 0.5, 0.0, 1.0, u32::MAX, u32::MAX, 3,
        );
        assert!(ok);
    }

    // ─── bulk_add_static_boxes ────────────────────────────────────────────────

    #[test]
    fn test_physics3d_bulk_add_static_boxes_returns_n_on_success() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        let indices: &[u32] = &[10, 11, 12];
        let positions: &[f32] = &[
            0.0, 0.0, 0.0,
            5.0, 0.0, 0.0,
            10.0, 0.0, 0.0,
        ];
        let half_extents: &[f32] = &[0.5, 0.5, 0.5]; // uniform
        let n = world.bulk_add_static_boxes(
            indices, positions, half_extents,
            0.5, 0.0, u32::MAX, u32::MAX,
        );
        assert_eq!(n, 3);
    }

    #[test]
    fn test_physics3d_bulk_add_static_boxes_registers_entity_handles() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        let indices: &[u32] = &[20, 21];
        let positions: &[f32] = &[0.0, 0.0, 0.0, 1.0, 0.0, 0.0];
        let half_extents: &[f32] = &[0.5, 0.5, 0.5];
        world.bulk_add_static_boxes(
            indices, positions, half_extents,
            0.5, 0.0, u32::MAX, u32::MAX,
        );
        assert!(world.entity_handles.contains_key(&20));
        assert!(world.entity_handles.contains_key(&21));
    }

    #[test]
    fn test_physics3d_bulk_add_static_boxes_registers_collider_handles() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        let indices: &[u32] = &[30, 31];
        let positions: &[f32] = &[0.0, 0.0, 0.0, 1.0, 0.0, 0.0];
        let half_extents: &[f32] = &[0.5, 0.5, 0.5];
        world.bulk_add_static_boxes(
            indices, positions, half_extents,
            0.5, 0.0, u32::MAX, u32::MAX,
        );
        // collider_id is always 0 for bulk-spawned boxes
        assert!(world.collider_handles.contains_key(&(30, 0)));
        assert!(world.collider_handles.contains_key(&(31, 0)));
    }

    #[test]
    fn test_physics3d_bulk_add_static_boxes_per_entity_half_extents() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        let indices: &[u32] = &[40, 41];
        let positions: &[f32] = &[0.0, 0.0, 0.0, 5.0, 0.0, 0.0];
        // Per-entity half extents: entity 40 → 0.5,0.5,0.5; entity 41 → 1.0,2.0,3.0
        let half_extents: &[f32] = &[0.5, 0.5, 0.5, 1.0, 2.0, 3.0];
        let n = world.bulk_add_static_boxes(
            indices, positions, half_extents,
            0.5, 0.0, u32::MAX, u32::MAX,
        );
        assert_eq!(n, 2);
        assert!(world.entity_handles.contains_key(&40));
        assert!(world.entity_handles.contains_key(&41));
    }

    #[test]
    fn test_physics3d_bulk_add_static_boxes_empty_indices_returns_zero() {
        let mut world = PhysicsWorld3D::new(0.0, -9.81, 0.0);
        let n = world.bulk_add_static_boxes(
            &[], &[], &[0.5, 0.5, 0.5],
            0.5, 0.0, u32::MAX, u32::MAX,
        );
        assert_eq!(n, 0);
    }
}
