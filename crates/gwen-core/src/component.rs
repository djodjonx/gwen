//! Component storage
//!
//! Stores and retrieves component data using Structure of Arrays (SoA) layout for cache efficiency.

use std::collections::HashMap;
use std::any::TypeId;

/// Unique identifier for a component type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ComponentTypeId(u32);

impl ComponentTypeId {
    /// Get the raw ID value
    pub fn raw(self) -> u32 {
        self.0
    }

    /// Create from raw ID (for testing)
    pub fn from_raw(raw: u32) -> Self {
        ComponentTypeId(raw)
    }
}

/// Registry for component types
pub struct ComponentRegistry {
    next_id: u32,
    type_sizes: HashMap<ComponentTypeId, usize>,
    type_names: HashMap<ComponentTypeId, String>,
    rust_type_ids: HashMap<TypeId, ComponentTypeId>,
}

impl ComponentRegistry {
    /// Create a new component registry
    pub fn new() -> Self {
        ComponentRegistry {
            next_id: 0,
            type_sizes: HashMap::new(),
            type_names: HashMap::new(),
            rust_type_ids: HashMap::new(),
        }
    }

    /// Register a new component type
    pub fn register<T: 'static>(&mut self) -> ComponentTypeId {
        let rust_type_id = TypeId::of::<T>();

        if let Some(&id) = self.rust_type_ids.get(&rust_type_id) {
            return id;
        }

        let id = ComponentTypeId(self.next_id);
        self.next_id += 1;

        self.type_sizes.insert(id, std::mem::size_of::<T>());
        self.type_names.insert(id, std::any::type_name::<T>().to_string());
        self.rust_type_ids.insert(rust_type_id, id);

        id
    }

    /// Get size of component type
    pub fn size(&self, type_id: ComponentTypeId) -> Option<usize> {
        self.type_sizes.get(&type_id).copied()
    }

    /// Get name of component type
    pub fn name(&self, type_id: ComponentTypeId) -> Option<&str> {
        self.type_names.get(&type_id).map(|s| s.as_str())
    }
}

impl Default for ComponentRegistry {
    fn default() -> Self {
        Self::new()
    }
}

/// Stores components of one type in a Structure of Arrays layout.
///
/// Uses a `HashMap<entity_id, slot_index>` for O(1) lookups instead of
/// scanning the entity list (the previous O(n) `Vec::contains` approach).
pub struct ComponentColumn {
    entity_ids: Vec<u32>,
    /// Maps entity_id → slot index in `data` for O(1) access.
    index_map: HashMap<u32, usize>,
    data: Vec<u8>,
    type_id: ComponentTypeId,
    element_size: usize,
}

impl ComponentColumn {
    /// Create a new component column
    pub fn new(type_id: ComponentTypeId, element_size: usize) -> Self {
        ComponentColumn {
            entity_ids: Vec::new(),
            index_map: HashMap::new(),
            data: Vec::new(),
            type_id,
            element_size,
        }
    }

    /// Add a component for an entity – O(1)
    pub fn add(&mut self, entity_id: u32, data: &[u8]) -> bool {
        if self.index_map.contains_key(&entity_id) {
            return false; // Entity already has this component
        }

        assert_eq!(
            data.len(),
            self.element_size,
            "Data size mismatch for component type {:?}",
            self.type_id
        );

        let slot = self.entity_ids.len();
        self.index_map.insert(entity_id, slot);
        self.entity_ids.push(entity_id);
        self.data.extend_from_slice(data);
        true
    }

    /// Get component data for an entity – O(1)
    pub fn get(&self, entity_id: u32) -> Option<&[u8]> {
        self.index_map.get(&entity_id).map(|&idx| {
            let start = idx * self.element_size;
            &self.data[start..start + self.element_size]
        })
    }

    /// Get mutable component data for an entity – O(1)
    pub fn get_mut(&mut self, entity_id: u32) -> Option<&mut [u8]> {
        self.index_map.get(&entity_id).copied().map(|idx| {
            let start = idx * self.element_size;
            &mut self.data[start..start + self.element_size]
        })
    }

    /// Remove component from entity – O(1) via swap-remove
    pub fn remove(&mut self, entity_id: u32) -> bool {
        let idx = match self.index_map.remove(&entity_id) {
            Some(i) => i,
            None => return false,
        };

        let last_slot = self.entity_ids.len() - 1;

        if idx == last_slot {
            // Removing the last element – simple pop
            self.entity_ids.pop();
            let start = idx * self.element_size;
            self.data.truncate(start);
        } else {
            // Swap with last element so we avoid O(n) shifts
            let last_entity = self.entity_ids[last_slot];
            self.entity_ids.swap_remove(idx);

            // Swap the data bytes of idx and last_slot
            let src = last_slot * self.element_size;
            let dst = idx * self.element_size;
            for i in 0..self.element_size {
                self.data.swap(dst + i, src + i);
            }
            self.data.truncate(last_slot * self.element_size);

            // Update index_map for the moved entity
            self.index_map.insert(last_entity, idx);
        }

        true
    }

    /// Check if entity has this component – O(1)
    pub fn has(&self, entity_id: u32) -> bool {
        self.index_map.contains_key(&entity_id)
    }

