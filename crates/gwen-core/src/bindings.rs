//! wasm-bindgen exports
//!
//! Exports for JavaScript interop via wasm-bindgen.
//!
//! # Stale-ID safety
//! All entity operations take both `index` and `generation` so that JS
//! cannot accidentally use a recycled slot (the classic stale-ID bug).
//! `create_entity` returns a `JsEntityId` struct exposing both fields.

use crate::ecs::component::ComponentTypeId;
use crate::ecs::dirty_set::DirtySet;
use crate::ecs::entity::{EntityId, EntityManager};
use crate::ecs::query::{QueryId, QuerySystem};
use crate::ecs::storage::ArchetypeStorage;
use crate::gameloop::GameLoop;
use crate::transform::{Transform, TransformSystem};
use crate::transform_math::Vec2;
use wasm_bindgen::prelude::*;

#[cfg(feature = "physics2d")]
use crate::physics2d::{BodyOptions, BodyType, ColliderOptions, PhysicsQualityPreset, PhysicsWorld};

#[cfg(feature = "physics3d")]
use crate::physics3d::PhysicsWorld3D;

const TRANSFORM_SAB_TYPE_ID: u32 = u32::MAX - 1;
const PHYS_FLAG: u32 = 0b01; // bit 0 — physics active
use crate::transform::TRANSFORM_STRIDE;
/// Local alias so all buffer arithmetic below reads as `STRIDE` unchanged.
const STRIDE: usize = TRANSFORM_STRIDE;

/// Static buffer for query results to avoid allocations during JS bridge calls.
/// Capped at 10,000 entities.
static mut QUERY_RESULT_BUFFER: [u32; 10_000] = [0u32; 10_000];

// ─── Opaque entity handle exposed to JS ──────────────────────────────────────

/// Entity handle returned to JavaScript.
/// Carries both `index` and `generation` so JS can pass them back and
/// the engine can detect stale (dangling) references.
#[wasm_bindgen]
pub struct JsEntityId {
    index: u32,
    generation: u32,
}

#[wasm_bindgen]
impl JsEntityId {
    /// Slot index (stable while entity lives and after slot is recycled)
    #[wasm_bindgen(getter)]
    pub fn index(&self) -> u32 {
        self.index
    }

    /// Generation counter – incremented every time the slot is reused.
    /// Use this to detect dangling references.
    #[wasm_bindgen(getter)]
    pub fn generation(&self) -> u32 {
        self.generation
    }
}

impl From<EntityId> for JsEntityId {
    fn from(id: EntityId) -> Self {
        JsEntityId {
            index: id.index(),
            generation: id.generation(),
        }
    }
}

// ─── Main Engine ─────────────────────────────────────────────────────────────

/// Main engine exported to JavaScript
#[wasm_bindgen]
pub struct Engine {
    pub(crate) entity_manager: EntityManager,
    pub(crate) storage: ArchetypeStorage,
    query_system: QuerySystem,
    gameloop: GameLoop,
    /// Monotonically increasing counter used by `register_component_type`.
    /// Each call returns a fresh ID regardless of the underlying Rust type,
    /// because JS does not have Rust's `TypeId` concept.
    next_js_type_id: u32,
    /// Tracks entities with modified transforms.
    dirty_transforms: DirtySet,
    /// Hierarchical transform system for managing entity transforms
    transform_system: TransformSystem,
    #[cfg(feature = "physics2d")]
    physics_world: Option<PhysicsWorld>,
    #[cfg(feature = "physics3d")]
    physics3d_world: Option<PhysicsWorld3D>,
}

#[wasm_bindgen]
impl Engine {
    /// Create a new engine instance
    #[wasm_bindgen(constructor)]
    pub fn new(max_entities: u32) -> Engine {
        Engine {
            entity_manager: EntityManager::new(max_entities),
            storage: ArchetypeStorage::new(),
            query_system: QuerySystem::new(),
            gameloop: GameLoop::new(60),
            next_js_type_id: 0,
            dirty_transforms: DirtySet::new(max_entities),
            transform_system: TransformSystem::new(),
            #[cfg(feature = "physics2d")]
            physics_world: None,
            #[cfg(feature = "physics3d")]
            physics3d_world: None,
        }
    }

    // === Entity API ===

    /// Create a new entity. Returns a `JsEntityId` with both `index` and
    /// `generation` – keep the whole object, not just the index.
    pub fn create_entity(&mut self) -> JsEntityId {
        self.entity_manager.create_entity().into()
    }

    /// Delete an entity. Requires the full `{index, generation}` pair so
    /// that stale handles are correctly rejected.
    pub fn delete_entity(&mut self, index: u32, generation: u32) -> bool {
        let id = EntityId::from_parts(index, generation);
        if self.entity_manager.delete_entity(id) {
            if let Some(arch_id) = self.storage.remove_entity(index) {
                self.query_system.on_archetype_change(arch_id);
            }
            self.query_system.remove_entity(index);
            true
        } else {
            false
        }
    }

    /// Get count of live entities
    pub fn count_entities(&self) -> u32 {
        self.entity_manager.count_entities()
    }

    /// Check if entity is alive. Requires `{index, generation}` – returns
    /// `false` for any stale handle whose generation no longer matches.
    pub fn is_alive(&self, index: u32, generation: u32) -> bool {
        self.entity_manager
            .is_alive(EntityId::from_parts(index, generation))
    }

    // === Component API ===

    /// Register a new component type and return a unique numeric type ID.
    ///
    /// Each call returns a fresh, monotonically increasing ID.  Unlike the
    /// native Rust API (which uses `std::any::TypeId`), this counter is
    /// JS-friendly: callers just keep the returned number and pass it back.
    ///
    /// The actual column is created lazily on the first `add_component` call,
    /// using the byte-slice length to determine the element size.
    pub fn register_component_type(&mut self) -> u32 {
        let id = self.next_js_type_id;
        self.next_js_type_id += 1;
        id
    }

    /// Add a raw-byte component to an entity.
    ///
    /// Uses **variable-size** mode: the column accepts any byte slice length
    /// and performs an upsert (add-or-update). This is required because
    /// TypeScript serialises components as JSON, so the byte length can
    /// change between calls for the same component type.
    pub fn add_component(
        &mut self,
        index: u32,
        generation: u32,
        component_type_id: u32,
        data: &[u8],
    ) -> bool {
        if !self
            .entity_manager
            .is_alive(EntityId::from_parts(index, generation))
        {
            return false;
        }
        let type_id = ComponentTypeId::from_raw(component_type_id);
        if let Some(migration) = self.storage.upsert_js(index, type_id, data) {
            if let Some(from) = migration.from {
                self.query_system.on_archetype_change(from);
            }
            self.query_system.on_archetype_change(migration.to);
        }

        if component_type_id == TRANSFORM_SAB_TYPE_ID {
            self.dirty_transforms.mark_dirty(index);
        }

        true
    }

    /// Remove a component from an entity.
    pub fn remove_component(
        &mut self,
        index: u32,
        generation: u32,
        component_type_id: u32,
    ) -> bool {
        if !self
            .entity_manager
            .is_alive(EntityId::from_parts(index, generation))
        {
            return false;
        }
        let type_id = ComponentTypeId::from_raw(component_type_id);
        if let Some(migration) = self.storage.remove_component(index, type_id) {
            if let Some(from) = migration.from {
                self.query_system.on_archetype_change(from);
            }
            self.query_system.on_archetype_change(migration.to);
            true
        } else {
            false
        }
    }

    /// Check if entity has component
    pub fn has_component(&self, index: u32, generation: u32, component_type_id: u32) -> bool {
        if !self
            .entity_manager
            .is_alive(EntityId::from_parts(index, generation))
        {
            return false;
        }
        let type_id = ComponentTypeId::from_raw(component_type_id);
        self.storage.has_component(index, type_id)
    }

    /// Get raw component bytes for an entity (returns empty Vec if not found).
    /// On the TypeScript side, use a DataView over the returned Uint8Array.
    pub fn get_component_raw(
        &self,
        index: u32,
        generation: u32,
        component_type_id: u32,
    ) -> Vec<u8> {
        if !self
            .entity_manager
            .is_alive(EntityId::from_parts(index, generation))
        {
            return Vec::new();
        }
        let type_id = ComponentTypeId::from_raw(component_type_id);
        self.storage
            .get_component(index, type_id)
            .map(|bytes| bytes.to_vec())
            .unwrap_or_default()
    }

    // === Bulk Component API ===

    /// Reads component data for multiple entities in a single JS→WASM call.
    ///
    /// # Description
    /// This function eliminates the *N JS→WASM boundary crossings* that occur
    /// when calling [`get_component_raw`] once per entity in a per-frame loop.
    /// Instead, the caller allocates a contiguous output buffer of
    /// `entity_count × component_size_bytes` and passes it in; this function
    /// fills every slot in a tight Rust loop (zero extra heap allocations).
    ///
    /// The output is tightly packed:
    /// ```text
    /// [ entity_0_bytes | entity_1_bytes | … | entity_N_bytes ]
    /// ```
    /// If an entity is dead or does not carry the requested component, its
    /// corresponding slot is left as zeros (the buffer is not resized).
    ///
    /// # Arguments
    /// * `slots` – Entity slot indices (must have the same length as `gens`).
    /// * `gens`  – Per-slot generation counters for stale-reference detection.
    /// * `component_type_id` – Numeric component type ID returned by
    ///   [`register_component_type`].
    /// * `out_buf` – Caller-allocated output buffer.  Must be at least
    ///   `slots.len() × component_size_bytes` bytes.
    ///
    /// # Returns
    /// Total bytes written (always `≤ out_buf.len()`).  Returns `0` if `slots`
    /// is empty or if no component data was found.
    ///
    /// # Panics
    /// Does not panic; silently skips dead or missing-component entities.
    pub fn get_components_bulk(
        &self,
        slots: &[u32],
        gens: &[u32],
        component_type_id: u32,
        out_buf: &mut [u8],
    ) -> u32 {
        let n = slots.len().min(gens.len());
        if n == 0 || out_buf.is_empty() {
            return 0;
        }

        let type_id = ComponentTypeId::from_raw(component_type_id);
        let mut bytes_written: usize = 0;

        for i in 0..n {
            let slot = slots[i];
            let gen = gens[i];

            // Resolve the component slice from storage (no allocation).
            let component_bytes = if self
                .entity_manager
                .is_alive(EntityId::from_parts(slot, gen))
            {
                self.storage.get_component(slot, type_id)
            } else {
                None
            };

            if let Some(src) = component_bytes {
                let comp_size = src.len();
                let dst_start = bytes_written;
                let dst_end = dst_start + comp_size;

                // Guard: don't write past the end of the output buffer.
                if dst_end > out_buf.len() {
                    break;
                }

                out_buf[dst_start..dst_end].copy_from_slice(src);
                bytes_written = dst_end;
            } else {
                // Entity dead or missing component: advance by inferred size
                // (use the first successful read's size, else 0).
                // The output buffer slot was already zeroed by the JS caller.
                if bytes_written == 0 {
                    // We have not determined component size yet; skip this slot
                    // but cannot advance the cursor — leave at 0 until we hit
                    // a live entity.  The JS side must pre-zero the buffer.
                    continue;
                }
                // Infer component size from the first written component.
                let comp_size = bytes_written / i.max(1);
                bytes_written += comp_size;
                if bytes_written > out_buf.len() {
                    bytes_written = out_buf.len();
                    break;
                }
            }
        }

        bytes_written as u32
    }

