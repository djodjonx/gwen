//! wasm-bindgen exports
//!
//! Exports for JavaScript interop via wasm-bindgen.

use wasm_bindgen::prelude::*;
use crate::entity::{EntityManager, EntityId};

/// Main engine exported to JavaScript
#[wasm_bindgen]
pub struct Engine {
    entity_manager: EntityManager,
}

#[wasm_bindgen]
impl Engine {
    /// Create a new engine instance
    #[wasm_bindgen(constructor)]
    pub fn new(max_entities: u32) -> Engine {
        Engine {
            entity_manager: EntityManager::new(max_entities),
        }
    }

    /// Create a new entity
    pub fn create_entity(&mut self) -> u32 {
        self.entity_manager.create_entity().index()
    }

    /// Delete an entity by ID
    pub fn delete_entity(&mut self, entity_id: u32) -> bool {
        // Reconstruct EntityId from index (simplified for now)
        self.entity_manager.delete_entity(EntityId::from_parts(entity_id, 0))
    }

    /// Get count of live entities
    pub fn count_entities(&self) -> u32 {
        self.entity_manager.count_entities()
    }

    /// Check if entity is alive
    pub fn is_alive(&self, entity_id: u32) -> bool {
        self.entity_manager.is_alive(EntityId::from_parts(entity_id, 0))
    }
}

