//! wasm-bindgen exports
//!
//! Exports for JavaScript interop via wasm-bindgen.

use crate::component::{ComponentStorage, ComponentTypeId};
use crate::entity::{EntityId, EntityManager};
use crate::gameloop::GameLoop;
use crate::query::QuerySystem;
use wasm_bindgen::prelude::*;

/// Main engine exported to JavaScript
#[wasm_bindgen]
pub struct Engine {
    entity_manager: EntityManager,
    component_storage: ComponentStorage,
    #[allow(dead_code)] // Reserved for future JS query API
    query_system: QuerySystem,
    gameloop: GameLoop,
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
        }
    }

    // === Entity API ===

    /// Create a new entity
    pub fn create_entity(&mut self) -> u32 {
        self.entity_manager.create_entity().index()
    }

    /// Delete an entity by ID
    pub fn delete_entity(&mut self, entity_id: u32) -> bool {
        if self
            .entity_manager
            .is_alive(EntityId::from_parts(entity_id, 0))
        {
            self.entity_manager
                .delete_entity(EntityId::from_parts(entity_id, 0))
        } else {
            false
        }
    }

    /// Get count of live entities
    pub fn count_entities(&self) -> u32 {
        self.entity_manager.count_entities()
    }

    /// Check if entity is alive
    pub fn is_alive(&self, entity_id: u32) -> bool {
        self.entity_manager
            .is_alive(EntityId::from_parts(entity_id, 0))
    }

    // === Component API ===

    /// Register a component type (returns type ID)
    pub fn register_component_type(&mut self) -> u32 {
        let type_id = self.component_storage.register_component_type::<u32>();
        type_id.raw()
    }

    /// Check if entity has component
    pub fn has_component(&self, entity_id: u32, component_type_id: u32) -> bool {
        let type_id = ComponentTypeId::from_raw(component_type_id);
        self.component_storage.has_component(entity_id, type_id)
    }

    // === Game Loop API ===

    /// Update game loop (call every frame)
    pub fn tick(&mut self, delta_ms: f32) {
        let delta_seconds = delta_ms / 1000.0;
        self.gameloop.tick(delta_seconds);
    }

    /// Get current frame number
    pub fn frame_count(&self) -> u64 {
        self.gameloop.frame_count()
    }

    /// Get delta time for current frame
    pub fn delta_time(&self) -> f32 {
        self.gameloop.delta_time()
    }

    /// Get total elapsed time
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