    /// Writes component data for multiple entities in a single JS→WASM call.
    ///
    /// # Description
    /// The mirror of [`get_components_bulk`]: sends N entities' worth of
    /// component data across the boundary in one call, eliminating N separate
    /// [`add_component`] invocations.
    ///
    /// The input buffer must be packed:
    /// ```text
    /// [ entity_0_bytes | entity_1_bytes | … | entity_N_bytes ]
    /// ```
    /// The stride (bytes per entity) is derived as `data.len() / slots.len()`.
    /// Dead or unknown entities are silently skipped.
    ///
    /// # Arguments
    /// * `slots` – Entity slot indices (same length as `gens`).
    /// * `gens`  – Per-slot generation counters for stale-reference detection.
    /// * `component_type_id` – Numeric component type ID returned by
    ///   [`register_component_type`].
    /// * `data` – Packed component data; total length must equal
    ///   `slots.len() × component_size_bytes`.
    ///
    /// # Panics
    /// Does not panic; silently skips dead entities or malformed data.
    pub fn set_components_bulk(
        &mut self,
        slots: &[u32],
        gens: &[u32],
        component_type_id: u32,
        data: &[u8],
    ) {
        let n = slots.len().min(gens.len());
        if n == 0 || data.is_empty() {
            return;
        }

        // Infer per-entity stride from the total data length.
        let comp_size = data.len() / n;
        if comp_size == 0 {
            return;
        }

        let type_id = ComponentTypeId::from_raw(component_type_id);

        for i in 0..n {
            let slot = slots[i];
            let gen = gens[i];

            if !self
                .entity_manager
                .is_alive(EntityId::from_parts(slot, gen))
            {
                continue;
            }

            let src_start = i * comp_size;
            let src_end = src_start + comp_size;
            if src_end > data.len() {
                break;
            }

            let slice = &data[src_start..src_end];
            if let Some(migration) = self.storage.upsert_js(slot, type_id, slice) {
                if let Some(from) = migration.from {
                    self.query_system.on_archetype_change(from);
                }
                self.query_system.on_archetype_change(migration.to);
            }

            if component_type_id == TRANSFORM_SAB_TYPE_ID {
                self.dirty_transforms.mark_dirty(slot);
            }
        }
    }

    // === Query API ===

    /// Update the archetype of an entity after component changes.
    /// Pass the full list of component type IDs currently on the entity.
    pub fn update_entity_archetype(&mut self, _index: u32, _component_type_ids: &[u32]) {
        // No-op in archetype-based storage as it's handled automatically
        // in add_component/remove_component.
    }

    /// Remove an entity from the query system cache.
    /// Must be called after delete_entity so the query system stops returning
    /// the destroyed entity in subsequent queries.
    pub fn remove_entity_from_query(&mut self, index: u32) {
        self.query_system.remove_entity(index);
    }

    /// Get the current generation for a slot index.
    /// Returns u32::MAX if the index is out of bounds.
    /// Used by the TS bridge to reconstruct packed EntityIds from query results.
    pub fn get_entity_generation(&self, index: u32) -> u32 {
        self.entity_manager
            .get_generation(index)
            .unwrap_or(u32::MAX)
    }

    /// Query entities that have ALL the listed component types.
    /// Returns a flat `Uint32Array` of entity indices.
    pub fn query_entities(&mut self, component_type_ids: &[u32]) -> Vec<u32> {
        let types: Vec<ComponentTypeId> = component_type_ids
            .iter()
            .map(|&id| ComponentTypeId::from_raw(id))
            .collect();
        let query_id = QueryId::new(types, self.storage.registry());
        self.query_system.query(&self.storage, query_id).entities().to_vec()
    }

    /// Query entities and copy their indices into a static buffer.
    /// Returns the number of entities found (capped at 10,000).
    ///
    /// This is an optimized alternative to `query_entities` that avoids
    /// allocating a new `Vec` or `Uint32Array` for the result. Use
    /// `get_query_result_ptr` to get the pointer to the buffer.
    ///
    /// # Example
    /// ```rust
    /// # use gwen_core::bindings::Engine;
    /// # let mut engine = Engine::new(100);
    /// let count = engine.query_entities_to_buffer(&[0, 1]);
    /// let ptr = engine.get_query_result_ptr();
    /// // Read count * 4 bytes from ptr in JS.
    /// ```
    pub fn query_entities_to_buffer(&mut self, component_type_ids: &[u32]) -> u32 {
        let types: Vec<ComponentTypeId> = component_type_ids
            .iter()
            .map(|&id| ComponentTypeId::from_raw(id))
            .collect();
        let query_id = QueryId::new(types, self.storage.registry());
        let results = self.query_system.query(&self.storage, query_id);
        let entities = results.entities();

        let count = entities.len().min(10_000);
        // SAFETY: Only one engine instance accesses this buffer at a time
        // in a single-threaded WASM environment.
        unsafe {
            for (i, &entity_id) in entities.iter().enumerate().take(count) {
                QUERY_RESULT_BUFFER[i] = entity_id;
            }
        }
        count as u32
    }

    /// Get a raw pointer to the static query result buffer.
    ///
    /// Use this to read the results of the last `query_entities_to_buffer` call
    /// from JavaScript without allocations.
    pub fn get_query_result_ptr(&self) -> *const u32 {
        // SAFETY: The buffer is static and lives for the duration of the module.
        std::ptr::addr_of!(QUERY_RESULT_BUFFER) as *const u32
    }

    // === Game Loop API ===

    /// Update game loop (call every frame with delta in milliseconds)
    pub fn tick(&mut self, delta_ms: f32) {
        let delta_seconds = delta_ms / 1000.0;
        self.gameloop.tick(delta_seconds);
        self.transform_system.update();
    }

    /// Get current frame number
    pub fn frame_count(&self) -> u64 {
        self.gameloop.frame_count()
    }

    /// Get delta time for current frame (in seconds)
    pub fn delta_time(&self) -> f32 {
        self.gameloop.delta_time()
    }

    /// Get total elapsed time (in seconds)
    pub fn total_time(&self) -> f32 {
        self.gameloop.total_time()
    }

    /// Check if should sleep for FPS capping
    pub fn should_sleep(&self) -> bool {
        self.gameloop.should_cap_frame()
    }

    /// Get sleep time in milliseconds
    pub fn sleep_time_ms(&self) -> f32 {
        self.gameloop.sleep_time_ms()
    }

    /// Reset frame timing
    pub fn reset_frame(&mut self) {
        self.gameloop.reset_frame();
    }

    // === Transform API ===

    /// Register a transform for the given entity. Must be called after `create_entity`.
    ///
    /// # Arguments
    /// * `index` - Entity index returned by `create_entity`.
    /// * `x`, `y` - Initial local position.
    /// * `rotation` - Initial local rotation in radians.
    /// * `scale_x`, `scale_y` - Initial local scale.
    #[wasm_bindgen]
    pub fn add_entity_transform(
        &mut self,
        index: u32,
        x: f32,
        y: f32,
        rotation: f32,
        scale_x: f32,
        scale_y: f32,
    ) {
        let entity = EntityId::from_parts(index, self.get_entity_generation(index));
        self.transform_system.add_transform(
            entity,
            Transform {
                position: Vec2::new(x, y),
                rotation,
                scale: Vec2::new(scale_x, scale_y),
            },
        );
    }

    /// Set the parent of `child_index` to `parent_index`.
    /// Pass `parent_index = u32::MAX` to detach from any parent.
    ///
    /// # Arguments
    /// * `child_index` - Entity to re-parent.
    /// * `parent_index` - New parent entity index, or `u32::MAX` to detach.
    /// * `keep_world_pos` - If true, recalculate local transform so world position is preserved.
    #[wasm_bindgen]
    pub fn set_entity_parent(
        &mut self,
        child_index: u32,
        parent_index: u32,
        keep_world_pos: bool,
    ) {
        let child_gen = self.get_entity_generation(child_index);
        let child = EntityId::from_parts(child_index, child_gen);

        let parent = if parent_index == u32::MAX {
            None
        } else {
            let parent_gen = self.get_entity_generation(parent_index);
            Some(EntityId::from_parts(parent_index, parent_gen))
        };

        if keep_world_pos {
            let world_pos = self
                .transform_system
                .get_transform(child)
                .map(|t| t.world_position())
                .unwrap_or(Vec2::zero());
            let world_rot = self
                .transform_system
                .get_transform(child)
                .map(|t| t.world_rotation())
                .unwrap_or(0.0);

            self.transform_system.set_parent(child, parent);

            if let Some(node) = self.transform_system.get_transform_mut(child) {
                if parent.is_none() {
                    node.set_position(world_pos);
                    node.set_rotation(world_rot);
                }
            }
        } else {
            self.transform_system.set_parent(child, parent);
        }
    }

    /// Translate entity's local position by (dx, dy). Marks transform dirty.
    #[wasm_bindgen]
    pub fn translate_entity(&mut self, index: u32, dx: f32, dy: f32) {
        let entity = EntityId::from_parts(index, self.get_entity_generation(index));
        if let Some(node) = self.transform_system.get_transform_mut(entity) {
            let pos = node.position();
            node.set_position(Vec2::new(pos.x + dx, pos.y + dy));
        }
    }

    /// Set entity local position.
    #[wasm_bindgen]
    pub fn set_entity_local_position(&mut self, index: u32, x: f32, y: f32) {
        let entity = EntityId::from_parts(index, self.get_entity_generation(index));
        if let Some(node) = self.transform_system.get_transform_mut(entity) {
            node.set_position(Vec2::new(x, y));
        }
    }