    /// Get iterator over entity IDs with this component
    pub fn entity_ids(&self) -> impl Iterator<Item = u32> + '_ {
        self.entity_ids.iter().copied()
    }

    /// Get count of entities with this component
    pub fn count(&self) -> u32 {
        self.entity_ids.len() as u32
    }
}

/// Stores all components for all entities using Structure of Arrays
pub struct ComponentStorage {
    columns: HashMap<ComponentTypeId, ComponentColumn>,
    registry: ComponentRegistry,
}

impl ComponentStorage {
    /// Create a new component storage
    pub fn new() -> Self {
        ComponentStorage {
            columns: HashMap::new(),
            registry: ComponentRegistry::new(),
        }
    }

    /// Register a raw component type by numeric ID and element size.
    ///
    /// Used by the WASM/JS API where Rust's `TypeId` is unavailable.
    /// Idempotent: calling twice with the same `id` is a no-op.
    pub fn register_raw(&mut self, id: ComponentTypeId, element_size: usize) {
        self.columns
            .entry(id)
            .or_insert_with(|| ComponentColumn::new(id, element_size));
    }

    /// Register a new component type
    pub fn register_component_type<T: 'static>(&mut self) -> ComponentTypeId {
        self.registry.register::<T>()
    }

    /// Add a component to an entity.
    ///
    /// Works for both Rust-registered types (via `register_component_type`)
    /// and raw JS types (via `register_raw`).  For raw types the element
    /// size is inferred from `data.len()`.
    pub fn add_component(&mut self, entity_id: u32, type_id: ComponentTypeId, data: &[u8]) -> bool {
        // Try Rust registry first, fall back to data.len() for raw JS types
        let element_size = self.registry.size(type_id).unwrap_or(data.len());

        let column = self.columns
            .entry(type_id)
            .or_insert_with(|| ComponentColumn::new(type_id, element_size));

        column.add(entity_id, data)
    }

    /// Get component data from entity
    pub fn get_component(&self, entity_id: u32, type_id: ComponentTypeId) -> Option<&[u8]> {
        self.columns
            .get(&type_id)
            .and_then(|col| col.get(entity_id))
    }

    /// Get mutable component data from entity
    pub fn get_component_mut(&mut self, entity_id: u32, type_id: ComponentTypeId) -> Option<&mut [u8]> {
        self.columns
            .get_mut(&type_id)
            .and_then(|col| col.get_mut(entity_id))
    }

    /// Remove component from entity
    pub fn remove_component(&mut self, entity_id: u32, type_id: ComponentTypeId) -> bool {
        self.columns
            .get_mut(&type_id)
            .map(|col| col.remove(entity_id))
            .unwrap_or(false)
    }

    /// Check if entity has component
    pub fn has_component(&self, entity_id: u32, type_id: ComponentTypeId) -> bool {
        self.columns
            .get(&type_id)
            .map(|col| col.has(entity_id))
            .unwrap_or(false)
    }

    /// Get registry reference
    pub fn registry(&self) -> &ComponentRegistry {
        &self.registry
    }

    /// Get column for a component type
    pub fn column(&self, type_id: ComponentTypeId) -> Option<&ComponentColumn> {
        self.columns.get(&type_id)
    }
}

impl Default for ComponentStorage {
    fn default() -> Self {
        Self::new()
    }
}

/// Type-safe component handle
pub struct ComponentHandle<T> {
    type_id: ComponentTypeId,
    _marker: std::marker::PhantomData<T>,
}

impl<T: 'static> ComponentHandle<T> {
    /// Create a new component handle and register the type
    pub fn new(storage: &mut ComponentStorage) -> Self {
        let type_id = storage.register_component_type::<T>();
        ComponentHandle {
            type_id,
            _marker: std::marker::PhantomData,
        }
    }

    /// Get the component type ID
    pub fn type_id(&self) -> ComponentTypeId {
        self.type_id
    }

    /// Add component to entity
    pub fn add(&self, storage: &mut ComponentStorage, entity_id: u32, component: T) -> bool {
        let bytes = unsafe {
            std::slice::from_raw_parts(
                &component as *const _ as *const u8,
                std::mem::size_of::<T>(),
            )
        };
        storage.add_component(entity_id, self.type_id, bytes)
    }

    /// Get component from entity
    pub fn get<'a>(&self, storage: &'a ComponentStorage, entity_id: u32) -> Option<&'a T> {
        storage
            .get_component(entity_id, self.type_id)
            .map(|bytes| unsafe { &*(bytes.as_ptr() as *const T) })
    }

    /// Get mutable component from entity
    pub fn get_mut<'a>(&self, storage: &'a mut ComponentStorage, entity_id: u32) -> Option<&'a mut T> {
        storage
            .get_component_mut(entity_id, self.type_id)
            .map(|bytes| unsafe { &mut *(bytes.as_mut_ptr() as *mut T) })
    }

    /// Remove component from entity
    pub fn remove(&self, storage: &mut ComponentStorage, entity_id: u32) -> bool {
        storage.remove_component(entity_id, self.type_id)
    }

    /// Check if entity has component
    pub fn has(&self, storage: &ComponentStorage, entity_id: u32) -> bool {
        storage.has_component(entity_id, self.type_id)
    }
}

