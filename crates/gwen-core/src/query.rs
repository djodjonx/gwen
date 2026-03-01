//! Query system
//!
//! Efficient archetype-based queries for entity iteration.

use crate::component::ComponentTypeId;
use std::collections::HashMap;

/// Unique identifier for an archetype (set of component types)
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ArchetypeId {
    components: Vec<ComponentTypeId>,
}

impl ArchetypeId {
    /// Create an archetype from component types (automatically sorted)
    pub fn new(mut components: Vec<ComponentTypeId>) -> Self {
        components.sort_by_key(|c| c.raw());
        ArchetypeId { components }
    }

    /// Get the component types in this archetype
    pub fn components(&self) -> &[ComponentTypeId] {
        &self.components
    }

    /// Get count of components in this archetype
    pub fn len(&self) -> usize {
        self.components.len()
    }

    /// Check if archetype is empty
    pub fn is_empty(&self) -> bool {
        self.components.is_empty()
    }
}

/// Query identifier - specifies which components we want
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct QueryId {
    required: Vec<ComponentTypeId>,
}

impl QueryId {
    /// Create a query from required component types
    pub fn new(mut required: Vec<ComponentTypeId>) -> Self {
        required.sort_by_key(|c| c.raw());
        required.dedup();
        QueryId { required }
    }

    /// Get the required component types
    pub fn required(&self) -> &[ComponentTypeId] {
        &self.required
    }

    /// Check if an archetype matches this query
    pub fn matches(&self, archetype: &ArchetypeId) -> bool {
        // Archetype must contain all required components
        self.required
            .iter()
            .all(|req| archetype.components.contains(req))
    }

    /// Get count of required components
    pub fn len(&self) -> usize {
        self.required.len()
    }

    /// Check if query is empty
    pub fn is_empty(&self) -> bool {
        self.required.is_empty()
    }
}

/// Result of a query - matched entities
#[derive(Debug, Clone)]
pub struct QueryResult {
    entity_ids: Vec<u32>,
    query_id: QueryId,
}

impl QueryResult {
    /// Create empty query result
    pub fn new(query_id: QueryId) -> Self {
        QueryResult {
            entity_ids: Vec::new(),
            query_id,
        }
    }

    /// Add matched entity
    pub fn add_entity(&mut self, entity_id: u32) {
        self.entity_ids.push(entity_id);
    }

    /// Get entity IDs
    pub fn entities(&self) -> &[u32] {
        &self.entity_ids
    }

    /// Get count of matched entities
    pub fn len(&self) -> usize {
        self.entity_ids.len()
    }

    /// Check if result is empty
    pub fn is_empty(&self) -> bool {
        self.entity_ids.is_empty()
    }

    /// Iterate matched entities
    pub fn iter(&self) -> impl Iterator<Item = u32> + '_ {
        self.entity_ids.iter().copied()
    }

    /// Get the query ID
    pub fn query_id(&self) -> &QueryId {
        &self.query_id
    }
}

/// Query system - tracks entity archetypes and executes queries
pub struct QuerySystem {
    entity_archetypes: HashMap<u32, ArchetypeId>,
    query_cache: HashMap<QueryId, QueryResult>,
}

impl QuerySystem {
    /// Create a new query system
    pub fn new() -> Self {
        QuerySystem {
            entity_archetypes: HashMap::new(),
            query_cache: HashMap::new(),
        }
    }

    /// Update entity archetype when components change
    pub fn update_entity_archetype(&mut self, entity_id: u32, components: Vec<ComponentTypeId>) {
        let archetype = ArchetypeId::new(components);
        self.entity_archetypes.insert(entity_id, archetype);
        self.clear_cache(); // Invalidate queries
    }

    /// Execute a query
    pub fn query(&mut self, query_id: QueryId) -> QueryResult {
        // Check cache first
        if let Some(cached) = self.query_cache.get(&query_id) {
            return cached.clone();
        }

        // Build query result
        let mut result = QueryResult::new(query_id.clone());

        for (entity_id, archetype) in &self.entity_archetypes {
            if query_id.matches(archetype) {
                result.add_entity(*entity_id);
            }
        }

        // Cache result
        self.query_cache.insert(query_id, result.clone());
        result
    }

    /// Remove entity from tracking (when deleted)
    pub fn remove_entity(&mut self, entity_id: u32) {
        self.entity_archetypes.remove(&entity_id);
        self.clear_cache();
    }

    /// Get entity archetype
    pub fn entity_archetype(&self, entity_id: u32) -> Option<&ArchetypeId> {
        self.entity_archetypes.get(&entity_id)
    }

    /// Clear query cache (called when archetypes change)
    fn clear_cache(&mut self) {
        self.query_cache.clear();
    }

    /// Get count of tracked entities
    pub fn entity_count(&self) -> usize {
        self.entity_archetypes.len()
    }
}

impl Default for QuerySystem {
    fn default() -> Self {
        Self::new()
    }
}