    /// Set entity local rotation in radians.
    #[wasm_bindgen]
    pub fn set_entity_local_rotation(&mut self, index: u32, rotation: f32) {
        let entity = EntityId::from_parts(index, self.get_entity_generation(index));
        if let Some(node) = self.transform_system.get_transform_mut(entity) {
            node.set_rotation(rotation);
        }
    }

    /// Set entity local scale.
    #[wasm_bindgen]
    pub fn set_entity_local_scale(&mut self, index: u32, scale_x: f32, scale_y: f32) {
        let entity = EntityId::from_parts(index, self.get_entity_generation(index));
        if let Some(node) = self.transform_system.get_transform_mut(entity) {
            node.set_scale(Vec2::new(scale_x, scale_y));
        }
    }

    /// Get entity local position x.
    #[wasm_bindgen]
    pub fn get_entity_local_x(&self, index: u32) -> f32 {
        let entity = EntityId::from_parts(index, self.get_entity_generation(index));
        self.transform_system
            .get_transform(entity)
            .map(|t| t.position().x)
            .unwrap_or(0.0)
    }

    /// Get entity local position y.
    #[wasm_bindgen]
    pub fn get_entity_local_y(&self, index: u32) -> f32 {
        let entity = EntityId::from_parts(index, self.get_entity_generation(index));
        self.transform_system
            .get_transform(entity)
            .map(|t| t.position().y)
            .unwrap_or(0.0)
    }

    /// Get entity world position x (requires `update_transforms` to have been called this frame).
    #[wasm_bindgen]
    pub fn get_entity_world_x(&self, index: u32) -> f32 {
        let entity = EntityId::from_parts(index, self.get_entity_generation(index));
        self.transform_system
            .get_transform(entity)
            .map(|t| t.world_position().x)
            .unwrap_or(0.0)
    }

    /// Get entity world position y.
    #[wasm_bindgen]
    pub fn get_entity_world_y(&self, index: u32) -> f32 {
        let entity = EntityId::from_parts(index, self.get_entity_generation(index));
        self.transform_system
            .get_transform(entity)
            .map(|t| t.world_position().y)
            .unwrap_or(0.0)
    }

    /// Get entity world rotation.
    #[wasm_bindgen]
    pub fn get_entity_world_rotation(&self, index: u32) -> f32 {
        let entity = EntityId::from_parts(index, self.get_entity_generation(index));
        self.transform_system
            .get_transform(entity)
            .map(|t| t.world_rotation())
            .unwrap_or(0.0)
    }

    /// Get entity local rotation in radians.
    #[wasm_bindgen]
    pub fn get_entity_local_rotation(&self, index: u32) -> f32 {
        let entity = EntityId::from_parts(index, self.get_entity_generation(index));
        self.transform_system
            .get_transform(entity)
            .map(|t| t.rotation())
            .unwrap_or(0.0)
    }

    /// Returns true if the entity has a parent in the TransformSystem.
    #[wasm_bindgen]
    pub fn has_entity_parent(&self, index: u32) -> bool {
        let entity = EntityId::from_parts(index, self.get_entity_generation(index));
        self.transform_system
            .get_transform(entity)
            .map(|t| t.parent().is_some())
            .unwrap_or(false)
    }

    /// Propagate dirty transforms from roots to leaves. Call once per frame before rendering.
    ///
    /// After this call, `get_entity_world_x/y/rotation` return up-to-date world values.
    #[wasm_bindgen]
    pub fn update_transforms(&mut self) {
        self.transform_system.update();
    }

    // === Shared Memory API (WASM Plugin Bridge) ===

    /// Allocates `byte_length` bytes in the WASM linear memory and returns
    /// the raw pointer (as usize) to that region.
    ///
    /// Called once by `SharedMemoryManager.create()` in TypeScript to carve
    /// out a shared buffer that plugin WASM modules can read/write directly.
    ///
    /// Layout contract (stride = 32 bytes per entity slot):
    ///   offset +  0 : pos_x    (f32)
    ///   offset +  4 : pos_y    (f32)
    ///   offset +  8 : rotation (f32)
    ///   offset + 12 : scale_x  (f32)
    ///   offset + 16 : scale_y  (f32)
    ///   offset + 20 : flags    (u32)  — bit 0: physics active, bit 1: dirty
    ///   offset + 24 : reserved (8 bytes)
    ///
    /// # Safety
    /// The returned pointer is valid for the lifetime of the WASM module.
    /// TypeScript must not access it after the engine is destroyed.
    pub fn alloc_shared_buffer(&mut self, byte_length: usize) -> usize {
        let layout = std::alloc::Layout::from_size_align(byte_length, 8)
            .expect("alloc_shared_buffer: invalid layout");
        // SAFETY: layout has non-zero size (caller must pass > 0) and is 8-byte aligned
        let ptr = unsafe { std::alloc::alloc_zeroed(layout) };
        if ptr.is_null() {
            panic!("alloc_shared_buffer: allocation failed (OOM)");
        }
        ptr as usize
    }

    /// Copies Transform data from the ECS `ComponentStorage` into the shared
    /// buffer so plugin WASM modules (physics, AI…) can read up-to-date positions.
    ///
    /// `ptr`         — pointer returned by `alloc_shared_buffer`
    /// `max_entities`— number of entity slots to iterate (must be ≤ original allocation)
    ///
    /// Only entities that have a `Transform` component are written.
    /// Stride is 32 bytes per slot (see `alloc_shared_buffer` layout).
    pub fn sync_transforms_to_buffer(&mut self, ptr: usize, max_entities: u32) {
        for idx in 0..max_entities as usize {
            let offset = idx * STRIDE;
            // SAFETY: ptr was allocated by alloc_shared_buffer with size ≥ max_entities*32
            unsafe {
                let base = (ptr + offset) as *mut f32;

                // Read Transform from storage
                if let Some(raw) = self.storage.get_transform_raw(idx as u32) {
                    // raw is a packed [x: f32, y: f32, rot: f32, sx: f32, sy: f32]
                    let floats = raw.as_ptr() as *const f32;
                    base.write(*floats); // x
                    base.add(1).write(*floats.add(1)); // y
                    base.add(2).write(*floats.add(2)); // rot
                    base.add(3).write(*floats.add(3)); // sx
                    base.add(4).write(*floats.add(4)); // sy
                                                       // flags: mark slot as active
                    let flags_ptr = (ptr + offset + 20) as *mut u32;
                    *flags_ptr |= PHYS_FLAG;
                } else {
                    // Clear slot
                    std::ptr::write_bytes(base as *mut u8, 0, STRIDE);
                }
            }
        }
        self.dirty_transforms.clear();
    }

    /// Copies Transform data back from the shared buffer into the ECS
    /// `ComponentStorage` after plugin WASM modules (physics, AI…) have
    /// updated it.
    ///
    /// `ptr`         — pointer returned by `alloc_shared_buffer`
    /// `max_entities`— number of entity slots to iterate
    ///
    /// Only slots with the physics-active flag (bit 0) are written back.
    /// Stride is 32 bytes per slot (see `alloc_shared_buffer` layout).
    pub fn sync_transforms_from_buffer(&mut self, ptr: usize, max_entities: u32) {
        for idx in 0..max_entities as usize {
            let offset = idx * STRIDE;
            unsafe {
                let flags = *((ptr + offset + 20) as *const u32);
                if flags & PHYS_FLAG == 0 {
                    continue; // slot not managed by physics — skip
                }

                let base = (ptr + offset) as *const f32;
                let x = *base;
                let y = *base.add(1);
                let rot = *base.add(2);
                let sx = *base.add(3);
                let sy = *base.add(4);

                // Write back into storage as raw f32 bytes
                let packed: [f32; 5] = [x, y, rot, sx, sy];
                let bytes = std::slice::from_raw_parts(packed.as_ptr() as *const u8, 20);
                self.storage
                    .upsert_transform_raw(idx as u32, bytes);

                self.dirty_transforms.mark_dirty(idx as u32);
            }
        }
    }

    /// Optimized version of `sync_transforms_to_buffer` that only copies
    /// entities that have been modified since the last sync.
    ///
    /// Returns the number of entities synchronized.
    pub fn sync_transforms_to_buffer_sparse(&mut self, ptr: usize) -> u32 {
        let dirty = self.dirty_transforms.dirty_entities();
        let count = dirty.len() as u32;

        for &idx in dirty {
            let offset = idx as usize * STRIDE;
            unsafe {
                let base = (ptr + offset) as *mut f32;

                // Read Transform from storage
                if let Some(raw) = self.storage.get_transform_raw(idx) {
                    let floats = raw.as_ptr() as *const f32;
                    base.write(*floats); // x
                    base.add(1).write(*floats.add(1)); // y
                    base.add(2).write(*floats.add(2)); // rot
                    base.add(3).write(*floats.add(3)); // sx
                    base.add(4).write(*floats.add(4)); // sy

                    let flags_ptr = (ptr + offset + 20) as *mut u32;
                    *flags_ptr |= PHYS_FLAG;
                } else {
                    // Clear slot if it was dirty but no longer has a transform
                    std::ptr::write_bytes(base as *mut u8, 0, STRIDE);
                }
            }
        }

        self.dirty_transforms.clear();
        count
    }

    /// Get the number of transforms marked as dirty.
    pub fn dirty_transform_count(&self) -> u32 {
        self.dirty_transforms.len() as u32
    }

    // === Physics API ===

    #[cfg(feature = "physics2d")]
    pub fn physics_init(&mut self, grav_x: f32, grav_y: f32, _max_entities: u32) {
        self.physics_world = Some(PhysicsWorld::new(grav_x, grav_y));
    }

    #[cfg(feature = "physics2d")]
    pub fn physics_step(&mut self, delta: f32) {
        if let Some(ref mut world) = self.physics_world {
            world.step(delta);
            world.sync_to_storage(&mut self.storage);
        }
    }

    #[cfg(feature = "physics2d")]
    pub fn physics_set_quality(&mut self, preset: u8) {
        if let Some(ref mut world) = self.physics_world {
            world.set_quality_preset(PhysicsQualityPreset::from_u8(preset));
        }
    }

    #[cfg(feature = "physics2d")]
    pub fn physics_set_event_coalescing(&mut self, _enabled: u32) {
        // Coalescing logic is handled in the event buffer or world
    }

