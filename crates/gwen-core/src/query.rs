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

    /// Update entity archetype when components change.
    ///
    /// Only cached queries that could be affected by this entity's old or
    /// new archetype are invalidated (partial invalidation).
    pub fn update_entity_archetype(&mut self, entity_id: u32, components: Vec<ComponentTypeId>) {
        let new_archetype = ArchetypeId::new(components);

        // Collect the old archetype (if any) before mutating the map
        let old_archetype = self.entity_archetypes.get(&entity_id).cloned();

        self.entity_archetypes.insert(entity_id, new_archetype.clone());

        // Partial cache invalidation – only evict queries that intersect
        // with the old or new archetype of the changed entity.
        self.query_cache.retain(|query_id, _| {
            let touches_old = old_archetype
                .as_ref()
                .map(|old| query_id.matches(old))
                .unwrap_or(false);
            let touches_new = query_id.matches(&new_archetype);
            !touches_old && !touches_new
        });
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

    /// Remove entity from tracking (when deleted).
    ///
    /// Performs partial invalidation – only queries that matched this
    /// entity's archetype need to be evicted.
    pub fn remove_entity(&mut self, entity_id: u32) {
        if let Some(old_archetype) = self.entity_archetypes.remove(&entity_id) {
            self.query_cache
                .retain(|query_id, _| !query_id.matches(&old_archetype));
        }
    }

    /// Get entity archetype
    pub fn entity_archetype(&self, entity_id: u32) -> Option<&ArchetypeId> {
        self.entity_archetypes.get(&entity_id)
    }

    /// Get count of tracked entities
    pub fn entity_count(&self) -> usize {
        self.entity_archetypes.len()
    }

    /// Get count of cached queries (useful for benchmarks / debugging)
    pub fn cache_size(&self) -> usize {
        self.query_cache.len()
    }
}

impl Default for QuerySystem {
    fn default() -> Self {
        Self::new()
    }
}

