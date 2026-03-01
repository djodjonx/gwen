//! wasm-bindgen exports
//!
//! Exports for JavaScript interop via wasm-bindgen.
//!
//! # Stale-ID safety
//! All entity operations take both `index` and `generation` so that JS
//! cannot accidentally use a recycled slot (the classic stale-ID bug).
//! `create_entity` returns a `JsEntityId` struct exposing both fields.

use crate::component::{ComponentStorage, ComponentTypeId};
use crate::entity::{EntityId, EntityManager};
use crate::gameloop::GameLoop;
use crate::query::{QueryId, QuerySystem};
use wasm_bindgen::prelude::*;

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
    entity_manager: EntityManager,
    component_storage: ComponentStorage,
    query_system: QuerySystem,
    gameloop: GameLoop,
    /// Monotonically increasing counter used by `register_component_type`.
    /// Each call returns a fresh ID regardless of the underlying Rust type,
    /// because JS does not have Rust's `TypeId` concept.
    next_js_type_id: u32,
}

#[wasm_bindgen]
impl Engine {
    /// Create a new engine instance
    #[wasm_bindgen(constructor)]
    pub fn new(max_entities: u32) -> Engine {
        Engine {
            entity_manager: EntityManager::new(max_entities),
            component_storage: ComponentStorage::new(),
            query_system: QuerySystem::new(),
            gameloop: GameLoop::new(60),
            next_js_type_id: 0,
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
        self.entity_manager.delete_entity(id)
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
        self.component_storage.upsert_js(index, type_id, data);
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
        self.component_storage.remove_component(index, type_id)
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
        self.component_storage.has_component(index, type_id)
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
        self.component_storage
            .get_component(index, type_id)
            .map(|bytes| bytes.to_vec())
            .unwrap_or_default()
    }

    // === Query API ===

    /// Update the archetype of an entity after component changes.
    /// Pass the full list of component type IDs currently on the entity.
    pub fn update_entity_archetype(&mut self, index: u32, component_type_ids: &[u32]) {
        let types: Vec<ComponentTypeId> = component_type_ids
            .iter()
            .map(|&id| ComponentTypeId::from_raw(id))
            .collect();
        self.query_system.update_entity_archetype(index, types);
    }

    /// Get the current generation for a slot index.
    /// Returns u32::MAX if the index is out of bounds.
    /// Used by the TS bridge to reconstruct packed EntityIds from query results.
    pub fn get_entity_generation(&self, index: u32) -> u32 {
        self.entity_manager.get_generation(index).unwrap_or(u32::MAX)
    }

    /// Query entities that have ALL the listed component types.
    /// Returns a flat `Uint32Array` of entity indices.
    pub fn query_entities(&mut self, component_type_ids: &[u32]) -> Vec<u32> {
        let types: Vec<ComponentTypeId> = component_type_ids
            .iter()
            .map(|&id| ComponentTypeId::from_raw(id))
            .collect();
        let query_id = QueryId::new(types);
        self.query_system.query(query_id).entities().to_vec()
    }

    // === Game Loop API ===

    /// Update game loop (call every frame with delta in milliseconds)
    pub fn tick(&mut self, delta_ms: f32) {
        let delta_seconds = delta_ms / 1000.0;
        self.gameloop.tick(delta_seconds);
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
}