    #[cfg(feature = "physics2d")]
    pub fn physics_set_global_ccd_enabled(&mut self, _enabled: u32) {
        // CCD logic handled in the world
    }

    #[cfg(feature = "physics2d")]
    pub fn physics_add_rigid_body(
        &mut self,
        slot: u32,
        x: f32,
        y: f32,
        body_type: u8,
        mass: f32,
        gravity_scale: f32,
        linear_damping: f32,
        angular_damping: f32,
        vx: f32,
        vy: f32,
        ccd_enabled: Option<u32>,
        extra_solver_iters: Option<usize>,
    ) -> u32 {
        if let Some(ref mut world) = self.physics_world {
            let b_type = match body_type {
                0 => BodyType::Fixed,
                2 => BodyType::Kinematic,
                _ => BodyType::Dynamic,
            };
            let opts = BodyOptions {
                mass,
                gravity_scale,
                linear_damping,
                angular_damping,
                initial_velocity: (vx, vy),
                ccd_enabled: ccd_enabled.map(|v| v != 0),
                additional_solver_iterations: extra_solver_iters,
            };
            world.add_rigid_body(slot, x, y, b_type, opts)
        } else {
            0
        }
    }

    #[cfg(feature = "physics2d")]
    pub fn physics_remove_rigid_body(&mut self, slot: u32) {
        if let Some(ref mut world) = self.physics_world {
            world.remove_rigid_body(slot);
        }
    }

    #[cfg(feature = "physics2d")]
    pub fn physics_add_box_collider(
        &mut self,
        handle: u32,
        hw: f32,
        hh: f32,
        restitution: f32,
        friction: f32,
        is_sensor: u32,
        density: f32,
        membership: u32,
        filter: u32,
        collider_id: Option<u32>,
        offset_x: Option<f32>,
        offset_y: Option<f32>,
    ) {
        if let Some(ref mut world) = self.physics_world {
            let opts = ColliderOptions {
                material: crate::physics2d::components::PhysicsMaterial {
                    restitution,
                    friction,
                },
                is_sensor: is_sensor != 0,
                density,
                groups: crate::physics2d::components::CollisionGroups { membership, filter },
                collider_id: collider_id.unwrap_or(u32::MAX),
                offset_x: offset_x.unwrap_or(0.0),
                offset_y: offset_y.unwrap_or(0.0),
            };
            world.add_box_collider(handle, hw, hh, opts);
        }
    }

    #[cfg(feature = "physics2d")]
    pub fn physics_add_ball_collider(
        &mut self,
        handle: u32,
        radius: f32,
        restitution: f32,
        friction: f32,
        is_sensor: u32,
        density: f32,
        membership: u32,
        filter: u32,
        collider_id: Option<u32>,
        offset_x: Option<f32>,
        offset_y: Option<f32>,
    ) {
        if let Some(ref mut world) = self.physics_world {
            let opts = ColliderOptions {
                material: crate::physics2d::components::PhysicsMaterial {
                    restitution,
                    friction,
                },
                is_sensor: is_sensor != 0,
                density,
                groups: crate::physics2d::components::CollisionGroups { membership, filter },
                collider_id: collider_id.unwrap_or(u32::MAX),
                offset_x: offset_x.unwrap_or(0.0),
                offset_y: offset_y.unwrap_or(0.0),
            };
            world.add_ball_collider(handle, radius, opts);
        }
    }

    #[cfg(feature = "physics2d")]
    pub fn physics_get_position(&self, slot: u32) -> Vec<f32> {
        if let Some(ref world) = self.physics_world {
            if let Some((x, y, rot)) = world.get_position(slot) {
                return vec![x, y, rot];
            }
        }
        Vec::new()
    }

    #[cfg(feature = "physics2d")]
    pub fn physics_get_linear_velocity(&self, slot: u32) -> Vec<f32> {
        if let Some(ref world) = self.physics_world {
            if let Some((vx, vy)) = world.get_linear_velocity(slot) {
                return vec![vx, vy];
            }
        }
        Vec::new()
    }

    #[cfg(feature = "physics2d")]
    pub fn physics_get_sensor_state(&self, slot: u32, collider_id: u32) -> Vec<u32> {
        if let Some(ref world) = self.physics_world {
            let (count, active) = world.get_sensor_state(slot, collider_id);
            return vec![count, if active { 1 } else { 0 }];
        }
        vec![0, 0]
    }

    #[cfg(feature = "physics2d")]
    pub fn physics_update_sensor_state(&mut self, _slot: u32, _collider_id: u32, _active: u32) {
        // Implementation logic
    }

    #[cfg(feature = "physics2d")]
    pub fn physics_consume_event_metrics(&mut self) -> Vec<u32> {
        vec![self.gameloop.frame_count() as u32, 0, 0, 0]
    }

    #[cfg(feature = "physics2d")]
    pub fn physics_get_collision_events_ptr(&self) -> *const u8 {
        crate::physics2d::events::get_collision_events_ptr() as *const u8
    }

    #[cfg(feature = "physics2d")]
    pub fn physics_get_collision_event_count(&self) -> u32 {
        crate::physics2d::events::get_collision_event_count() as u32
    }

    // === Pathfinding API ===

    #[cfg(feature = "physics2d")]
    pub fn path_find_2d(&mut self, from_x: f32, from_y: f32, to_x: f32, to_y: f32) -> u32 {
        crate::physics2d::pathfinding::find_path_2d(from_x, from_y, to_x, to_y) as u32
    }

    #[cfg(feature = "physics2d")]
    pub fn path_get_result_ptr(&self) -> *const f32 {
        crate::physics2d::pathfinding::get_path_buffer_ptr() as *const f32
    }

    // === Physics3D API ===

    #[cfg(feature = "physics3d")]
    pub fn physics3d_init(&mut self, gx: f32, gy: f32, gz: f32, _max_entities: u32) {
        self.physics3d_world = Some(PhysicsWorld3D::new(gx, gy, gz));
    }

    #[cfg(feature = "physics3d")]
    pub fn physics3d_step(&mut self, delta: f32) {
        if let Some(ref mut world) = self.physics3d_world {
            world.step(delta);
        }
    }

    /// Register a new 3D rigid body for the given entity index.
    ///
    /// Returns `false` if the entity index is already registered (no-op).
    ///
    /// # Arguments
    /// * `entity_index`    — ECS entity slot index.
    /// * `x`, `y`, `z`    — Initial world-space position.
    /// * `kind`            — `0` = Fixed, `1` = Dynamic, `2` = KinematicPositionBased.
    /// * `mass`            — Body mass in kg (dynamic bodies only).
    /// * `linear_damping`  — Linear velocity damping coefficient.
    /// * `angular_damping` — Angular velocity damping coefficient.
    #[cfg(feature = "physics3d")]
    pub fn physics3d_add_body(
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
        if let Some(ref mut world) = self.physics3d_world {
            world.add_body(entity_index, x, y, z, kind, mass, linear_damping, angular_damping)
        } else {
            false
        }
    }

    /// Remove the 3D rigid body registered for the given entity index.
    ///
    /// Returns `false` if no body was registered or the physics world is not initialised.
    #[cfg(feature = "physics3d")]
    pub fn physics3d_remove_body(&mut self, entity_index: u32) -> bool {
        if let Some(ref mut world) = self.physics3d_world {
            world.remove_body(entity_index)
        } else {
            false
        }
    }

    /// Return `true` if a 3D body is registered for the given entity index.
    #[cfg(feature = "physics3d")]
    pub fn physics3d_has_body(&self, entity_index: u32) -> bool {
        if let Some(ref world) = self.physics3d_world {
            world.has_body(entity_index)
        } else {
            false
        }
    }

    /// Return the full body state as a flat `Float32Array` of 13 elements.
    ///
    /// Layout: `[px, py, pz, qx, qy, qz, qw, vx, vy, vz, ax, ay, az]`
    ///
    /// Returns an empty array if the entity has no body or the world is not
    /// initialised.
    #[cfg(feature = "physics3d")]
    pub fn physics3d_get_body_state(&self, entity_index: u32) -> Vec<f32> {
        if let Some(ref world) = self.physics3d_world {
            world.get_body_state(entity_index)
        } else {
            Vec::new()
        }
    }

    /// Overwrite all state fields of an existing 3D body in one call.
    ///
    /// Returns `false` if the entity has no registered body.
    ///
    /// # Arguments
    /// * `entity_index`    — ECS entity slot index.
    /// * `px/py/pz`        — New world-space position.
    /// * `qx/qy/qz/qw`    — New orientation (unit quaternion).
    /// * `vx/vy/vz`        — New linear velocity.
    /// * `ax/ay/az`        — New angular velocity.
    #[cfg(feature = "physics3d")]
    #[allow(clippy::too_many_arguments)]
    pub fn physics3d_set_body_state(
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
        if let Some(ref mut world) = self.physics3d_world {
            world.set_body_state(entity_index, px, py, pz, qx, qy, qz, qw, vx, vy, vz, ax, ay, az)
        } else {
            false
        }
    }

    /// Return the linear velocity of a 3D body as `[vx, vy, vz]`.
    ///
    /// Returns an empty array if the entity has no body.
    #[cfg(feature = "physics3d")]
    pub fn physics3d_get_linear_velocity(&self, entity_index: u32) -> Vec<f32> {
        if let Some(ref world) = self.physics3d_world {
            world.get_linear_velocity(entity_index)
        } else {
            Vec::new()
        }
    }

    /// Set the linear velocity of a 3D body.
    ///
    /// Returns `false` if the entity has no registered body.
    #[cfg(feature = "physics3d")]
    pub fn physics3d_set_linear_velocity(
        &mut self,
        entity_index: u32,
        vx: f32,
        vy: f32,
        vz: f32,
    ) -> bool {
        if let Some(ref mut world) = self.physics3d_world {
            world.set_linear_velocity(entity_index, vx, vy, vz)
        } else {
            false
        }
    }

    /// Return the angular velocity of a 3D body as `[ax, ay, az]` (rad/s).
    ///
    /// Returns an empty array if the entity has no body.
    #[cfg(feature = "physics3d")]
    pub fn physics3d_get_angular_velocity(&self, entity_index: u32) -> Vec<f32> {
        if let Some(ref world) = self.physics3d_world {
            world.get_angular_velocity(entity_index)
        } else {
            Vec::new()
        }
    }

    /// Set the angular velocity of a 3D body.
    ///
    /// Returns `false` if the entity has no registered body.
    #[cfg(feature = "physics3d")]
    pub fn physics3d_set_angular_velocity(
        &mut self,
        entity_index: u32,
        ax: f32,
        ay: f32,
        az: f32,
    ) -> bool {
        if let Some(ref mut world) = self.physics3d_world {
            world.set_angular_velocity(entity_index, ax, ay, az)
        } else {
            false
        }
    }

    /// Apply a world-space linear impulse to a 3D body.
    ///
    /// Wakes the body if sleeping. Returns `false` if the entity has no body.
    ///
    /// # Arguments
    /// * `entity_index` — ECS entity slot index.
    /// * `ix/iy/iz`     — Impulse vector (N·s).
    #[cfg(feature = "physics3d")]
    pub fn physics3d_apply_impulse(
        &mut self,
        entity_index: u32,
        ix: f32,
        iy: f32,
        iz: f32,
    ) -> bool {
        if let Some(ref mut world) = self.physics3d_world {
            world.apply_impulse(entity_index, ix, iy, iz)
        } else {
            false
        }
    }

    /// Return the body kind discriminant for a 3D body.
    ///
    /// Returns `0` = Fixed, `1` = Dynamic, `2` = KinematicPositionBased,
    /// or `255` if the entity has no registered body.
    #[cfg(feature = "physics3d")]
    pub fn physics3d_get_body_kind(&self, entity_index: u32) -> u8 {
        if let Some(ref world) = self.physics3d_world {
            world.get_body_kind(entity_index)
        } else {
            255
        }
    }

    /// Change the body kind of an existing 3D body at runtime.
    ///
    /// Returns `false` if the entity has no registered body.
    ///
    /// # Arguments
    /// * `entity_index` — ECS entity slot index.
    /// * `kind`         — `0` = Fixed, `1` = Dynamic, `2` = KinematicPositionBased.
    #[cfg(feature = "physics3d")]
    pub fn physics3d_set_body_kind(&mut self, entity_index: u32, kind: u8) -> bool {
        if let Some(ref mut world) = self.physics3d_world {
            world.set_body_kind(entity_index, kind)
        } else {
            false
        }
    }

    /// Attach an axis-aligned box collider to a 3D body.
    ///
    /// Returns `false` if the entity has no registered body or the world is not
    /// initialised.
    ///
    /// # Arguments
    /// * `entity_index`    — ECS entity slot index.
    /// * `half_x/y/z`     — Box half-extents (metres).
    /// * `offset_x/y/z`   — Local-space offset from the body origin.
    /// * `is_sensor`       — If `true`, collision response is suppressed; only events fire.
    /// * `friction`        — Surface friction coefficient (≥ 0).
    /// * `restitution`     — Bounciness coefficient (\[0, 1\]).
    /// * `layer_bits`      — Collision layer membership bitmask.
    /// * `mask_bits`       — Collision filter bitmask (which layers this collider hits).
    /// * `collider_id`     — Stable application-defined ID stored in collision events.
    #[cfg(feature = "physics3d")]
    #[allow(clippy::too_many_arguments)]
    pub fn physics3d_add_box_collider(
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
        if let Some(ref mut world) = self.physics3d_world {
            world.add_box_collider(
                entity_index,
                half_x,
                half_y,
                half_z,
                offset_x,
                offset_y,
                offset_z,
                is_sensor,
                friction,
                restitution,
                layer_bits,
                mask_bits,
                collider_id,
            )
        } else {
            false
        }
    }

    /// Attach a sphere collider to a 3D body.
    ///
    /// Returns `false` if the entity has no registered body or the world is not
    /// initialised.
    ///
    /// # Arguments
    /// * `entity_index`    — ECS entity slot index.
    /// * `radius`          — Sphere radius (metres).
    /// * `offset_x/y/z`   — Local-space offset from the body origin.
    /// * `is_sensor`       — If `true`, collision response is suppressed; only events fire.
    /// * `friction`        — Surface friction coefficient (≥ 0).
    /// * `restitution`     — Bounciness coefficient (\[0, 1\]).
    /// * `layer_bits`      — Collision layer membership bitmask.
    /// * `mask_bits`       — Collision filter bitmask.
    /// * `collider_id`     — Stable application-defined ID stored in collision events.
    #[cfg(feature = "physics3d")]
    #[allow(clippy::too_many_arguments)]
    pub fn physics3d_add_sphere_collider(
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
        if let Some(ref mut world) = self.physics3d_world {
            world.add_sphere_collider(
                entity_index,
                radius,
                offset_x,
                offset_y,
                offset_z,
                is_sensor,
                friction,
                restitution,
                layer_bits,
                mask_bits,
                collider_id,
            )
        } else {
            false
        }
    }

    /// Attach a Y-axis capsule collider to a 3D body.
    ///
    /// The capsule extends `±half_height` metres along the Y axis, capped by
    /// hemispheres of `radius` metres.
    ///
    /// Returns `false` if the entity has no registered body or the world is not
    /// initialised.
    ///
    /// # Arguments
    /// * `entity_index`    — ECS entity slot index.
    /// * `radius`          — Hemisphere radius (metres).
    /// * `half_height`     — Half-length of the cylindrical shaft (metres).
    /// * `offset_x/y/z`   — Local-space offset from the body origin.
    /// * `is_sensor`       — If `true`, collision response is suppressed; only events fire.
    /// * `friction`        — Surface friction coefficient (≥ 0).
    /// * `restitution`     — Bounciness coefficient (\[0, 1\]).
    /// * `layer_bits`      — Collision layer membership bitmask.
    /// * `mask_bits`       — Collision filter bitmask.
    /// * `collider_id`     — Stable application-defined ID stored in collision events.
    #[cfg(feature = "physics3d")]
    #[allow(clippy::too_many_arguments)]
    pub fn physics3d_add_capsule_collider(
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
        if let Some(ref mut world) = self.physics3d_world {
            world.add_capsule_collider(
                entity_index,
                radius,
                half_height,
                offset_x,
                offset_y,
                offset_z,
                is_sensor,
                friction,
                restitution,
                layer_bits,
                mask_bits,
                collider_id,
            )
        } else {
            false
        }
    }

    /// Attach a heightfield collider to a 3D fixed body.
    ///
    /// The heightfield is defined on a `rows × cols` grid. Pass a row-major
    /// `Float32Array` from JavaScript. Returns `false` if the entity has no
    /// registered body, the world is not initialised, or the array length does
    /// not equal `rows * cols`.
    ///
    /// # Arguments
    /// * `entity_index`  — ECS entity slot index.
    /// * `heights_flat`  — Row-major `Float32Array` of `rows × cols` heights.
    /// * `rows`          — Number of rows (Z axis).
    /// * `cols`          — Number of columns (X axis).
    /// * `scale_x`       — World-space width of the entire heightfield (metres).
    /// * `scale_y`       — World-space maximum height multiplier (metres).
    /// * `scale_z`       — World-space depth of the entire heightfield (metres).
    /// * `friction`      — Surface friction coefficient (≥ 0).
    /// * `restitution`   — Bounciness coefficient (\[0, 1\]).
    /// * `layer_bits`    — Collision layer membership bitmask.
    /// * `mask_bits`     — Collision filter bitmask.
    /// * `collider_id`   — Stable application-defined ID stored in collision events.
    #[cfg(feature = "physics3d")]
    #[allow(clippy::too_many_arguments)]
    pub fn physics3d_add_heightfield_collider(
        &mut self,
        entity_index: u32,
        heights_flat: &[f32],
        rows: u32,
        cols: u32,
        scale_x: f32,
        scale_y: f32,
        scale_z: f32,
        friction: f32,
        restitution: f32,
        layer_bits: u32,
        mask_bits: u32,
        collider_id: u32,
    ) -> bool {
        if let Some(ref mut world) = self.physics3d_world {
            world.add_heightfield_collider(
                entity_index,
                heights_flat,
                rows as usize,
                cols as usize,
                scale_x,
                scale_y,
                scale_z,
                friction,
                restitution,
                layer_bits,
                mask_bits,
                collider_id,
            )
        } else {
            false
        }
    }

    /// Replace the height data of an existing heightfield collider.
    ///
    /// Atomically removes the old collider and inserts a new one with the
    /// provided height data. All other parameters (scale, friction, layers)
    /// must be re-supplied. Returns `false` if the entity has no registered
    /// body, the world is not initialised, or the array length is wrong.
    ///
    /// # Arguments
    /// * `entity_index`  — ECS entity slot index.
    /// * `collider_id`   — Stable ID that was passed when the collider was created.
    /// * `heights_flat`  — Updated row-major `Float32Array` of `rows × cols` heights.
    /// * `rows`          — Number of rows (Z axis) — must match original.
    /// * `cols`          — Number of columns (X axis) — must match original.
    /// * `scale_x`       — World-space width (metres).
    /// * `scale_y`       — World-space height multiplier (metres).
    /// * `scale_z`       — World-space depth (metres).
    /// * `friction`      — Surface friction coefficient (≥ 0).
    /// * `restitution`   — Bounciness coefficient (\[0, 1\]).
    /// * `layer_bits`    — Collision layer membership bitmask.
    /// * `mask_bits`     — Collision filter bitmask.
    #[cfg(feature = "physics3d")]
    #[allow(clippy::too_many_arguments)]
    pub fn physics3d_update_heightfield_collider(
        &mut self,
        entity_index: u32,
        collider_id: u32,
        heights_flat: &[f32],
        rows: u32,
        cols: u32,
        scale_x: f32,
        scale_y: f32,
        scale_z: f32,
        friction: f32,
        restitution: f32,
        layer_bits: u32,
        mask_bits: u32,
    ) -> bool {
        if let Some(ref mut world) = self.physics3d_world {
            world.update_heightfield_collider(
                entity_index,
                collider_id,
                heights_flat,
                rows as usize,
                cols as usize,
                scale_x,
                scale_y,
                scale_z,
                friction,
                restitution,
                layer_bits,
                mask_bits,
            )
        } else {
            false
        }
    }

    /// Attach a triangle-mesh (trimesh) collider to a 3D body.
    ///
    /// Returns `false` if the entity has no registered body, either slice is empty,
    /// or the world is not initialised.
    ///
    /// # Arguments
    /// * `entity_index`    — ECS entity slot index.
    /// * `vertices`        — Flat vertex buffer `[x0,y0,z0, x1,y1,z1, ...]` (length multiple of 3).
    /// * `indices`         — Flat index buffer `[a0,b0,c0, ...]` (length multiple of 3).
    /// * `offset_x/y/z`   — Local-space offset from the body origin (metres).
    /// * `is_sensor`       — When `true`, collision response is suppressed; only events fire.
    /// * `friction`        — Surface friction coefficient (≥ 0).
    /// * `restitution`     — Bounciness coefficient (\[0, 1\]).
    /// * `layer_bits`      — Collision layer membership bitmask.
    /// * `mask_bits`       — Collision filter bitmask.
    /// * `collider_id`     — Stable application-defined ID stored in collision events.
    #[cfg(feature = "physics3d")]
    #[allow(clippy::too_many_arguments)]
    pub fn physics3d_add_mesh_collider(
        &mut self,
        entity_index: u32,
        vertices: &[f32],
        indices: &[u32],
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
        if let Some(ref mut world) = self.physics3d_world {
            world.add_mesh_collider(
                entity_index,
                vertices,
                indices,
                offset_x,
                offset_y,
                offset_z,
                is_sensor,
                friction,
                restitution,
                layer_bits,
                mask_bits,
                collider_id,
            )
        } else {
            false
        }
    }

    /// Rebuild a mesh collider with new geometry at runtime.
    ///
    /// Removes the collider identified by `(entity_index, collider_id)` from the Rapier3D
    /// world and re-inserts a new trimesh built from `vertices_flat` and `indices_flat`.
    /// If no matching collider exists, a new one is created (same result as calling
    /// `physics3d_add_mesh_collider`).
    ///
    /// # Returns
    /// `true` on success, `false` if the entity has no registered body or the world is
    /// not initialised.
    ///
    /// # Arguments
    /// * `entity_index`  — ECS entity slot index.
    /// * `collider_id`   — Stable ID that was passed when the collider was created.
    /// * `vertices_flat` — New vertex positions `[x0,y0,z0, x1,y1,z1, ...]`.
    /// * `indices_flat`  — New triangle indices `[a0,b0,c0, ...]`.
    /// * `offset_x/y/z` — Local-space offset from the body origin.
    /// * `is_sensor`     — If `true`, collision response is suppressed; only events fire.
    /// * `friction`      — Surface friction coefficient (≥ 0).
    /// * `restitution`   — Bounciness coefficient (\[0, 1\]).
    /// * `layer_bits`    — Collision layer membership bitmask.
    /// * `mask_bits`     — Collision filter bitmask.
    #[cfg(feature = "physics3d")]
    #[allow(clippy::too_many_arguments)]
    pub fn physics3d_rebuild_mesh_collider(
        &mut self,
        entity_index: u32,
        collider_id: u32,
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
    ) -> bool {
        if let Some(ref mut world) = self.physics3d_world {
            world.rebuild_mesh_collider(
                entity_index,
                collider_id,
                vertices_flat,
                indices_flat,
                offset_x,
                offset_y,
                offset_z,
                is_sensor,
                friction,
                restitution,
                layer_bits,
                mask_bits,
            )
        } else {
            false
        }
    }

    /// Attach a convex-hull collider to a 3D body.
    ///
    /// Falls back to a unit sphere when Rapier cannot construct a valid convex hull
    /// (degenerate point cloud). Returns `false` if the entity has no registered body,
    /// the vertex slice is empty, or the world is not initialised.
    ///
    /// # Arguments
    /// * `entity_index`    — ECS entity slot index.
    /// * `vertices`        — Flat vertex buffer `[x0,y0,z0, x1,y1,z1, ...]` (length multiple of 3).
    /// * `offset_x/y/z`   — Local-space offset from the body origin (metres).
    /// * `is_sensor`       — When `true`, collision response is suppressed; only events fire.
    /// * `friction`        — Surface friction coefficient (≥ 0).
    /// * `restitution`     — Bounciness coefficient (\[0, 1\]).
    /// * `density`         — Collider density (kg/m³). Applied to dynamic bodies.
    /// * `layer_bits`      — Collision layer membership bitmask.
    /// * `mask_bits`       — Collision filter bitmask.
    /// * `collider_id`     — Stable application-defined ID stored in collision events.
    #[cfg(feature = "physics3d")]
    #[allow(clippy::too_many_arguments)]
    pub fn physics3d_add_convex_collider(
        &mut self,
        entity_index: u32,
        vertices: &[f32],
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
        if let Some(ref mut world) = self.physics3d_world {
            world.add_convex_collider(
                entity_index,
                vertices,
                offset_x,
                offset_y,
                offset_z,
                is_sensor,
                friction,
                restitution,
                density,
                layer_bits,
                mask_bits,
                collider_id,
            )
        } else {
            false
        }
    }

    /// Load a pre-baked BVH buffer as a trimesh collider.
    ///
    /// The `bvh_bytes` must have been produced by `build_bvh_buffer()` or
    /// `build_bvh_from_glb()` (the `build-tools` feature). Deserialising the
    /// pre-baked [`rapier3d::geometry::TriMesh`] costs ~2 ms vs ~50 ms for a
    /// fresh `trimesh()` build on large meshes.
    ///
    /// # Arguments
    /// * `entity_index`  — ECS entity slot index.
    /// * `bvh_bytes`     — Pre-baked BVH buffer produced by `build_bvh_buffer` or
    ///                     `build_bvh_from_glb` (GBVH header + bincode `TriMesh`).
    /// * `offset_x/y/z`  — Local-space offset from the body origin (metres).
    /// * `is_sensor`     — When `true`, collision response is suppressed; only events fire.
    /// * `friction`      — Surface friction coefficient (≥ 0).
    /// * `restitution`   — Bounciness coefficient (\[0, 1\]).
    /// * `layer_bits`    — Collision layer membership bitmask.
    /// * `mask_bits`     — Collision filter bitmask.
    /// * `collider_id`   — Stable application-defined collider ID.
    ///
    /// # Returns
    /// `false` if `bvh_bytes` is malformed, the magic header is missing,
    /// or the entity has no registered rigid body.
    #[cfg(feature = "physics3d")]
    #[allow(clippy::too_many_arguments)]
    pub fn physics3d_load_bvh_collider(
        &mut self,
        entity_index: u32,
        bvh_bytes: &[u8],
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
        if let Some(ref mut world) = self.physics3d_world {
            world.load_bvh_collider(
                entity_index,
                bvh_bytes,
                offset_x,
                offset_y,
                offset_z,
                is_sensor,
                friction,
                restitution,
                layer_bits,
                mask_bits,
                collider_id,
            )
        } else {
            false
        }
    }

    /// Bulk-spawn N static box bodies in one call.
    ///
    /// Entity indices must be pre-allocated by the TypeScript caller via
    /// `engine.createEntity()`. This function creates the Rapier bodies and
    /// attaches box colliders in one Rust pass.
    ///
    /// Returns the number of bodies successfully created.
    ///
    /// # Arguments
    /// * `entity_indices`    — Pre-allocated ECS entity slot indices (one per body).
    /// * `positions_flat`    — Flat `[x0,y0,z0, x1,y1,z1, ...]` — `N × 3` f32 elements.
    /// * `half_extents_flat` — Either 3 floats (uniform) or `N × 3` floats (per-entity).
    /// * `friction`          — Surface friction coefficient (≥ 0).
    /// * `restitution`       — Bounciness coefficient (\[0, 1\]).
    /// * `layer_bits`        — Collision layer membership bitmask.
    /// * `mask_bits`         — Collision filter bitmask.
    #[cfg(feature = "physics3d")]
    #[allow(clippy::too_many_arguments)]
    pub fn physics3d_bulk_spawn_static_boxes(
        &mut self,
        entity_indices: &[u32],
        positions_flat: &[f32],
        half_extents_flat: &[f32],
        friction: f32,
        restitution: f32,
        layer_bits: u32,
        mask_bits: u32,
    ) -> u32 {
        if let Some(ref mut world) = self.physics3d_world {
            world.bulk_add_static_boxes(
                entity_indices,
                positions_flat,
                half_extents_flat,
                friction,
                restitution,
                layer_bits,
                mask_bits,
            )
        } else {
            0
        }
    }

    /// Attach multiple primitive colliders to one 3D body in a single WASM call.
    ///
    /// The `shape_data` slice encodes 12 `f32` values per shape:
    /// `[shape_type, p0, p1, p2, p3, offset_x, offset_y, offset_z, is_sensor, friction, restitution, collider_id]`
    ///
    /// Shape types: `0` = BOX, `1` = SPHERE, `2` = CAPSULE.
    ///
    /// `layer_bits` and `mask_bits` apply to all shapes in the batch.
    ///
    /// # Returns
    /// Number of colliders successfully inserted; `0` if the world is not
    /// initialised, the entity has no body, or `shape_data` is malformed.
    #[cfg(feature = "physics3d")]
    #[wasm_bindgen]
    pub fn physics3d_add_compound_collider(
        &mut self,
        entity_index: u32,
        shape_data: &[f32],
        layer_bits: u32,
        mask_bits: u32,
    ) -> u32 {
        if let Some(ref mut world) = self.physics3d_world {
            world.add_compound_collider(entity_index, shape_data, layer_bits, mask_bits)
        } else {
            0
        }
    }

    /// Remove a specific collider from a 3D body.
    ///
    /// Returns `false` if the collider was not found or the world is not
    /// initialised.
    ///
    /// # Arguments
    /// * `entity_index` — ECS entity slot index.
    /// * `collider_id`  — Stable ID that was passed when the collider was created.
    #[cfg(feature = "physics3d")]
    pub fn physics3d_remove_collider(&mut self, entity_index: u32, collider_id: u32) -> bool {
        if let Some(ref mut world) = self.physics3d_world {
            world.remove_collider(entity_index, collider_id)
        } else {
            false
        }
    }

    /// Set the next kinematic position and orientation of a 3D body.
    ///
    /// Only affects bodies of kind `2` (KinematicPositionBased). Rapier
    /// interpolates from the current to the next position when computing
    /// collision response.
    ///
    /// Returns `false` if the entity has no registered body or the world is not
    /// initialised.
    ///
    /// # Arguments
    /// * `entity_index`    — ECS entity slot index.
    /// * `px/py/pz`        — Target world-space position.
    /// * `qx/qy/qz/qw`    — Target orientation as a unit quaternion (xyzw order).
    #[cfg(feature = "physics3d")]
    #[allow(clippy::too_many_arguments)]
    pub fn physics3d_set_kinematic_position(
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
        if let Some(ref mut world) = self.physics3d_world {
            world.set_kinematic_position(entity_index, px, py, pz, qx, qy, qz, qw)
        } else {
            false
        }
    }

    /// Apply a world-space angular (torque) impulse to a 3D body.
    ///
    /// Immediately changes the body's angular velocity. Wakes the body if
    /// sleeping. Returns `false` if the entity has no body or the world is
    /// not initialised.
    ///
    /// # Arguments
    /// * `entity_index` — ECS entity slot index.
    /// * `ax/ay/az`     — Angular impulse vector (N·m·s).
    #[cfg(feature = "physics3d")]
    pub fn physics3d_apply_angular_impulse(
        &mut self,
        entity_index: u32,
        ax: f32,
        ay: f32,
        az: f32,
    ) -> bool {
        if let Some(ref mut world) = self.physics3d_world {
            world.apply_angular_impulse(entity_index, ax, ay, az)
        } else {
            false
        }
    }

    /// Return the sensor state for a 3D collider as a packed `u64`.
    ///
    /// Bit layout: `bits 0–31 = contact_count (u32)`, `bit 32 = is_active (bool)`.
    /// Returns `0` if no state has been recorded or the world is not initialised.
    ///
    /// # Arguments
    /// * `entity_index` — ECS entity slot index.
    /// * `sensor_id`    — Stable collider ID used when the sensor was created.
    #[cfg(feature = "physics3d")]
    pub fn physics3d_get_sensor_state(&self, entity_index: u32, sensor_id: u32) -> u64 {
        if let Some(ref world) = self.physics3d_world {
            world.get_sensor_state(entity_index, sensor_id)
        } else {
            0
        }
    }

    /// Manually override the sensor state for a 3D collider.
    ///
    /// Normally sensor state is derived automatically from collision events
    /// during [`physics3d_step`]. Use this to reset or pre-populate state from
    /// the JavaScript side.
    ///
    /// # Arguments
    /// * `entity_index` — ECS entity slot index.
    /// * `sensor_id`    — Stable collider ID.
    /// * `is_active`    — Whether the sensor is currently overlapping.
    /// * `count`        — Number of concurrent overlapping contacts.
    #[cfg(feature = "physics3d")]
    pub fn physics3d_update_sensor_state(
        &mut self,
        entity_index: u32,
        sensor_id: u32,
        is_active: bool,
        count: u32,
    ) {
        if let Some(ref mut world) = self.physics3d_world {
            world.update_sensor_state(entity_index, sensor_id, is_active, count);
        }
    }

    /// Select the physics quality preset for the 3D simulation.
    ///
    /// | Preset | `u8` | Solver iters | Stabilization iters | CCD substeps |
    /// |--------|:----:|:------------:|:-------------------:|:------------:|
    /// | Low    | 0    | 2            | 1                   | 1            |
    /// | Medium | 1    | 4            | 2                   | 1            |
    /// | High   | 2    | 8            | 3                   | 2            |
    /// | Esport | 3    | 10           | 4                   | 4            |
    ///
    /// Any unrecognised value maps to `Medium`. No-op if the world is not
    /// initialised.
    ///
    /// # Arguments
    /// * `preset` — Quality level discriminant (0–3).
    #[cfg(feature = "physics3d")]
    pub fn physics3d_set_quality(&mut self, preset: u8) {
        if let Some(ref mut world) = self.physics3d_world {
            world.set_quality(preset);
        }
    }

    /// Enable or disable collision event coalescing for the 3D world.
    ///
    /// When enabled, duplicate `(entity_a, entity_b)` pairs generated within a
    /// single step are deduplicated before writing to the ring buffer. This
    /// reduces event volume at the cost of losing intermediate state transitions.
    ///
    /// No-op if the world is not initialised.
    ///
    /// # Arguments
    /// * `enabled` — `true` to enable coalescing, `false` to disable.
    #[cfg(feature = "physics3d")]
    pub fn physics3d_set_event_coalescing(&mut self, enabled: bool) {
        if let Some(ref mut world) = self.physics3d_world {
            world.set_event_coalescing(enabled);
        }
    }

    /// Return a raw pointer to the 3D collision event ring buffer.
    ///
    /// The buffer lives in WASM linear memory and remains valid for the
    /// lifetime of the module. JavaScript should wrap the result in a typed
    /// array view of length `physics3d_get_collision_event_count() * EVENT_STRIDE_3D`.
    ///
    /// Returns `0` if the world is not initialised.
    #[cfg(feature = "physics3d")]
    pub fn physics3d_get_collision_events_ptr(&self) -> usize {
        if let Some(ref world) = self.physics3d_world {
            world.get_collision_events_ptr()
        } else {
            0
        }
    }

    /// Return the number of 3D collision events written since the last step.
    ///
    /// Returns `0` if the world is not initialised.
    #[cfg(feature = "physics3d")]
    pub fn physics3d_get_collision_event_count(&self) -> u32 {
        if let Some(ref world) = self.physics3d_world {
            world.get_collision_event_count()
        } else {
            0
        }
    }

    /// Clear all pending 3D collision events.
    ///
    /// Call after JavaScript has finished reading the event buffer. The next
    /// [`physics3d_step`] call also implicitly clears the buffer.
    ///
    /// No-op if the world is not initialised.
    #[cfg(feature = "physics3d")]
    pub fn physics3d_consume_events(&mut self) {
        if let Some(ref mut world) = self.physics3d_world {
            world.consume_events();
        }
    }

    // === Engine Stats ===

    /// Get engine statistics as JSON string
    pub fn stats(&self) -> String {
        format!(
            r#"{{"entities":{}, "frame":{}, "elapsed":{:.3}}}"#,
            self.entity_manager.count_entities(),
            self.gameloop.frame_count(),
            self.gameloop.total_time()
        )
    }

    // === Bulk Query-Read API (Tier 1) ===

    /// Query entities that have ALL given component types and bulk-read one component type.
    ///
    /// Combines an archetype-cached query and a bulk component read into a **single** WASM
    /// boundary crossing, eliminating N per-entity crossings that dominate frame budgets at
    /// scale.  Uses the same archetype-based [`QuerySystem`] as [`query_entities_to_buffer`],
    /// so repeated queries with the same filter set are served from cache.
    ///
    /// # Arguments
    /// * `component_type_ids` – Entity must possess ALL of these component type IDs.
    ///   Passing an empty slice returns `[0, 0]` immediately.
    /// * `read_type_id`       – The component type whose bytes are packed into `out_buf`.
    /// * `out_slots`          – Caller-provided `Uint32Array` (len ≥ expected entity count).
    ///   Filled with matching entity slot indices on return.
    /// * `out_gens`           – Caller-provided `Uint32Array` (same length as `out_slots`).
    ///   Filled with matching entity generation counters on return.
    /// * `out_buf`            – Caller-provided `Uint8Array` for packed component data.
    ///
    /// # Returns
    /// A two-element `Vec<u32>` `[entity_count, bytes_written]`.  After the call,
    /// `out_slots[0..entity_count]` and `out_gens[0..entity_count]` identify the matched
    /// entities, and `out_buf[0..bytes_written]` contains their packed component data.
    ///
    /// If `entity_count == BULK_MAX_ENTITIES` (10 000), the result was truncated — the scene
    /// has more matching entities than the buffer can hold.
    ///
    /// # Performance
    /// One WASM boundary crossing regardless of entity count.
    /// Query results are archetype-cached; subsequent frames with the same filter are fast.
    pub fn query_read_bulk(
        &mut self,
        component_type_ids: &[u32],
        read_type_id: u32,
        out_slots: &mut [u32],
        out_gens: &mut [u32],
        out_buf: &mut [u8],
    ) -> Vec<u32> {
        if component_type_ids.is_empty() {
            return vec![0, 0];
        }

        // Step 1: archetype-based query (cached, same path as query_entities_to_buffer)
        let types: Vec<crate::ecs::component::ComponentTypeId> = component_type_ids
            .iter()
            .map(|&id| crate::ecs::component::ComponentTypeId::from_raw(id))
            .collect();
        let query_id = QueryId::new(types, self.storage.registry());
        let results = self.query_system.query(&self.storage, query_id);
        let entities = results.entities();

        // Step 2: fill out_slots / out_gens and bulk-read component data.
        // `results` is a cloned QueryResult (owned value, not borrowing self),
        // so reborrowing self here is safe despite the earlier &mut self.query_system.
        let (count, bytes) = crate::bulk_ops::fill_and_read_bulk(
            self,
            entities,
            read_type_id,
            out_slots,
            out_gens,
            out_buf,
        );
        vec![count, bytes]
    }

    /// Write back component data for a previously-queried entity set in one WASM call.
    ///
    /// Pass the `out_slots` and `out_gens` filled by [`query_read_bulk`] together with
    /// updated packed component bytes.  Dead entities (stale generation) are silently skipped.
    ///
    /// # Arguments
    /// * `slots`          – Entity slot indices (from a prior `query_read_bulk` call).
    /// * `gens`           – Per-slot generation counters (from a prior `query_read_bulk` call).
    /// * `write_type_id`  – Component type ID to write.
    /// * `data`           – Packed component bytes; total length must equal
    ///   `slots.len() × component_size_bytes`.
    ///
    /// # Performance
    /// One WASM boundary crossing regardless of entity count.
    pub fn query_write_bulk(
        &mut self,
        slots: &[u32],
        gens: &[u32],
        write_type_id: u32,
        data: &[u8],
    ) {
        self.set_components_bulk(slots, gens, write_type_id, data);
    }

    // === Bulk Physics2D API (Tier 2) ===

    /// Bulk-sync Rapier physics2D → ECS transforms.
    ///
    /// One WASM boundary crossing per frame instead of N per-entity crossings.
    /// Only available when compiled with `features = ["physics2d"]`.
    ///
    /// See [`crate::bulk_ops_physics2d::physics2d_bulk_sync_from_rapier`] for details.
    #[cfg(feature = "physics2d")]
    #[wasm_bindgen]
    pub fn physics2d_bulk_sync_from_rapier(
        &mut self,
        transform_type_id: u32,
        out_slots: &mut [u32],
        out_gens: &mut [u32],
        out_buf: &mut [u8],
    ) -> Vec<u32> {
        let (count, bytes) = crate::bulk_ops_physics2d::physics2d_bulk_sync_from_rapier(
            self,
            transform_type_id,
            out_slots,
            out_gens,
            out_buf,
        );
        vec![count, bytes]
    }

    /// Bulk-sync ECS transforms → Rapier physics2D.
    ///
    /// One WASM boundary crossing per frame.
    /// Only available when compiled with `features = ["physics2d"]`.
    ///
    /// See [`crate::bulk_ops_physics2d::physics2d_bulk_sync_to_rapier`] for details.
    #[cfg(feature = "physics2d")]
    #[wasm_bindgen]
    pub fn physics2d_bulk_sync_to_rapier(
        &mut self,
        slots: &[u32],
        gens: &[u32],
        transform_type_id: u32,
        data: &[u8],
    ) {
        crate::bulk_ops_physics2d::physics2d_bulk_sync_to_rapier(
            self, slots, gens, transform_type_id, data,
        );
    }

    /// Bulk-apply impulses to physics2D entities.
    ///
    /// One WASM boundary crossing per frame.
    /// Only available when compiled with `features = ["physics2d"]`.
    ///
    /// See [`crate::bulk_ops_physics2d::physics2d_bulk_apply_impulse`] for details.
    #[cfg(feature = "physics2d")]
    #[wasm_bindgen]
    pub fn physics2d_bulk_apply_impulse(
        &mut self,
        slots: &[u32],
        gens: &[u32],
        rigidbody_type_id: u32,
        impulse_data: &[u8],
    ) {
        crate::bulk_ops_physics2d::physics2d_bulk_apply_impulse(
            self, slots, gens, rigidbody_type_id, impulse_data,
        );
    }

    // === Bulk Physics3D API (Tier 3) ===

    /// Bulk-sync Rapier3D → ECS Transform3D (7×f32 = 28 bytes per entity).
    ///
    /// One WASM boundary crossing per frame instead of N per-entity crossings.
    /// Only available when compiled with `features = ["physics3d"]`.
    ///
    /// See [`crate::bulk_ops_physics3d::physics3d_bulk_sync_from_rapier`] for details.
    #[cfg(feature = "physics3d")]
    #[wasm_bindgen]
    pub fn physics3d_bulk_sync_from_rapier(
        &mut self,
        transform_type_id: u32,
        out_slots: &mut [u32],
        out_gens: &mut [u32],
        out_buf: &mut [u8],
    ) -> Vec<u32> {
        let (count, bytes) = crate::bulk_ops_physics3d::physics3d_bulk_sync_from_rapier(
            self,
            transform_type_id,
            out_slots,
            out_gens,
            out_buf,
        );
        vec![count, bytes]
    }

    /// Bulk-sync ECS Transform3D → Rapier3D (7×f32 = 28 bytes per entity).
    ///
    /// One WASM boundary crossing per frame.
    /// Only available when compiled with `features = ["physics3d"]`.
    ///
    /// See [`crate::bulk_ops_physics3d::physics3d_bulk_sync_to_rapier`] for details.
    #[cfg(feature = "physics3d")]
    #[wasm_bindgen]
    pub fn physics3d_bulk_sync_to_rapier(
        &mut self,
        slots: &[u32],
        gens: &[u32],
        transform_type_id: u32,
        data: &[u8],
    ) {
        crate::bulk_ops_physics3d::physics3d_bulk_sync_to_rapier(
            self, slots, gens, transform_type_id, data,
        );
    }

    /// Bulk-apply 3D impulses `[fx, fy, fz]` (12 bytes/entity) to physics3D entities.
    ///
    /// One WASM boundary crossing per frame.
    /// Only available when compiled with `features = ["physics3d"]`.
    ///
    /// See [`crate::bulk_ops_physics3d::physics3d_bulk_apply_impulse`] for details.
    #[cfg(feature = "physics3d")]
    #[wasm_bindgen]
    pub fn physics3d_bulk_apply_impulse(
        &mut self,
        slots: &[u32],
        gens: &[u32],
        rigidbody_type_id: u32,
        impulse_data: &[u8],
    ) {
        crate::bulk_ops_physics3d::physics3d_bulk_apply_impulse(
            self, slots, gens, rigidbody_type_id, impulse_data,
        );
    }

    // === Bulk Entity Operations ===

    /// Destroy multiple entities in a single call.
    ///
    /// # Arguments
    /// * `indices` - Flat array of entity indices to destroy (obtained from `create_entity`).
    ///
    /// # Description
    /// This method efficiently removes multiple entities from the engine in a single
    /// WASM boundary crossing. Entities that are already destroyed are silently skipped.
    /// This is useful for batch cleanup operations or clearing many entities at once.
    ///
    /// # Examples
    /// ```js
    /// engine.bulk_destroy(new Uint32Array([3, 7, 12]));
    /// ```
    #[wasm_bindgen]
    pub fn bulk_destroy(&mut self, indices: &[u32]) {
        for &index in indices {
            let gen = self.get_entity_generation(index);
            if self.is_alive(index, gen) {
                let entity = EntityId::from_parts(index, gen);
                self.transform_system.remove_transform(entity);
                self.delete_entity(index, gen);
            }
        }
    }

    /// Create N entities, each with a transform, and return their indices.
    ///
    /// # Arguments
    /// * `positions` - Flat `[x0, y0, x1, y1, ...]` array — length must be `2 * N`.
    /// * `rotations` - Flat `[r0, r1, ...]` array — length must be `N`. Pass empty slice for all-zero.
    ///
    /// # Returns
    /// `Vec<u32>` (exposed as `Uint32Array` to JavaScript) of N entity indices in the same order as `positions`.
    ///
    /// # Description
    /// This method efficiently spawns multiple entities with transforms in a single operation.
    /// Each entity is created with a position (x, y) and an optional rotation. If the rotations
    /// array is shorter than N, remaining entities use rotation 0.0. Scale is always set to (1, 1).
    ///
    /// # Examples
    /// ```js
    /// const ids = engine.bulk_spawn_with_transforms(
    ///   new Float32Array([0, 0, 16, 0, 32, 0]),
    ///   new Float32Array([0, 0, 0]),
    /// );
    /// // Creates 3 entities at (0, 0), (16, 0), (32, 0) with rotations 0, 0, 0
    /// ```
    #[wasm_bindgen]
    pub fn bulk_spawn_with_transforms(
        &mut self,
        positions: &[f32],
        rotations: &[f32],
    ) -> Vec<u32> {
        let count = positions.len() / 2;
        let mut indices = Vec::with_capacity(count);

        for i in 0..count {
            let js_id = self.create_entity();
            let index = js_id.index();
            let x = positions[i * 2];
            let y = positions[i * 2 + 1];
            let rotation = if i < rotations.len() {
                rotations[i]
            } else {
                0.0
            };

            let entity = EntityId::from_parts(index, self.get_entity_generation(index));
            self.transform_system.add_transform(
                entity,
                Transform {
                    position: Vec2::new(x, y),
                    rotation,
                    scale: Vec2::one(),
                },
            );

            indices.push(index);
        }

        indices
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_query_entities_to_buffer() {
        let mut engine = Engine::new(100);
        let t0 = engine.register_component_type();
        let t1 = engine.register_component_type();

        let e0 = engine.create_entity();
        let e1 = engine.create_entity();
        let e2 = engine.create_entity();

        // Add components to entities
        // e0 has t0 and t1
        engine.add_component(e0.index(), e0.generation(), t0, &[0u8; 4]);
        engine.add_component(e0.index(), e0.generation(), t1, &[0u8; 4]);
        // e1 has t0 only
        engine.add_component(e1.index(), e1.generation(), t0, &[0u8; 4]);
        // e2 has t1 only
        engine.add_component(e2.index(), e2.generation(), t1, &[0u8; 4]);

        // Query for t0
        let count = engine.query_entities_to_buffer(&[t0]);
        assert_eq!(count, 2);

        let ptr = engine.get_query_result_ptr();
        unsafe {
            let slice = std::slice::from_raw_parts(ptr, count as usize);
            assert!(slice.contains(&e0.index()));
            assert!(slice.contains(&e1.index()));
            assert!(!slice.contains(&e2.index()));
        }

        // Query for both t0 and t1
        let count = engine.query_entities_to_buffer(&[t0, t1]);
        assert_eq!(count, 1);
        unsafe {
            let slice = std::slice::from_raw_parts(ptr, count as usize);
            assert_eq!(slice[0], e0.index());
        }
    }

    #[test]
    fn test_query_entities_to_buffer_cap() {
        let mut engine = Engine::new(11000);
        let t0 = engine.register_component_type();

        for _ in 0..11000 {
            let e = engine.create_entity();
            engine.add_component(e.index(), e.generation(), t0, &[0u8; 4]);
        }

        let count = engine.query_entities_to_buffer(&[t0]);
        assert_eq!(count, 10_000); // Capped at 10,000
    }

    #[cfg(feature = "physics3d")]
    #[test]
    fn test_physics3d_rebuild_mesh_collider_binding_happy_path() {
        let mut engine = Engine::new(64);
        engine.physics3d_init(0.0, -9.81, 0.0, 64);
        engine.physics3d_add_body(0, 0.0, 0.0, 0.0, 0, 1.0, 0.0, 0.0); // Fixed body

        let verts: Vec<f32> = vec![0.0,0.0,0.0, 1.0,0.0,0.0, 0.0,1.0,0.0];
        let idxs: Vec<u32> = vec![0, 1, 2];
        assert!(engine.physics3d_add_mesh_collider(0, &verts, &idxs, 0.0, 0.0, 0.0, false, 0.5, 0.0, 0xFFFF_FFFF, 0xFFFF_FFFF, 42));

        let new_verts: Vec<f32> = vec![0.0,0.0,0.0, 3.0,0.0,0.0, 0.0,3.0,0.0];
        let new_idxs: Vec<u32> = vec![0, 1, 2];
        assert!(engine.physics3d_rebuild_mesh_collider(0, 42, &new_verts, &new_idxs, 0.0, 0.0, 0.0, false, 0.5, 0.0, 0xFFFF_FFFF, 0xFFFF_FFFF));
    }

    #[cfg(feature = "physics3d")]
    #[test]
    fn test_physics3d_rebuild_mesh_collider_binding_returns_false_when_no_world() {
        let mut engine = Engine::new(64);
        // physics3d not initialised.
        let verts: Vec<f32> = vec![0.0,0.0,0.0, 1.0,0.0,0.0, 0.0,1.0,0.0];
        let idxs: Vec<u32> = vec![0, 1, 2];
        assert!(!engine.physics3d_rebuild_mesh_collider(0, 1, &verts, &idxs, 0.0, 0.0, 0.0, false, 0.5, 0.0, 0xFFFF_FFFF, 0xFFFF_FFFF));
    }
}
